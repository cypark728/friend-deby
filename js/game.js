(() => {
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const store = {
  get(k, d){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
};

const COLORS = ['#e8473f','#2f7de1','#f2b705','#18a874','#9b59d0','#ff7a2f','#16b5c9','#e2559a','#7fbf2a','#c9a27a','#5b6cff','#8a8f98'];
const D = 2000, V0 = 16.5, TIME_SCALE = 4, SIM_DT = 1/30, HP0 = 112;

/* ---------- skill pool ----------
   check(r, c, s) → true: 조건 충족(확률 굴림), false: 대기, 'skip': 기회 지나감
   c = {t, p, rank, n, ahead, behind, leader}   s.at = 랜덤 발동 지점. big = 컷인 */
const atP = (r, c, s) => c.p >= s.at;
const POOL = [
  {id:'dash',  label:'출발 대시',     chance:.6,  desc:'출발 직후 3초간 속도 +15%', check:(r,c)=>c.t > r.delay + 0.4, fx:r=>boost(r,1.15,3)},
  {id:'wind',  label:'바람을 타고',   chance:.55, at:[.3,.7], desc:'중반 어딘가에서 4초간 +10%', check:atP, fx:r=>boost(r,1.10,4)},
  {id:'spurt', label:'라스트 스퍼트', chance:.55, big:true, desc:'남은 20%에서 4초간 +14%', check:(r,c)=>c.p >= .8, fx:r=>boost(r,1.14,4)},
  {id:'chase', label:'추격자',       chance:.6,  big:true, desc:'65% 이후 뒤쪽 절반이면 5초간 +16%', check:(r,c)=>c.p>.95?'skip':(c.p>=.65 && c.rank>=Math.ceil(c.n/2)), fx:r=>boost(r,1.16,5)},
  {id:'reverse',label:'역전의 의지',  chance:.5,  big:true, desc:'90% 지점에서 4위 이하면 3초간 +24%', check:(r,c)=>c.p>=.9 ? (c.rank>=3 || 'skip') : false, fx:r=>boost(r,1.24,3)},
  {id:'snack', label:'간식 타임',     chance:.7,  desc:'체력이 20% 아래로 떨어지면 체력 35% 회복', check:r=>r.hp < r.hp0*.2, fx:r=>{ r.hp += r.hp0*.35; r.fatigued=false; }},
  {id:'warp',  label:'지름길 발견',   chance:.3,  big:true, at:[.35,.65], desc:'순식간에 15m 앞으로 이동', check:atP, fx:r=>{ r.x += 15; r.warp = 1; }},
  {id:'awake', label:'각성',         chance:.45, at:[.55,.85], desc:'후반 어딘가에서 6초간 +8%', check:atP, fx:r=>boost(r,1.08,6)},
  {id:'sand',  label:'모래 뿌리기',   chance:.5,  at:[.3,.8], desc:'바로 뒤 친구를 2초간 -20%', check:atP, fx:(r,c)=>{ const t = c.behind; if(t){ boost(t,.8,2); return `${nm(t)}가 모래를 뒤집어썼습니다!`; } return '뒤에 아무도 없어서 허공에 뿌렸습니다.'; }},
  {id:'check', label:'견제',         chance:.45, at:[.4,.85], desc:'선두를 3초간 -12% (내가 선두면 불발)', check:atP, fx:(r,c)=>{ const t = c.leader; if(t && t!==r){ boost(t,.88,3); return `선두 ${nm(t)}, 견제를 받고 주춤!`; } return '본인이 선두라 견제할 사람이 없습니다.'; }},
  {id:'allin', label:'올인',         chance:.5,  big:true, desc:'70% 지점에서 3초간 +25%, 대신 체력 25 소모', check:(r,c)=>c.p>=.7, fx:r=>{ boost(r,1.25,3); r.hp -= 25; }},
  {id:'cheer', label:'응원 받기',     chance:.7,  big:true, desc:'50% 이후 꼴찌면 5초간 +18%', check:(r,c)=>c.p>.97?'skip':(c.p>=.5 && c.rank===c.n-1), fx:r=>boost(r,1.18,5)},
  {id:'draft', label:'슬립스트림',    chance:.6,  desc:'앞 친구 3m 안에 붙으면 3초간 +8%', check:(r,c)=>c.p>.95?'skip':(c.p>.2 && c.ahead && c.ahead.x - r.x < 3), fx:r=>boost(r,1.08,3)},
  {id:'pride', label:'선두의 자존심', chance:.6,  desc:'70% 이후 선두면 4초간 +8%', check:(r,c)=>c.p>.95?'skip':(c.p>=.7 && c.rank===0), fx:r=>boost(r,1.08,4)},
  {id:'lace',  label:'신발끈 풀림',   chance:.35, neg:true, at:[.15,.9], desc:'(불운) 어딘가에서 1.5초간 -30%', check:atP, fx:r=>boost(r,.7,1.5)},
  {id:'sleepy',label:'졸음',         chance:.35, neg:true, at:[.1,.5], desc:'(불운) 초중반에 2초간 -15%', check:atP, fx:r=>boost(r,.85,2)},
  {id:'phone', label:'카톡 알림',     chance:.35, neg:true, at:[.2,.8], desc:'(불운) 폰 보느라 1초간 -40%', check:atP, fx:r=>boost(r,.6,1)},
  {id:'gum',   label:'풍선껌',       chance:.8,  joke:true, at:[.2,.8], desc:'아무 효과 없음. 그냥 귀여움', check:atP, fx:()=>'풍선이 아주 크게 부풀었습니다. 효과는 없습니다.'},
];
function boost(r, mult, sec){ r.effects.push({mult, until:R.t + sec}); }

function samples(){ return [
  {id:'c1',name:'김지각',nick:'오늘도 5분 늦음',color:COLORS[0],lines:{start:'아 알람 못 들었어!',skill:'출석 부르기 전에 도착한다!',win:'봤지? 지각은 해도 1등은 한다.',lose:'...오늘도 늦었네.'},photo:null,entered:true},
  {id:'c2',name:'박먹보',nick:'위장이 두 개',color:COLORS[5],lines:{start:'끝나고 뭐 먹지?',skill:'저기 치킨 냄새!',win:'우승 기념으로 내가 쏠게... 아니 너가 쏴.',lose:'배고파서 힘이 안 났어.'},photo:null,entered:true},
  {id:'c3',name:'이헬창',nick:'3대 500 (자칭)',color:COLORS[1],lines:{start:'오늘 하체 날이다.',skill:'근육은 배신하지 않는다!',win:'단백질 타러 간다.',lose:'근육이 배신했다.'},photo:null,entered:true},
  {id:'c4',name:'최새벽',nick:'밤샘 전문가',color:COLORS[4],lines:{start:'어제 한숨도 안 잤어.',skill:'지금 텐션 최고조!!',win:'이제 자러 가도 되지?',lose:'졸려서 그래, 졸려서.'},photo:null,entered:true},
  {id:'c5',name:'정랜덤',nick:'인생은 운빨',color:COLORS[3],lines:{start:'오늘 운세 좋던데?',skill:'대길이라고 했다!',win:'실력이었다고 해줘.',lose:'운세 앱 지운다.'},photo:null,entered:true},
  {id:'c6',name:'한막판',nick:'벼락치기 장인',color:COLORS[2],lines:{start:'아직 시간 많아~',skill:'지금부터 진짜다!',win:'역시 막판이 제맛.',lose:'막판이 너무 늦었다.'},photo:null,entered:true},
];}
function normalize(c){
  c.lines = Object.assign({start:'',skill:'',win:'',lose:''}, c.lines || {});
  delete c.stats; delete c.style; delete c.skill; delete c.skillName;
  return c;
}

let roster = (store.get('fd_roster', null) || samples()).map(normalize);
let records = store.get('fd_records2', {});
let raceNo = store.get('fd_raceNo', 1);
let mode = store.get('fd_mode', 'first');
const saveRoster = () => store.set('fd_roster', roster);

const imgCache = new Map();
function imgFor(c){
  if(!c.photo) return null;
  let e = imgCache.get(c.id);
  if(!e || e.src !== c.photo){ const im = new Image(); im.src = c.photo; e = {src:c.photo, im}; imgCache.set(c.id, e); }
  return e.im.complete && e.im.naturalWidth ? e.im : null;
}
function avHTML(c, size){
  const inner = c.photo ? `<img src="${c.photo}" alt="">` : esc((c.name||'?').slice(0,1));
  return `<div class="av s${size}" style="--c:${c.color}">${inner}</div>`;
}
function mulberry(a){ return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* ---------- race setup ---------- */
const RACE_NAMES = ['벚꽃','한강','야자','치킨','월요병','단풍','첫눈','라면','시험기간','불금','새벽감성','급식','커피 내기','밥값'];
const WEATHER = {sunny:'맑음', rain:'비', snow:'눈'};
let R = null, speedMul = 1, acc = 0;

function drawSkills(rng){
  const rest = [...POOL], out = [];
  for(let i=0;i<3;i++){
    const def = rest.splice((rng()*rest.length)|0, 1)[0];
    out.push({def, name:def.label, at: def.at ? def.at[0] + rng()*(def.at[1]-def.at[0]) : 0, state:'wait'});
  }
  return out;
}

function buildRace(entries, seed){
  const rng = mulberry(seed);
  const order = entries.map((c,i)=>i);
  for(let i=order.length-1;i>0;i--){ const j=(rng()*(i+1))|0; [order[i],order[j]]=[order[j],order[i]]; }
  const weather = rng() < 0.6 ? 'sunny' : rng() < 0.6 ? 'rain' : 'snow';
  const runners = order.map((idx, gate) => {
    const c = JSON.parse(JSON.stringify(entries[idx]));
    return {c, gate, x:0, v:0, hp0:HP0, hp:HP0, noise:0, leg:rng()*6, effects:[],
      cond: 1 + (rng()-0.5)*0.03,
      // 페이스 곡선: 저마다 다른 리듬으로 빨라졌다 느려졌다 해요 (평균은 모두 같아요)
      pace:[{a:0.04, f:0.7+rng()*0.9, ph:rng()}, {a:0.025, f:1.8+rng()*1.6, ph:rng()}],
      skills: drawSkills(rng),
      delay: rng() < 0.08 ? 0.6 + rng()*0.9 : 0, finished:false, time:null, fatigued:false, flash:0, warp:0, bubble:null, rankAtHalf:null};
  });
  // 레이스 단위 드라마 (누구에게 터질지는 그 순간 추첨)
  const events = {
    comeback: rng() < 0.35 ? {at: 0.62 + rng()*0.2, done:false} : null,
    leaderTrip: rng() < 0.12 ? {at: 0.7 + rng()*0.2, done:false} : null,
  };
  return {seed, rng, weather, runners, events, t:0, phase:'ready', finish:[], leader:null, lastLead:-99, leadChanges:0, said:{}, doneAt:null,
    title:`${RACE_NAMES[seed % RACE_NAMES.length]} 기념`, silent:false};
}

function setupRace(keepSeed){
  const entries = roster.filter(c => c.entered).slice(0,12);
  const seed = keepSeed && R ? R.seed : (Math.random()*1e9)|0;
  R = buildRace(entries, seed);
  acc = 0; cam.init = false; cutQueue = []; $('#cutinHost').innerHTML = '';
  $('#bRace').textContent = R.title;
  $('#bCourse').textContent = WEATHER[R.weather];
  $('#bTime').textContent = '0:00.0'; $('#bLeft').textContent = `${D}m`;
  $('#tickLog').innerHTML = '';
  $('#tickNow').textContent = R.runners.length < 2 ? '출전할 친구를 2명 이상 골라주세요.' : `제${raceNo}회 ${R.title}, ${R.runners.length}명이 게이트에 들어섰습니다. ${mode==='last'?'꼴등이 당첨!':'1등이 당첨!'}`;
  $('#btnStart').disabled = R.runners.length < 2;
  $('#btnSkip').disabled = true; $('#btnReroll').disabled = false;
  $('#sideTitle').textContent = '출주표';
  $('#sideSub').textContent = '이번 레이스에 뽑힌 스킬이에요. 마음에 안 들면 재추첨하세요.';
  buildBoard(); sizeCanvas();
}

/* ---------- commentary ---------- */
function say(text, mark){
  if(R.silent) return;
  $('#tickNow').innerHTML = text;
  const li = document.createElement('li');
  const m = mark ?? `${Math.max(0, Math.round(D - leadX()))}m`;
  li.innerHTML = `<span class="m">${m}</span>${text}`;
  const log = $('#tickLog'); log.prepend(li);
  while(log.children.length > 14) log.lastChild.remove();
}
const leadX = () => R.runners.reduce((m,r)=>Math.max(m, Math.min(r.x, D)), 0);
const nm = r => `<b>${esc(r.c.name)}</b>`;

let cutQueue = [], cutBusy = false;
function cutin(r, title, sub, drama){
  if(R.silent || cutQueue.length > 2) return;
  cutQueue.push([r, title, sub, drama]); if(!cutBusy) nextCut();
}
function nextCut(){
  const item = cutQueue.shift(); if(!item){ cutBusy=false; return; }
  const [r, title, sub, drama] = item; cutBusy = true;
  $('#cutinHost').innerHTML = `<div class="cutin ${drama?'drama':''}" style="--c:${r.c.color}">${avHTML(r.c,72)}
    <div><div class="who">${esc(r.c.name)}</div><div class="sk">${esc(title)}</div><div class="ln">“${esc(r.c.lines.skill || '간다!')}”</div>${sub?`<div class="fx">${esc(sub)}</div>`:''}</div></div>`;
  setTimeout(() => { $('#cutinHost').innerHTML=''; nextCut(); }, Math.max(700, (drama?2200:1600)/Math.sqrt(speedMul)));
}

/* ---------- simulation ---------- */
function startRace(){
  if(!R || R.runners.length < 2) return;
  if(R.phase !== 'ready') setupRace(false);
  R.phase = 'countdown';
  $('#btnStart').disabled = true; $('#btnReroll').disabled = true;
  const cd = $('#countdown'); cd.hidden = false;
  const seq = ['3','2','1','출발!']; let i = 0;
  const tick = () => {
    if(!R || R.phase !== 'countdown'){ cd.hidden = true; return; }
    if(i < seq.length){ cd.innerHTML = `<span>${seq[i]}</span>`; i++; setTimeout(tick, i===seq.length?450:650); }
    else { cd.hidden = true; go(); }
  };
  tick();
}
function go(){
  R.phase = 'running';
  $('#btnSkip').disabled = false;
  $('#sideTitle').textContent = '실시간 순위';
  $('#sideSub').textContent = '선두와의 거리는 마신(약 2.4m) 단위예요. 노란 칩은 발동한 스킬이에요.';
  say('게이트 오픈! 일제히 출발했습니다!', 'START');
  const talker = R.runners[(Math.random()*R.runners.length)|0];
  if(talker.c.lines.start) say(`${nm(talker)}: “${esc(talker.c.lines.start)}”`, 'START');
  R.runners.filter(r=>r.delay>0).forEach(r => say(`아, ${nm(r)} 출발이 늦었습니다!`, 'START'));
}

const rankKey = r => r.finished ? 1e6 - r.time : r.x;
function step(dt){
  const rng = R.rng;
  R.t += dt;
  const sorted = [...R.runners].sort((a,b) => rankKey(b) - rankKey(a) || a.gate - b.gate);
  const n = sorted.length;
  sorted.forEach((r,i) => r.rank = i);
  const lead = sorted[0], second = sorted[1];
  const base = 100/(D/V0) * (0.8 + D/4000*0.45) * (R.weather==='rain'?1.06:1);

  for(const r of R.runners){
    if(R.t < r.delay) continue;
    const p = Math.min(r.x/D, 1);
    let tgt = V0 * r.cond;
    for(const w of r.pace) tgt *= 1 + w.a*Math.sin(2*Math.PI*(p*w.f + w.ph));
    // 관중 응원 보정: 뒤처질수록 조금 빨라지고, 혼자 앞서가면 조금 느려져요 (위치만 보고, 사람은 안 봐요)
    if(!r.finished){
      const gapL = Math.min(lead.x, D) - r.x;
      if(gapL > 6) tgt *= 1 + Math.min(0.03, (gapL-6)/500);
      if(r === lead && second){ const g = lead.x - second.x; if(g > 4) tgt *= 1 - Math.min(0.015, (g-4)/600); }
    }
    if(R.weather === 'snow') tgt *= 0.97;
    r.noise += ((rng()-0.5)*0.08 - r.noise*0.6) * dt;
    r.noise = Math.max(-0.03, Math.min(0.03, r.noise));
    tgt *= 1 + r.noise;
    r.effects = r.effects.filter(e => R.t < e.until);
    for(const e of r.effects) tgt *= e.mult;
    if(r.hp <= 0 && !r.finished){
      tgt *= 0.8;
      if(!r.fatigued){ r.fatigued = true; if(p < 0.97) say(`${nm(r)}, 힘이 빠졌나요? 발이 무거워 보입니다!`); }
    }
    if(r.finished) tgt *= 0.55;
    r.v = r.v < tgt ? Math.min(tgt, r.v + 3.5*dt) : Math.max(tgt, r.v - 2.5*dt);
    r.x += r.v*dt;
    if(!r.finished) r.hp -= base * (r.v/V0)**2 * dt;
    if(p >= 0.5 && r.rankAtHalf === null) r.rankAtHalf = r.rank;

    if(!r.finished && r.x >= D){
      r.finished = true;
      r.time = R.t - (r.x - D)/Math.max(r.v, 1);
      R.finish.push(r); onFinish(r);
    }
    if(!r.finished) runSkills(r, p, sorted);
  }
  // 날씨 미끄러짐 (모두 같은 확률)
  if(R.weather !== 'sunny' && rng() < (R.weather==='snow'?0.05:0.03)*dt){
    const vic = R.runners[(rng()*n)|0];
    if(!vic.finished && vic.x > 50){ boost(vic, .75, 1.2); say(`아앗! ${nm(vic)}, ${R.weather==='snow'?'눈길에 미끄러질 뻔!':'빗물에 발이 미끄러졌습니다!'}`); }
  }
  // 레이스 드라마
  const lp = lead.x / D, ev = R.events;
  if(ev.comeback && !ev.comeback.done && lp >= ev.comeback.at){
    ev.comeback.done = true;
    const back = sorted.filter(r => !r.finished && r.rank >= Math.ceil(n/2));
    if(back.length){
      const r = back[(rng()*back.length)|0];
      boost(r, 1.30, 6); r.flash = 1; r.bubble = {text:'역전각!', neg:false, life:2.2};
      say(`잠깐만요… ${nm(r)}의 눈빛이 달라졌습니다! <b>역전각</b>이 보입니다!!`);
      cutin(r, '역전각!!', '6초간 +30%, 뒤에서 치고 올라옵니다', true);
    }
  }
  if(ev.leaderTrip && !ev.leaderTrip.done && lp >= ev.leaderTrip.at){
    ev.leaderTrip.done = true;
    if(!lead.finished){ boost(lead, 0.55, 1.8); lead.bubble = {text:'휘청!', neg:true, life:1.6}; say(`선두 ${nm(lead)}, 크게 휘청합니다! 이게 무슨 일이죠!`); }
  }

  if(lead !== R.leader && R.t - R.lastLead > 3 && lp > 0.06 && lp < 1){
    if(R.leader){ R.leadChanges++; say(`${nm(lead)}, 선두로 나섭니다!`); }
    R.leader = lead; R.lastLead = R.t;
  } else if(!R.leader){ R.leader = lead; }
  const ms = [[0.5,()=>'중간 지점 통과! 선두는 '+nm(lead)+', 꼴찌는 '+nm(sorted[n-1])+'.'],[0.75,()=>'최종 코너를 돌아 마지막 직선!'],[(D-200)/D,()=>'남은 200m! 누가 먼저 들어오나!']];
  for(const [at, txt] of ms){ if(lp >= at && !R.said[at]){ R.said[at] = 1; say(txt()); } }
  if(R.finish.length === n && R.doneAt === null) R.doneAt = R.t;
}

function runSkills(r, p, sorted){
  const c = {t:R.t, p, rank:r.rank, n:sorted.length, ahead:sorted[r.rank-1], behind:sorted[r.rank+1], leader:sorted[0]};
  for(const s of r.skills){
    if(s.state !== 'wait') continue;
    const res = s.def.check(r, c, s);
    if(res === 'skip'){ s.state = 'miss'; continue; }
    if(!res) continue;
    if(R.rng() > s.def.chance){
      s.state = 'miss';
      if(s.def.big) say(`${nm(r)}의 「${esc(s.name)}」… 불발입니다!`);
      continue;
    }
    s.state = 'used';
    const extra = s.def.fx(r, c);
    r.flash = 1; r.bubble = {text:s.name, neg:!!s.def.neg, life:1.6};
    if(s.def.big){ say(`${nm(r)}, <b>「${esc(s.name)}」</b> 발동!`); cutin(r, s.name, s.def.desc, false); }
    else if(s.def.neg) say(`이런! ${nm(r)}, <b>「${esc(s.name)}」</b>!`);
    else say(`${nm(r)}, <b>「${esc(s.name)}」</b>!`);
    if(typeof extra === 'string') say(extra);
  }
}
function onFinish(r){
  const k = R.finish.length;
  if(k === 1) say(`${nm(r)}, 1착으로 골인!!`, 'GOAL');
  else if(k === 2){
    const gap = r.time - R.finish[0].time;
    say(gap < 0.08 ? `사진 판정! ${nm(R.finish[0])}와(과) ${nm(r)}, 거의 동시에 들어왔습니다!` : `2착은 ${nm(r)}!`, 'GOAL');
  } else if(k === R.runners.length) say(`마지막으로 ${nm(r)} 골인. ${mode==='last'?'오늘의 당첨자입니다!':''}`, 'GOAL');
}

function finishRace(){
  if(R.phase === 'done') return;
  R.phase = 'done';
  $('#btnSkip').disabled = true; $('#btnStart').disabled = false; $('#btnReroll').disabled = false;
  const n = R.finish.length;
  R.finish.forEach((r,i) => {
    const rec = records[r.c.id] || {r:0, w:0, l:0};
    rec.r++; if(i===0) rec.w++; if(i===n-1) rec.l++;
    records[r.c.id] = rec;
  });
  store.set('fd_records2', records);
  raceNo++; store.set('fd_raceNo', raceNo);
  renderCards(); showResults();
}
function skipToEnd(){
  if(!R || R.phase !== 'running') return;
  let guard = 0;
  while(R.finish.length < R.runners.length && guard++ < 200000) step(SIM_DT);
  cutQueue = []; $('#cutinHost').innerHTML = ''; R.runners.forEach(r => { r.flash = 0; r.bubble = null; });
  finishRace();
}

/* ---------- results ---------- */
function margin(dt){
  const L = dt * V0 / 2.4;
  if(L < 0.1) return '코'; if(L < 0.25) return '머리'; if(L < 0.5) return '목'; if(L > 10) return '대차';
  return (Math.round(L*2)/2).toString().replace('.5','½') + '마신';
}
const fmtT = t => `${Math.floor(t/60)}:${(t%60).toFixed(1).padStart(4,'0')}`;
function showResults(){
  const pickIdx = mode === 'last' ? R.finish.length - 1 : 0;
  const w = R.finish[pickIdx];
  const rows = R.finish.map((r,i) => {
    const d = r.rankAtHalf === null ? 0 : r.rankAtHalf - i;
    const mv = d > 0 ? `<span class="up">▲${d}</span>` : d < 0 ? `<span class="down">▼${-d}</span>` : '<span class="hint">-</span>';
    return `<tr class="${i===pickIdx?'pick':''}">
      <td class="pl">${i+1}</td><td>${avHTML(r.c,32)}</td><td><b>${esc(r.c.name)}</b><div class="hint">발동 ${r.skills.filter(s=>s.state==='used').map(s=>esc(s.name)).join(', ') || '없음'}</div></td>
      <td class="num">${mv}</td><td class="num">${fmtT(r.time)}</td><td class="num">${i===0?'-':margin(r.time - R.finish[i-1].time)}</td></tr>`;
  }).join('');
  const line = mode === 'last' ? (w.c.lines.lose || '말도 안 돼...') : (w.c.lines.win || '이겼다!');
  const wd = w.rankAtHalf === null ? 0 : w.rankAtHalf - pickIdx;
  const note = mode==='first' && wd >= 3 ? `중간 ${w.rankAtHalf+1}위에서 대역전!` : mode==='last' && wd <= -3 ? `중간 ${w.rankAtHalf+1}위였는데 꼴등으로…` : `선두 교체 ${R.leadChanges}번`;
  $('#resSheet').innerHTML = `
    <div class="res-hero ${mode==='last'?'lose':''}">${avHTML(w.c,96)}<div><div class="eyebrow">${esc(R.title)} · ${mode==='last'?'꼴등':'1착'} · ${esc(note)}</div><div class="nm">${esc(w.c.name)}</div>
      <span class="stamp">당첨!</span><q>${esc(line)}</q></div></div>
    <div style="overflow-x:auto"><table class="res-table"><thead><tr><th>착순</th><th></th><th>이름</th><th class="num">중간 대비</th><th class="num">타임</th><th class="num">착차</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="actions"><button class="btn go" id="rsAgain">새 레이스</button><button class="btn" id="rsSame">같은 레이스 다시 보기</button><span class="spacer"></span><button class="btn" id="rsClose">닫기</button></div>`;
  $('#resModal').hidden = false;
  $('#rsAgain').onclick = () => { $('#resModal').hidden = true; setupRace(false); startRace(); };
  $('#rsSame').onclick = () => { $('#resModal').hidden = true; setupRace(true); startRace(); };
  $('#rsClose').onclick = () => { $('#resModal').hidden = true; };
}

/* ---------- standings ---------- */
let rowEls = new Map();
function buildBoard(){
  const ol = $('#board'); ol.innerHTML = ''; rowEls = new Map();
  R.runners.forEach(r => {
    const li = document.createElement('li'); li.className = 'row';
    li.innerHTML = `<div class="rk"></div>${avHTML(r.c,32)}<div style="min-width:0"><div class="nm">${esc(r.c.name)}</div><div class="meta"></div><div class="hp"><i></i></div><div class="sks"></div></div><div class="gap"></div>`;
    ol.appendChild(li);
    const sks = li.querySelector('.sks');
    const chips = r.skills.map(s => { const sp = document.createElement('span'); sp.textContent = s.name; sp.title = `${s.def.desc} (발동 ${Math.round(s.def.chance*100)}%)`; sp.className = s.def.big ? 'big' : s.def.neg ? 'neg' : ''; sks.appendChild(sp); return sp; });
    rowEls.set(r, {li, chips, rk:li.querySelector('.rk'), meta:li.querySelector('.meta'), gap:li.querySelector('.gap'), hp:li.querySelector('.hp i')});
  });
  updateBoard();
}
function updateBoard(){
  if(!R) return;
  const pre = R.phase === 'ready' || R.phase === 'countdown';
  const list = pre ? [...R.runners].sort((a,b)=>a.gate-b.gate) : [...R.runners].sort((a,b)=>rankKey(b)-rankKey(a));
  const lead = list[0];
  list.forEach((r,i) => {
    const e = rowEls.get(r); if(!e) return;
    e.li.style.order = i;
    if(pre){
      e.rk.textContent = r.gate+1;
      e.meta.textContent = `${r.gate+1}번 게이트`;
      e.gap.textContent = '';
    } else {
      e.rk.textContent = i+1;
      e.meta.textContent = r.finished ? `골인 ${fmtT(r.time)}` : r.effects.some(x=>x.mult>1) ? '가속 중!' : r.effects.some(x=>x.mult<1) ? '주춤!' : r.fatigued ? '지침' : '달리는 중';
      if(i===0) e.gap.textContent = r.finished ? '1착' : '선두';
      else if(r.finished && lead.finished) e.gap.textContent = `+${(r.time - lead.time).toFixed(1)}초`;
      else { const L = (Math.min(lead.x,D) - Math.min(r.x,D))/2.4; e.gap.textContent = L < 0.1 ? '코' : `+${L.toFixed(1)}`; }
    }
    r.skills.forEach((s,j) => { const ch = e.chips[j]; ch.classList.toggle('used', s.state==='used'); ch.classList.toggle('miss', s.state==='miss'); });
    e.hp.style.width = `${Math.max(0, Math.min(100, r.hp/r.hp0*100))}%`;
    e.hp.style.background = r.hp/r.hp0 < 0.2 ? 'var(--hot)' : 'var(--good)';
    e.li.classList.toggle('skill', r.flash > 0);
  });
}

/* ---------- canvas ---------- */
const cv = $('#cv'), ctx = cv.getContext('2d');
let W = 800, H = 400, laneH = 40, dpr = 1;
const TOP = 36, STRIP = 22;
const cam = {right:0, view:120, off:0, init:false};
let particles = [];
function sizeCanvas(){
  W = cv.parentElement.clientWidth || 800;
  laneH = W < 520 ? 32 : W < 800 ? 38 : 44;
  const n = R ? Math.max(R.runners.length, 2) : 6;
  H = TOP + n*laneH + 10 + STRIP;
  dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(W*dpr); cv.height = Math.round(H*dpr);
  cv.style.height = H + 'px';
}
window.addEventListener('resize', sizeCanvas);
function hash(k){ let x = Math.sin(k*127.1 + 311.7)*43758.5453; return x - Math.floor(x); }

function draw(dtReal, time){
  ctx.setTransform(dpr,0,0,dpr,0,0);
  const runners = R ? R.runners : [];
  let minX = Infinity, maxX = -Infinity;
  runners.forEach(r => { const x = Math.min(r.x, D+30); minX = Math.min(minX, x); maxX = Math.max(maxX, x); });
  if(!runners.length){ minX = 0; maxX = 0; }
  const viewT = Math.max(90, Math.min(360, (maxX-minX)*1.25 + 35));
  let rightT = Math.max(maxX + viewT*0.16, -12 + viewT);
  if(R && R.phase === 'done') rightT = Math.max(rightT, D + 30);
  const offT = rightT - maxX;
  if(!cam.init){ cam.view = viewT; cam.off = offT; cam.init = true; }
  const k = 1 - Math.pow(0.08, dtReal);
  cam.view += (viewT - cam.view)*k; cam.off += (offT - cam.off)*k;
  cam.right = maxX + Math.max(cam.off, 8);
  const scale = W / cam.view, left = cam.right - cam.view;
  const X = m => (m - left) * scale;
  const n = Math.max(runners.length, 2);
  const tTop = TOP, tH = n*laneH + 10, running = R && R.phase === 'running';

  ctx.fillStyle = '#08100c'; ctx.fillRect(0,0,W,TOP);
  const pc = left*scale*0.35, stp = 9;
  for(let i = Math.floor(pc/stp)-1; i*stp - pc < W+stp; i++){
    const hx = i*stp - pc, h = hash(i);
    const bob = running ? Math.sin(time*8 + i)*1.5 : 0;
    ctx.fillStyle = ['#3a4a42','#56463a','#40425a','#5a3a40','#4a5a3a'][(h*5)|0];
    ctx.beginPath(); ctx.arc(hx, 10 + hash(i+50)*16 + bob, 3, 0, 7); ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,182,39,.12)'; ctx.fillRect(0, TOP-4, W, 4);

  const c1 = '#1f5c36', c2 = '#246840';
  for(let m = Math.floor(left/25)*25; m < cam.right; m += 25){
    ctx.fillStyle = (((Math.floor(m/25) % 2) + 2) % 2) ? c1 : c2;
    ctx.fillRect(X(m), tTop, 25*scale + 1, tH);
  }
  ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = 1;
  for(let i=1;i<n;i++){ const y = tTop + 5 + i*laneH; ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
  ctx.fillStyle = '#e9e4d4'; ctx.fillRect(0, tTop, W, 3); ctx.fillRect(0, tTop + tH - 3, W, 3);
  for(let m = Math.floor(left/10)*10; m < cam.right; m += 10){ ctx.fillRect(X(m)-1, tTop + tH - 8, 2, 6); }
  ctx.font = '600 11px "Share Tech Mono", monospace'; ctx.textAlign = 'center';
  for(let m = Math.max(100, Math.floor(left/100)*100); m < Math.min(D, cam.right+100); m += 100){
    const rem = D - m, x = X(m);
    ctx.fillStyle = rem % 200 === 0 ? '#ffb627' : 'rgba(233,228,212,.6)';
    ctx.fillRect(x-1.5, tTop-2, 3, 10);
    if(rem % 200 === 0) ctx.fillText(`${rem}`, x, tTop - 6);
  }
  if(X(0) > -40 && X(0) < W+40){
    if(R && (R.phase === 'ready' || R.phase === 'countdown')){
      for(let i=0;i<n;i++){ const y = tTop + 5 + i*laneH; ctx.fillStyle = '#9aa3a0'; ctx.fillRect(X(0)+2, y+2, 6, laneH-4); ctx.fillStyle='#2b3330'; ctx.fillRect(X(0)+8, y+2, 2, laneH-4); }
    } else { ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(X(0)-1, tTop, 2, tH); }
  }
  const fx = X(D);
  if(fx > -20 && fx < W+20){
    const sq = 5;
    for(let y = tTop, j = 0; y < tTop + tH; y += sq, j++){
      ctx.fillStyle = j%2 ? '#111' : '#fff'; ctx.fillRect(fx-sq, y, sq, sq);
      ctx.fillStyle = j%2 ? '#fff' : '#111'; ctx.fillRect(fx, y, sq, sq);
    }
    ctx.fillStyle = '#ff5b4a'; ctx.fillRect(fx-22, 2, 44, 16);
    ctx.fillStyle = '#fff'; ctx.font = '12px "Black Han Sans", sans-serif'; ctx.fillText('GOAL', fx, 14);
  }

  const ordered = [...runners].sort((a,b)=>a.gate-b.gate);
  const sm = running ? speedMul : 1;
  for(const r of ordered){
    const sx = X(Math.min(r.x, D + 400)), y = tTop + 5 + r.gate*laneH + laneH*0.86;
    if(running || (R && R.phase==='done')) r.leg += dtReal * r.v * 0.9 * sm;
    if(r.flash > 0) r.flash = Math.max(0, r.flash - dtReal*0.6);
    drawRunner(r, sx, y, laneH/44, time, dtReal);
    if(sx < -10){ ctx.fillStyle = r.c.color; ctx.beginPath(); ctx.moveTo(4, y-laneH*0.4); ctx.lineTo(12, y-laneH*0.55); ctx.lineTo(12, y-laneH*0.25); ctx.fill(); }
  }
  for(const r of ordered){
    if(!r.bubble) continue;
    r.bubble.life -= dtReal * Math.sqrt(sm);
    if(r.bubble.life <= 0){ r.bubble = null; continue; }
    const sx = X(Math.min(r.x, D + 400)), y = tTop + 5 + r.gate*laneH + laneH*0.86 - laneH*0.95;
    ctx.font = `700 12px "IBM Plex Sans KR", sans-serif`; ctx.textAlign = 'center';
    const tw = ctx.measureText(r.bubble.text).width + 12;
    const bx = Math.min(W - tw/2 - 4, Math.max(tw/2 + 4, sx));
    ctx.globalAlpha = Math.min(1, r.bubble.life*3);
    ctx.fillStyle = r.bubble.neg ? '#ff5b4a' : '#ffb627'; roundRect(bx - tw/2, Math.max(2, y-16), tw, 18, 9); ctx.fill();
    ctx.fillStyle = r.bubble.neg ? '#fff' : '#1a1204'; ctx.fillText(r.bubble.text, bx, Math.max(2, y-16) + 13);
    ctx.globalAlpha = 1;
  }

  if(R && R.weather !== 'sunny'){
    const want = R.weather === 'rain' ? 90 : 60;
    while(particles.length < want) particles.push({x:Math.random()*W, y:Math.random()*(TOP+tH), s:Math.random()});
    ctx.strokeStyle = 'rgba(190,210,255,.35)'; ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1;
    for(const p of particles){
      if(R.weather === 'rain'){ p.y += dtReal*(500+300*p.s); p.x -= dtReal*120; ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(p.x+3,p.y-10); ctx.stroke(); }
      else { p.y += dtReal*(40+40*p.s); p.x += Math.sin(time*2 + p.s*10)*dtReal*20; ctx.beginPath(); ctx.arc(p.x,p.y,1+p.s*1.5,0,7); ctx.fill(); }
      if(p.y > TOP+tH){ p.y = -5; p.x = Math.random()*(W+40); }
    }
  } else particles = [];

  const sy = tTop + tH;
  ctx.fillStyle = '#050806'; ctx.fillRect(0, sy, W, STRIP);
  const px = m => 12 + (W-40) * Math.max(0, Math.min(1, m/D));
  ctx.fillStyle = '#273b31'; ctx.fillRect(12, sy + STRIP/2 - 1, W-40, 2);
  ctx.fillStyle = '#ff5b4a'; ctx.fillRect(px(D)-1, sy+4, 3, STRIP-8);
  ctx.fillStyle = 'rgba(255,182,39,.25)'; ctx.fillRect(px(left), sy+4, Math.max(2, px(cam.right)-px(left)), STRIP-8);
  for(const r of runners){ ctx.fillStyle = r.c.color; ctx.beginPath(); ctx.arc(px(r.x), sy + STRIP/2, 4, 0, 7); ctx.fill(); }
}

function drawRunner(r, sx, y, s, time, dtReal){
  const c = r.c, moving = r.v > 0.5;
  const sw = Math.sin(r.leg) * (moving ? 0.8 : 0.05);
  const boosted = r.effects.some(e => e.mult > 1), slowed = r.effects.some(e => e.mult < 1);
  ctx.save(); ctx.translate(sx, y);
  ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(-8*s, 0, 15*s, 3*s, 0, 0, 7); ctx.fill();
  if(r.warp > 0){
    r.warp = Math.max(0, r.warp - dtReal*1.5);
    ctx.globalAlpha = r.warp; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(-6*s, -18*s, (1-r.warp)*40*s + 8*s, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
  }
  if(boosted){
    ctx.strokeStyle = c.color; ctx.lineWidth = 2*s; ctx.globalAlpha = 0.7;
    for(let i=0;i<4;i++){ const yy = -6*s - i*7*s, off = ((time*120 + i*13) % 20)*s; ctx.beginPath(); ctx.moveTo(-26*s - off, yy); ctx.lineTo(-44*s - off, yy); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
  const hipX = -7*s, hipY = -12*s;
  ctx.lineWidth = 3.2*s; ctx.lineCap = 'round';
  const leg = (a, shade) => { ctx.strokeStyle = shade; ctx.beginPath(); ctx.moveTo(hipX, hipY);
    const kx = hipX + Math.sin(a)*6*s, ky = hipY + 6*s; ctx.lineTo(kx, ky); ctx.lineTo(kx + Math.sin(a - 0.6)*6*s, 0); ctx.stroke(); };
  leg(-sw, '#2a2f2d'); leg(sw, '#121514');
  ctx.save(); ctx.translate(hipX, hipY); ctx.rotate(moving ? (slowed ? -0.05 : 0.28) : 0.05);
  ctx.fillStyle = c.color; roundRect(-5*s, -15*s, 11*s, 16*s, 3*s); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.font = `700 ${8*s}px "Share Tech Mono", monospace`; ctx.textAlign = 'center';
  ctx.fillText(r.gate+1, 0.5*s, -4*s);
  ctx.strokeStyle = c.color; ctx.lineWidth = 2.6*s;
  ctx.beginPath(); ctx.moveTo(0, -12*s); ctx.lineTo(Math.sin(sw)*8*s, -5*s); ctx.stroke();
  ctx.restore();
  const hx = -1*s, hy = -32*s, hr = 10.5*s;
  ctx.save(); ctx.beginPath(); ctx.arc(hx, hy, hr, 0, 7); ctx.closePath();
  const im = imgFor(c);
  if(im){ ctx.save(); ctx.clip(); ctx.drawImage(im, hx-hr, hy-hr, hr*2, hr*2); ctx.restore(); }
  else { ctx.fillStyle = c.color; ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = `${11*s}px "Black Han Sans", sans-serif`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText((c.name||'?').slice(0,1), hx, hy+0.5*s); ctx.textBaseline='alphabetic'; }
  ctx.lineWidth = 2*s; ctx.strokeStyle = r.flash > 0 ? '#ffb627' : '#fff'; ctx.stroke();
  ctx.restore();
  if(r.fatigued && !r.finished){ ctx.fillStyle = '#7cc4ff'; const d = (time*3) % 1; ctx.beginPath(); ctx.arc(hx + 11*s, hy - 4*s + d*8*s, 2*s, 0, 7); ctx.fill(); }
  ctx.font = `500 ${Math.max(10, 11*s)}px "IBM Plex Sans KR", sans-serif`; ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(0,0,0,.45)'; const tw = ctx.measureText(c.name).width;
  ctx.fillRect(-24*s - tw - 4, -24*s, tw + 8, 15*s);
  ctx.fillStyle = '#fff'; ctx.fillText(c.name, -24*s, -13*s);
  ctx.restore();
}
function roundRect(x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }

let last = 0, boardT = 0;
function frame(ts){
  const dt = last ? Math.min(0.05, (ts - last)/1000) : 0.016; last = ts;
  if(R && R.phase === 'running'){
    acc += dt * TIME_SCALE * speedMul;
    let steps = 0;
    while(acc >= SIM_DT && steps++ < 400){ step(SIM_DT); acc -= SIM_DT; }
    $('#bTime').textContent = fmtT(R.t);
    $('#bLeft').textContent = `${Math.max(0, Math.round(D - leadX()))}m`;
    if(R.doneAt !== null && R.t - R.doneAt > 1.5*TIME_SCALE) finishRace();
  }
  draw(dt, ts/1000);
  boardT += dt; if(boardT > 0.15){ boardT = 0; updateBoard(); }
  requestAnimationFrame(frame);
}

/* ---------- roster ---------- */
function renderCards(){
  const entered = roster.filter(c=>c.entered).length;
  $('#cards').innerHTML = roster.map(c => {
    const rec = records[c.id];
    return `<article class="card ${c.entered?'':'off'}" style="--c:${c.color}">
      <div class="hd">${avHTML(c,56)}<div style="min-width:0"><div class="nm">${esc(c.name)}</div><div class="nick">${esc(c.nick)}</div></div></div>
      <div class="ft"><span class="rec">${rec ? `${rec.r}전 · 1등 ${rec.w} · 꼴등 ${rec.l}` : '아직 기록 없음'}</span>
        <label class="toggle"><input type="checkbox" data-enter="${c.id}" ${c.entered?'checked':''} ${!c.entered && entered>=12?'disabled':''}> 출전</label>
        <button class="btn" data-edit="${c.id}">편집</button></div>
    </article>`;
  }).join('') + `<button class="add" id="btnAdd">+ 친구 추가</button>`;
  $('#rosterNote').hidden = roster.some(c => !/^c[1-6]$/.test(c.id)) || !roster.length;
}
const idle = () => !R || (R.phase !== 'running' && R.phase !== 'countdown');
$('#cards').addEventListener('click', e => {
  const ed = e.target.closest('[data-edit]'); if(ed) return openEdit(ed.dataset.edit);
  if(e.target.closest('#btnAdd')) return openEdit(null);
});
$('#cards').addEventListener('change', e => {
  const t = e.target.closest('[data-enter]'); if(!t) return;
  roster.find(x => x.id === t.dataset.enter).entered = t.checked;
  saveRoster(); renderCards(); if(idle()) setupRace(false);
});

let draft = null, draftId = null;
function openEdit(id){
  draftId = id;
  const base = id ? roster.find(c=>c.id===id) : {id:'u'+Date.now().toString(36), name:'', nick:'', color:COLORS[roster.length % COLORS.length],
    lines:{start:'',skill:'',win:'',lose:''}, photo:null, entered: roster.filter(c=>c.entered).length < 12};
  draft = JSON.parse(JSON.stringify(base));
  $('#editTitle').textContent = id ? `${draft.name} 편집` : '친구 추가';
  $('#edName').value = draft.name; $('#edNick').value = draft.nick;
  $('#edL1').value = draft.lines.start; $('#edL2').value = draft.lines.skill; $('#edL3').value = draft.lines.win; $('#edL4').value = draft.lines.lose;
  $('#edPhoto').value = ''; $('#edDelete').hidden = !id;
  paintEdit(); $('#editModal').hidden = false;
  setTimeout(() => $('#edName').focus(), 30);
}
function paintEdit(){
  $('#edAv').innerHTML = avHTML({...draft, name: $('#edName').value || '?'}, 96);
  $('#edColors').innerHTML = COLORS.map(c => `<button type="button" style="background:${c}" data-col="${c}" aria-label="색 ${c}" aria-pressed="${draft.color===c}"></button>`).join('');
}
$('#edColors').addEventListener('click', e => { const b = e.target.closest('[data-col]'); if(b){ draft.color = b.dataset.col; paintEdit(); } });
$('#edName').addEventListener('input', () => { $('#edAv').innerHTML = avHTML({...draft, name: $('#edName').value || '?'}, 96); });
$('#edPhoto').addEventListener('change', e => {
  const f = e.target.files[0]; if(!f) return;
  const fr = new FileReader();
  fr.onload = () => { const im = new Image(); im.onload = () => {
      const S = 160, cvs = document.createElement('canvas'); cvs.width = cvs.height = S;
      const m = Math.min(im.width, im.height);
      cvs.getContext('2d').drawImage(im, (im.width-m)/2, (im.height-m)/2, m, m, 0, 0, S, S);
      draft.photo = cvs.toDataURL('image/jpeg', 0.85); paintEdit();
    }; im.src = fr.result; };
  fr.readAsDataURL(f);
});
$('#edPhotoClear').addEventListener('click', () => { draft.photo = null; $('#edPhoto').value=''; paintEdit(); });
$('#edCancel').addEventListener('click', () => { $('#editModal').hidden = true; });
let delArmed = false;
$('#edDelete').addEventListener('click', () => {
  if(!delArmed){ delArmed = true; $('#edDelete').textContent = '한 번 더 누르면 삭제'; setTimeout(()=>{ delArmed=false; $('#edDelete').textContent='삭제'; }, 2500); return; }
  roster = roster.filter(c => c.id !== draftId); saveRoster(); delete records[draftId]; store.set('fd_records2', records);
  $('#editModal').hidden = true; delArmed = false; $('#edDelete').textContent='삭제';
  renderCards(); if(idle()) setupRace(false);
});
$('#editForm').addEventListener('submit', e => {
  e.preventDefault();
  draft.name = $('#edName').value.trim() || '이름없음';
  draft.nick = $('#edNick').value.trim();
  draft.lines = {start:$('#edL1').value.trim(), skill:$('#edL2').value.trim(), win:$('#edL3').value.trim(), lose:$('#edL4').value.trim()};
  const i = roster.findIndex(c => c.id === draft.id);
  if(i >= 0) roster[i] = draft; else roster.push(draft);
  saveRoster(); $('#editModal').hidden = true;
  renderCards(); if(idle()) setupRace(false);
});
[$('#editModal'), $('#resModal')].forEach(m => m.addEventListener('click', e => { if(e.target === m) m.hidden = true; }));
document.addEventListener('keydown', e => { if(e.key === 'Escape'){ $('#editModal').hidden = true; $('#resModal').hidden = true; } });

/* ---------- controls ---------- */
$('#btnReroll').addEventListener('click', () => { if(idle()) setupRace(false); });
document.querySelectorAll('.seg [data-sp]').forEach(b => b.addEventListener('click', () => {
  speedMul = +b.dataset.sp;
  document.querySelectorAll('.seg [data-sp]').forEach(x => x.setAttribute('aria-pressed', x === b));
}));
function setMode(m){
  mode = m; store.set('fd_mode', m);
  document.querySelectorAll('.seg [data-mode]').forEach(x => x.setAttribute('aria-pressed', x.dataset.mode === m));
}
document.querySelectorAll('.seg [data-mode]').forEach(b => b.addEventListener('click', () => { setMode(b.dataset.mode); if(R && R.phase === 'ready') setupRace(true); }));
$('#btnStart').addEventListener('click', () => { if(R && R.phase === 'done') setupRace(false); startRace(); });
$('#btnSkip').addEventListener('click', skipToEnd);
$('#btnResetRec').addEventListener('click', function(){
  if(this.dataset.armed){ records = {}; store.set('fd_records2', records); renderCards(); this.textContent = '기록 초기화'; delete this.dataset.armed; return; }
  this.dataset.armed = 1; this.textContent = '한 번 더 누르면 초기화';
  setTimeout(() => { delete this.dataset.armed; this.textContent = '기록 초기화'; }, 2500);
});

$('#pool').innerHTML = POOL.map(p => `<div class="${p.neg?'neg':''}"><span class="pct">${Math.round(p.chance*100)}%</span><b>${p.label}</b>${p.desc}</div>`).join('');

/* 공정성·스릴 확인용: 콘솔에서 __fdFairness(1000) 실행 */
window.__fdFairness = (runs = 500) => {
  const keep = R, entries = roster.filter(c => c.entered).slice(0,12), wins = {}, lasts = {};
  let leadCh = 0, lastStaysLast = 0, winnerFromBottomHalf = 0;
  for(let i=0;i<runs;i++){
    R = buildRace(entries, (Math.random()*1e9)|0); R.silent = true; R.phase = 'running';
    let g = 0; while(R.finish.length < R.runners.length && g++ < 100000) step(SIM_DT);
    const n = R.finish.length, f = R.finish[0], l = R.finish[n-1];
    wins[f.c.name] = (wins[f.c.name]||0)+1; lasts[l.c.name] = (lasts[l.c.name]||0)+1;
    leadCh += R.leadChanges; if(l.rankAtHalf === n-1) lastStaysLast++; if(f.rankAtHalf >= Math.ceil(n/2)) winnerFromBottomHalf++;
  }
  R = keep; return {wins, lasts, avgLeadChanges: leadCh/runs, lastAtHalfStaysLast: lastStaysLast/runs, winnerFromBottomHalfAtHalf: winnerFromBottomHalf/runs};
};

setMode(mode);
renderCards();
setupRace(false);
requestAnimationFrame(frame);
})();
