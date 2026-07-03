// DOM 씬 전환 + 자세히보기 모달 + 결과/랭킹 렌더
import { getBoard } from './net.js';

const $ = (id) => document.getElementById(id);

export function showScreen(name) {
  $('screen-menu').classList.toggle('hidden', name !== 'menu');
  $('screen-result').classList.toggle('hidden', name !== 'result');
  $('hud').classList.toggle('hidden', name !== 'play');
}

// ---- 자세히 보기: 초간단 (GDD §8) ----
const CATALOG = `
<div class="howto-row g">파란 것 = 먹기
  <span class="icons">● ◆ ❄ ◎ ★ ♥</span>
</div>
<div class="howto-row b">빨간 것 = 피하기
  <span class="icons">● ▲ ◉ — ✱</span>
</div>
<div class="howto-tips">
  · 쉬지 않고 먹으면 <b>콤보 최대 ×10</b> — 점수의 핵심<br>
  · <b>자동 사격</b>: 기수 방향으로 발사 — 쏘고 싶으면 적을 향해 날 것<br>
  · 점수가 오르면 <b>기체 자동 진화 (최대 5단계)</b>: 체력·공격·속도 ↑<br>
  · 체력 게이지가 다 닳으면 목숨 -1 · <b>♥</b> = 목숨 +1<br>
  · 아슬하게 스치면 <b>+2</b> · 25개 수집마다 <b>러시</b>(4초 무적+자석)
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
export function showResult(r, best, myName) {
  showScreen('result');
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
    `생존 ${r.survival}초 · Lv.${r.lv || 1} · 격추 ${r.kills || 0} · 콤보 ×${r.maxCombo} · 니어미스 ${r.nearMiss}`;
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
