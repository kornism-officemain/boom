// DOM 씬 전환 + 자세히보기 모달 + 결과/랭킹 렌더
import { getBoard } from './net.js';

const $ = (id) => document.getElementById(id);

export function showScreen(name) {
  $('screen-menu').classList.toggle('hidden', name !== 'menu');
  $('screen-result').classList.toggle('hidden', name !== 'result');
  $('hud').classList.toggle('hidden', name !== 'play');
}

// ---- 자세히 보기: 알면 점수가 오르는 "도감" (GDD §8 유도 장치) ----
const CATALOG = `
<p><b>점수 공식</b>: 수집 × 콤보(최대 ×5) × 스타 배수 + 니어미스 + 생존. <b>쉬지 않고 먹는 사람</b>이 이긴다.</p>
<table>
<tr><th></th><th>이름</th><th>효과 / 대처</th></tr>
<tr><td class="obj-dot" style="color:#7ec8f7">●</td><td>오브</td><td>+1. 기본 수입, 5초 뒤 사라짐</td></tr>
<tr><td class="obj-dot" style="color:#2b6fb3">◆</td><td>코발트</td><td>+5. 빠르게 떠다님 — 쫓을 가치 있음</td></tr>
<tr><td class="obj-dot" style="color:#4dd6e8">❄</td><td>프리즈</td><td>2.5초 적 전체 슬로우. 위기 때 아껴 먹기</td></tr>
<tr><td class="obj-dot" style="color:#2ec4b6">◎</td><td>마그넷</td><td>4초 자석. 오브 많을 때 먹으면 이득 극대화</td></tr>
<tr><td class="obj-dot" style="color:#7b68ee">★</td><td>스타</td><td>8초 점수 ×2. 최고의 욕심, 최다 사망 원인</td></tr>
<tr><td class="obj-dot" style="color:#5aa9e6">⏱</td><td>타임</td><td>+15초 연장 (최대 3분). 더 벌까, 더 위험할까</td></tr>
<tr><td class="obj-dot" style="color:#ff8c5a">●</td><td>드론</td><td>직선 횡단. 경로만 읽으면 안전</td></tr>
<tr><td class="obj-dot" style="color:#d7263d">▲</td><td>헌터</td><td>6초간 추적. <b>멈추면 죽는다</b> — 계속 이동</td></tr>
<tr><td class="obj-dot" style="color:#ff6b6b">●</td><td>스플리터</td><td>중간에 2개로 분열. 빨리 먹고 빠져라</td></tr>
<tr><td class="obj-dot" style="color:#ff3b3b">—</td><td>불릿</td><td>경고선 0.8초 뒤 발사. 선을 밟지 마라</td></tr>
<tr><td class="obj-dot" style="color:#8e1e1e">✱</td><td>마인</td><td>고정 지뢰 8초. 안전지대가 줄어든다</td></tr>
</table>
<p><b>숨은 테크닉</b>: 위협을 아슬하게 스치면 <b>니어미스 +2</b> (위협당 1회). 25개 수집마다 <b>러시 모드</b> — 4초 무적+자석.</p>
<p><b>조작</b>: 마우스 따라가기 또는 방향키/WASD. 편한 쪽으로.</p>`;

export function initHowto() {
  $('howto-content').innerHTML = CATALOG;
  const seen = localStorage.getItem('boom.howtoSeen');
  const open = () => { $('modal-howto').classList.remove('hidden'); localStorage.setItem('boom.howtoSeen', '1'); $('howto-badge').classList.add('hidden'); };
  const close = () => $('modal-howto').classList.add('hidden');
  $('btn-howto').addEventListener('click', open);
  $('btn-howto-close').addEventListener('click', close);
  if (seen) $('howto-badge').classList.add('hidden');
  else open(); // 첫 방문 자동 오픈 (GDD §8 ①)
}

// ---- 결과 화면 ----
export function showResult(r, best, myName) {
  showScreen('result');
  $('result-cause').textContent = r.cause;
  $('result-cause').style.color = r.cleared ? 'var(--good-deep)' : 'var(--bad-deep)';
  const el = $('result-score');
  el.textContent = r.score;
  const isNewBest = r.score > (best || 0);
  el.classList.toggle('newbest', isNewBest);
  $('result-best').textContent = isNewBest
    ? '🏆 NEW BEST!'
    : `베스트 ${best}점 — 베스트까지 ${best - r.score}점`;
  $('result-stats').textContent =
    `생존 ${r.survival}초 · 최대 콤보 ×${r.maxCombo} · 니어미스 ${r.nearMiss}회`;
  renderBoard('score', myName);
}

export async function renderBoard(board, myName) {
  document.querySelectorAll('.board-tabs .tab').forEach((b) =>
    b.classList.toggle('selected', b.dataset.board === board));
  const { list, key } = await getBoard(board);
  $('board-list').innerHTML = list.map((e) =>
    `<li class="${e.name === myName ? 'me' : ''}">${e.name} — ${e[key]}</li>`).join('');
}
