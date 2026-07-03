// DOM 씬 전환 + 자세히보기 모달 + 결과/랭킹 렌더
import { getBoard } from './net.js';

const $ = (id) => document.getElementById(id);

// ---- 생물 도감 (localStorage 컬렉션 — 런 밖에 쌓이는 것) ----
export const DEX_NAMES = {
  orb: '발광 플랑크톤', cobalt: '은빛 치어', freeze: '냉기 진주', magnet: '소용돌이 진주',
  boost2: '황금진주', boost3: '무지개진주', octopus: '아기 문어', turtle: '등불 거북', whale: '심해 고래',
  drone: '독가시 성게', hunter: '아기상어', splitter: '분열 해파리', bullet: '작살', mine: '기뢰복어',
};
export const DEX_TOTAL = Object.keys(DEX_NAMES).length;
export function getDex() { try { return JSON.parse(localStorage.getItem('boom.dex') || '[]'); } catch { return []; } }
export function updateDex(discovered) { // 신규 발견 목록 반환
  const dex = new Set(getDex());
  const fresh = (discovered || []).filter((t) => DEX_NAMES[t] && !dex.has(t));
  fresh.forEach((t) => dex.add(t));
  if (fresh.length) localStorage.setItem('boom.dex', JSON.stringify([...dex]));
  renderDexProgress();
  return fresh;
}
export function renderDexProgress() {
  const el = $('dex-progress');
  if (el) el.textContent = `📖 생물도감 ${getDex().length}/${DEX_TOTAL}`;
}

export function showScreen(name) {
  $('screen-menu').classList.toggle('hidden', name !== 'menu');
  $('screen-result').classList.toggle('hidden', name !== 'result');
  $('hud').classList.toggle('hidden', name !== 'play');
}

// ---- 자세히 보기: 초간단 (GDD §8) ----
const CATALOG = `
<div class="howto-row g">푸른 것 = 먹이 (플랑크톤·치어·진주)
  <span class="icons">● ◆ ❄ ◎ ★ ✦</span>
</div>
<div class="howto-row b">붉은 것 = 포식자 (물리면 목숨 -1, 3번이면 끝)
  <span class="icons">● ▲ ◉ — ✱</span>
</div>
<div class="howto-tips">
  · 쉬지 않고 먹으면 <b>콤보 최대 ×10</b> — 점수의 핵심<br>
  · <b>★ 황금진주 = 점수 ×2</b> (8초) · <b>✦ 무지개진주 = 점수 ×3</b> (5초, 희귀)<br>
  · 진주 효과 중 물리면 효과 소멸 — 지켜라<br>
  · 포식자를 아슬하게 스치면 <b>+2</b> · 25마리 먹을 때마다 <b>광란의 포식</b>(4초 무적+흡입)<br>
  · <b>기뢰복어</b>는 부풀기 전엔 무해 · <b>작살</b>은 경고선을 보고 피할 것<br>
  · 🐙 <b>아기 문어</b>=플랑크톤 파티 · 🐢 <b>등불 거북</b>=실드 1회 · 🐋 <b>고래</b>가 지나가면 잭팟 타임<br>
  · 만난 생물은 <b>생물도감</b>(14종)에 기록된다 — 전부 모아보자
</div>`;

export function initHowto() {
  $('howto-content').innerHTML = CATALOG;
  const seen = localStorage.getItem('boom.howtoSeen');
  const open = () => { $('modal-howto').classList.remove('hidden'); localStorage.setItem('boom.howtoSeen', '1'); $('howto-badge').classList.add('hidden'); };
  const close = () => $('modal-howto').classList.add('hidden');
  $('btn-howto').addEventListener('click', open);
  $('btn-howto-close').addEventListener('click', close);
  if (seen) $('howto-badge').classList.add('hidden');
  else open(); // 첫 방문 자동 오픈
}

// ---- 결과 화면 (내 기록 카드) ----
export function showResult(r, best, myName, freshDex = []) {
  showScreen('result');
  $('result-discover').innerHTML = freshDex.length
    ? `🆕 첫 발견! <b>${freshDex.map((t) => DEX_NAMES[t]).join(', ')}</b>`
    : '';
  $('result-cause').textContent = r.cause;
  $('result-cause').style.color = 'var(--bad-deep)';
  const el = $('result-score');
  el.textContent = r.score;
  const isNewBest = r.score > (best || 0);
  el.classList.toggle('newbest', isNewBest);
  $('result-best').textContent = isNewBest
    ? '🏆 NEW BEST!'
    : `베스트 ${best}점 — 베스트까지 ${best - r.score}점`;
  $('result-rank').textContent = '';
  $('result-stats').textContent =
    `생존 ${r.survival}초 · 최대 콤보 ×${r.maxCombo} · 니어미스 ${r.nearMiss}`;
}

// ---- 첫 화면 리더보드 TOP 15 — 포디움 + NEW 배지 + 다음 목표 + 오늘 판수 ----
export async function renderMenuBoard(myName) {
  try {
    const { list, key, meta } = await getBoard('score');
    const now = Date.now();
    const rows = list.slice(0, 15).map((e, i) => {
      const isNew = e.at && now - e.at < 3600e3;                   // 1시간 내 신규 기록
      const cls = [e.name === myName ? 'me' : '', i < 3 ? `r${i + 1}` : ''].join(' ');
      const medal = i === 0 ? '👑' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1;
      return `<li class="${cls}"><span class="rk">${medal}</span><span class="nm">${e.name}</span>${isNew ? '<span class="newb">NEW</span>' : ''}<span class="sc">${e[key]}</span></li>`;
    }).join('');
    $('menu-board-list').innerHTML = rows || '<li class="dim">아직 기록 없음 — 첫 주인공이 되자</li>';
    // 다음 목표 — 나를 기준으로 바로 위 한 명
    const myIdx = list.findIndex((e) => e.name === myName);
    let target;
    if (myIdx === 0) target = '👑 왕좌 방어전! 모두가 너를 노린다';
    else if (myIdx > 0) target = `🎯 다음 목표: <b>${list[myIdx - 1].name}</b> (-${list[myIdx - 1][key] - list[myIdx][key] + 1}점)`;
    else if (list.length) target = `🎯 첫 목표: <b>${list[list.length - 1].name}</b> 제치기`;
    else target = '첫 기록의 주인공이 되자';
    $('menu-board-target').innerHTML = target;
    $('menu-board-meta').textContent = meta ? `🔥 오늘 ${meta.runsToday}판 열림 · 총 ${meta.totalRuns}판` : '';
  } catch { $('menu-board-list').innerHTML = '<li class="dim">불러오기 실패</li>'; }
}

// ---- 리더보드 카드 + 내 순위/다음 순위까지 격차 (집착 장치) ----
export async function renderBoard(board, myName) {
  document.querySelectorAll('.board-tabs .tab').forEach((b) =>
    b.classList.toggle('selected', b.dataset.board === board));
  const { list, key } = await getBoard(board);
  $('board-list').innerHTML = list.map((e, i) =>
    `<li class="${e.name === myName ? 'me' : ''}">${e.name} — ${e[key]}</li>`).join('');
  if (board === 'score') {
    const idx = list.findIndex((e) => e.name === myName);
    if (idx === 0) $('result-rank').textContent = '👑 현재 1위!';
    else if (idx > 0) {
      const gap = list[idx - 1][key] - list[idx][key];
      $('result-rank').textContent = `현재 ${idx + 1}위 — ${idx}위까지 ${gap + 1}점`;
    }
  }
}
