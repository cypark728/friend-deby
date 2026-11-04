/* 튜토리얼: 스포트라이트 투어(1~6단계) + 카드 뉴스(7단계)
   - 첫 방문에 자동으로 뜨고, 헤더의 ? 버튼으로 언제든 다시 볼 수 있어요.
   - 단계는 STEPS 배열 하나로 정의해요. target이 있으면 그 요소만 밝게, 없으면 가운데 카드.
   - action: 'click:<selector>' 면 사용자가 그 요소를 실제로 눌러야 다음으로 넘어가요. */
(() => {
const $ = s => document.querySelector(s);
const KEY = 'fd_tour_done_v1';
const store = {
  get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } },
  set(k, v){ try{ localStorage.setItem(k, v); }catch(e){} },
};

const STEPS = [
  { title: '프렌드더비에 온 걸 환영해요',
    body: '모두 <b>똑같은 능력치</b>로 달리고, 결과는 순수하게 운이에요. 마블룰렛 대신 쓰는 경마 룰렛이라고 생각하면 돼요. 1분만 같이 둘러볼게요.',
    next: '시작' },
  { target: '.quick', pos: 'top', title: '이름을 한 번에 넣어요',
    body: '줄바꿈이나 쉼표로 이름을 붙여넣고 <b>한 번에 추가</b>를 누르면 끝이에요. 예시 이름을 넣어뒀으니 직접 눌러보세요.',
    prep(){ const t = $('#quickNames'); if(t && !t.value.trim()) t.value = '튜토리얼A\n튜토리얼B'; },
    cursor: '#btnQuick', action: 'click:#btnQuick', hint: '한 번에 추가를 눌러보세요' },
  { target: () => document.querySelector('.card:last-of-type') || document.querySelector('.card'), pos: 'top', title: '카드에서 꾸밀 수 있어요',
    body: '<b>편집</b>을 누르면 사진, 한 줄 소개, 대사를 넣을 수 있어요. 사진을 넣으면 트랙 위 캐릭터 얼굴이 바뀌어요. 지금은 건너뛰어도 돼요.',
    next: '다음' },
  { target: '.seg.mode', pos: 'bottom', title: '뭘 뽑을지 정해요',
    body: '<b>1등 당첨</b>은 상품·발표 순서 뽑기에, <b>꼴등 당첨</b>은 벌칙·커피 사기에 써요. 레이스 전에 골라두면 돼요.',
    next: '다음' },
  { target: '#btnReroll', pos: 'bottom', title: '순서를 섞을 수 있어요',
    body: '게이트 배치와 스킬이 다시 추첨돼요. 스킬은 <b>비공개</b>라 누가 뭘 뽑았는지는 달리면서 터질 때 알게 돼요. 한번 눌러볼게요.',
    cursor: '#btnReroll', demo: '#btnReroll', next: '다음' },
  { target: '#btnStart', pos: 'bottom', title: '출발!',
    body: '누르면 <b>전체 화면</b>으로 들어가면서 레이스가 시작돼요. 전체 화면에서는 <b>Space</b> 출발, <b>R</b> 순서 섞기, <b>Esc</b> 해제예요. 출발하기 전에 레이스에서 뭘 보게 되는지 카드로 먼저 볼게요.',
    next: '레이스 미리보기' },
];

const CARDS = [
  { img: 'img/c1.jpg', title: '레이스 화면',
    body: '위 전광판에 남은 거리, 가운데 트랙, 오른쪽에 실시간 순위, 아래에 해설이 나와요. 모두 같은 속도로 출발하지만 저마다 페이스가 오르내려서 순위가 계속 바뀌어요.' },
  { img: 'img/c_good.jpg', title: '초록은 좋은 스킬',
    body: '스킬이 터지면 띠가 떠요. <b>초록 ▲</b>는 버프예요. 머리 위 말풍선에 효과 수치가 같이 나오고, 가속 중엔 초록 선이 뒤로 뻗어요.' },
  { img: 'img/c_neg.jpg', title: '빨강은 불운',
    body: '<b>빨강 ▼</b>는 불운이에요. 카톡 알림, 신발끈 풀림 같은 것들이고, 주춤하는 동안 머리 위에 어지럼 별이 돌아요. 불운 스킬도 모두 같은 확률로 뽑혀요.' },
  { img: 'img/c_target.jpg', title: '남을 방해하는 스킬',
    body: '모래 뿌리기, 견제처럼 <b>다른 사람을 느리게</b> 하는 스킬은 <b>✖ 방해</b> 띠에 시전자 → 피해자가 같이 떠요. 당한 사람 머리 위에도 빨간 말풍선이 붙어요.' },
  { img: 'img/c_band.jpg', title: '결승선 슬로우',
    body: '1등 모드에서 1·2위가 결승선 가까이 붙으면 <b>슬로우와 줌</b>이 걸려요. 박빙일수록 더 느려지고, 뻔한 결과면 거의 안 걸려요. 가끔 뒤쪽 사람에게 <b>역전각</b>이 터지기도 해요.' },
  { img: 'img/c_result.jpg', title: '결과와 다음 판',
    body: '당첨자 얼굴과 대사, 착순, 중간 대비 순위 변동이 나와요. <b>새 레이스</b>로 바로 다음 판, <b>같은 레이스 다시 보기</b>로 방금 판을 다시 볼 수 있어요. 전적은 카드에 쌓여요.',
    last: true },
];

/* ---------- DOM ---------- */
let root, hole, block, card, cursorEl, newsEl, idx = 0, active = false, waitHandler = null, raf = 0;
function build(){
  if(root) return;
  root = document.createElement('div'); root.className = 'tour'; root.hidden = true;
  root.innerHTML = `
    <div class="tour-block" id="tourBlock"></div>
    <div class="tour-hole" id="tourHole"></div>
    <div class="tour-card" id="tourCard"></div>
    <div class="tour-cursor" id="tourCursor" hidden><svg viewBox="0 0 24 24" width="28" height="28"><path d="M5 3l14 8-6 1.5L16 20l-3 1.2-3-7.3L5 18z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg></div>
    <div class="tour-news" id="tourNews" hidden></div>`;
  document.body.appendChild(root);
  hole = $('#tourHole'); block = $('#tourBlock'); card = $('#tourCard'); cursorEl = $('#tourCursor'); newsEl = $('#tourNews');
  root.addEventListener('click', e => {
    const a = e.target.closest('[data-tour]'); if(!a) return;
    const act = a.dataset.tour;
    if(act === 'next') next();
    if(act === 'skip') end();
    if(act === 'news-prev') showCard(newsIdx - 1);
    if(act === 'news-next') showCard(newsIdx + 1);
    if(act === 'news-done') end(true);
  });

  document.addEventListener('keydown', e => {
    if(!active) return;
    if(e.key === 'Escape'){ e.stopImmediatePropagation(); end(); }
  }, true);
}

function resolve(t){ return typeof t === 'function' ? t() : (t ? document.querySelector(t) : null); }

function start(){
  build(); idx = 0; active = true; root.hidden = false; newsEl.hidden = true; card.hidden = false;
  document.querySelectorAll('.modal').forEach(m => m.hidden = true);
  document.body.classList.add('touring');
  show();
}
function end(done){
  active = false; cleanupWait(); cancelAnimationFrame(raf);
  root.hidden = true; cursorEl.hidden = true; newsEl.hidden = true;
  document.body.classList.remove('touring');
  store.set(KEY, '1');
  // 튜토리얼에서 넣은 예시 이름 정리
  document.dispatchEvent(new CustomEvent('fd:tour-end', {detail:{done:!!done}}));
}
function next(){ cleanupWait(); idx++; if(idx >= STEPS.length) return showNews(); show(); }

function show(){
  const s = STEPS[idx];
  if(s.prep) s.prep();
  const el = resolve(s.target);
  if(el) el.scrollIntoView({block:'center', behavior:'auto'});
  const dots = STEPS.map((_,i) => `<i class="${i===idx?'on':''}"></i>`).join('');
  const btn = s.action ? `<span class="tour-hint">${s.hint || '직접 해보세요'}</span>` : `<button class="btn go" data-tour="next">${s.next || '다음'}</button>`;
  card.innerHTML = `<div class="tour-step">${idx+1} / ${STEPS.length}</div><h3>${s.title}</h3><p>${s.body}</p>
    <div class="tour-foot"><div class="tour-dots">${dots}</div>${btn}<button class="btn tour-skip" data-tour="skip">건너뛰기</button></div>`;
  cursorEl.hidden = true;
  // 단계가 떠 있는 동안 위치를 계속 맞춰요 (스크롤·리사이즈·카드 추가로 요소가 움직여도 따라가요)
  cancelAnimationFrame(raf);
  const tick = () => { if(!active || card.hidden) return; place(); raf = requestAnimationFrame(tick); }; raf = requestAnimationFrame(tick);
  if(s.cursor) setTimeout(() => flyCursor(s.cursor, s.demo), 500);
  if(s.action){
    const [kind, sel] = s.action.split(':');
    const target = document.querySelector(sel);
    if(target && kind === 'click'){
      waitHandler = {el: target, fn: () => setTimeout(next, 450)};
      target.addEventListener('click', waitHandler.fn, {once:true});
    }
  }
}
function cleanupWait(){ if(waitHandler){ waitHandler.el.removeEventListener('click', waitHandler.fn); waitHandler = null; } }

function place(){
  const s = STEPS[idx]; if(!s) return;
  const el = resolve(s.target);
  const vw = window.innerWidth, vh = window.innerHeight, pad = 10;
  if(!el){
    hole.style.cssText = `left:50%;top:50%;width:0;height:0;`;
    block.style.clipPath = '';
    card.style.cssText = `left:50%;top:50%;transform:translate(-50%,-50%);`;
    return;
  }
  const r = el.getBoundingClientRect();
  hole.style.cssText = `left:${r.left-pad}px;top:${r.top-pad}px;width:${r.width+pad*2}px;height:${r.height+pad*2}px;`;
  // 직접 해보는 단계에서만 구멍 안으로 클릭이 통과해요. 설명만 하는 단계는 전부 막아요.
  if(s.action){
    const L = r.left-pad, T = r.top-pad, Rt = r.right+pad, B = r.bottom+pad;
    block.style.clipPath = `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${L}px ${T}px, ${L}px ${B}px, ${Rt}px ${B}px, ${Rt}px ${T}px, ${L}px ${T}px)`;
  } else block.style.clipPath = '';
  const cw = Math.min(380, vw - 32); card.style.width = cw + 'px'; const ch = card.offsetHeight || 200;
  let left = Math.max(16, Math.min(vw - cw - 16, r.left + r.width/2 - cw/2)), top;
  const pos = s.pos || 'bottom';
  if(pos === 'top') top = r.top - pad - ch - 14; else top = r.bottom + pad + 14;
  if(top < 16) top = r.bottom + pad + 14;
  if(top + ch > vh - 16) top = Math.max(16, r.top - pad - ch - 14);
  card.style.cssText = `left:${left}px;top:${top}px;width:${cw}px;transform:none;`;
}

/* 가짜 커서: 카드에서 버튼까지 날아가서 톡 눌러요. demo가 있으면 실제로 클릭도 해요. */
function flyCursor(sel, demo){
  const t = document.querySelector(sel); if(!t || !active) return;
  const cr = card.getBoundingClientRect(), tr = t.getBoundingClientRect();
  cursorEl.hidden = false;
  cursorEl.style.transition = 'none';
  cursorEl.style.left = (cr.left + cr.width/2) + 'px'; cursorEl.style.top = (cr.top + cr.height - 20) + 'px';
  requestAnimationFrame(() => {
    cursorEl.style.transition = 'left .9s cubic-bezier(.4,0,.2,1), top .9s cubic-bezier(.4,0,.2,1), transform .15s';
    cursorEl.style.left = (tr.left + tr.width/2) + 'px'; cursorEl.style.top = (tr.top + tr.height/2) + 'px';
    setTimeout(() => {
      cursorEl.classList.add('tap'); t.classList.add('tour-pulse');
      if(demo){ t.click(); }
      setTimeout(() => { cursorEl.classList.remove('tap'); }, 220);
      setTimeout(() => { t.classList.remove('tour-pulse'); if(!demo) cursorEl.classList.add('tap'); }, 700);
      setTimeout(() => { cursorEl.classList.remove('tap'); }, 920);
    }, 950);
  });
}

/* ---------- 카드 뉴스 ---------- */
let newsIdx = 0;
function showNews(){
  cleanupWait(); cursorEl.hidden = true; card.hidden = true;
  hole.style.cssText = `left:50%;top:50%;width:0;height:0;`; block.style.clipPath = '';
  newsEl.hidden = false; showCard(0);
}
function showCard(i){
  newsIdx = Math.max(0, Math.min(CARDS.length - 1, i));
  const c = CARDS[newsIdx];
  const dots = CARDS.map((_,k) => `<i class="${k===newsIdx?'on':''}"></i>`).join('');
  newsEl.innerHTML = `<div class="news-card">
      <div class="news-img"><img src="${c.img}" alt=""></div>
      <div class="news-body"><div class="tour-step">레이스 미리보기 ${newsIdx+1} / ${CARDS.length}</div><h3>${c.title}</h3><p>${c.body}</p></div>
      <div class="news-foot">
        <button class="btn" data-tour="news-prev" ${newsIdx===0?'disabled':''}>이전</button>
        <div class="tour-dots">${dots}</div>
        ${c.last ? `<button class="btn go" data-tour="news-done">이제 즐기러 가기</button>` : `<button class="btn go" data-tour="news-next">다음</button>`}
      </div></div>`;
  // 다음 이미지 미리 받기
  const nx = CARDS[newsIdx+1]; if(nx){ const im = new Image(); im.src = nx.img; }
}
document.addEventListener('keydown', e => {
  if(!active || newsEl.hidden) return;
  if(e.key === 'ArrowRight') showCard(newsIdx+1);
  if(e.key === 'ArrowLeft') showCard(newsIdx-1);
});

/* ---------- 진입점 ---------- */
window.fdTour = { start, end };
document.addEventListener('DOMContentLoaded', () => {
  const b = document.querySelector('#btnTour'); if(b) b.addEventListener('click', start);
  if(!store.get(KEY)) setTimeout(start, 600);
});
})();
