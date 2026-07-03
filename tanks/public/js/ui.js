// DOM 씬 전환 + HUD/스탯 패널/클래스 모달/결과/랭킹 렌더
import { getBoard } from './net.js';
import { STAT_KEYS, STAT_LABELS, xpNeed } from './entities.js';
import { TIER2 } from './classes.js';

const $ = (id) => document.getElementById(id);
const CLS_LABEL = { basic: '기본', twin: '트윈', sniper: '스나이퍼', mg: '머신건', flank: '플랭크' };
let statHandler = null;
let classCb = null;

export function showScreen(name) {
  for (const s of ['menu', 'play', 'result']) $(`screen-${s}`).classList.toggle('hidden', s !== name);
}

export function setStatHandler(fn) { statHandler = fn; }

export function initUi() {
  // 스탯 패널 — 이벤트 위임 1회 바인딩
  $('stat-panel').addEventListener('click', (e) => {
    const row = e.target.closest('[data-stat]');
    if (row && statHandler) statHandler(Number(row.dataset.stat));
  });
  $('class-modal').addEventListener('click', (e) => {
    const card = e.target.closest('[data-cls]');
    if (!card || !classCb) return;
    const cb = classCb; classCb = null;
    $('class-modal').classList.add('hidden');
    cb(card.dataset.cls === 'keep' ? null : card.dataset.cls);
  });
  // 리더보드 탭
  document.querySelectorAll('.board-tabs button').forEach((b) =>
    b.addEventListener('click', () => renderBoard(b.dataset.board, window.__myName || '')));
}

// ── HUD ──
export function renderStats(player, cfg) {
  const badge = $('hud-points');
  badge.textContent = player.points > 0 ? `스탯 포인트 ${player.points} (숫자키 1~8)` : '';
  badge.classList.toggle('hidden', player.points <= 0);
  $('stat-panel').innerHTML = STAT_KEYS.map((k, i) => {
    const v = player.stats[k], max = cfg.stats.maxPerStat;
    const pips = Array.from({ length: max }, (_, j) => `<i class="${j < v ? 'on' : ''}"></i>`).join('');
    const can = player.points > 0 && v < max;
    return `<div class="stat-row ${can ? 'can' : ''}" data-stat="${i}">
      <b>${i + 1}</b><span>${STAT_LABELS[k]}</span><div class="pips">${pips}</div>${can ? '<em>+</em>' : ''}
    </div>`;
  }).join('');
  $('stat-panel').classList.toggle('expanded', player.points > 0);
}

export function updateHud(player, st, cfg) {
  $('hud-score').textContent = Math.round(player.xp).toLocaleString();
  $('hud-kills').textContent = player.kills;
  const t = Math.floor(st.time);
  $('hud-time').textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  const need = xpNeed(player.level, cfg);
  const maxed = player.level >= cfg.level.max;
  $('hud-level').textContent = `Lv ${player.level} ${CLS_LABEL[player.cls]}`;
  $('xp-fill').style.width = maxed ? '100%' : `${Math.min(100, (player.xpInto / need) * 100)}%`;
  $('hp-fill').style.width = `${Math.max(0, (player.hp / player.maxHp) * 100)}%`;
  $('hp-fill').classList.toggle('low', player.hp / player.maxHp < 0.35);
}

// ── 클래스 선택 ──
export function showClassModal(classes, cb) {
  classCb = cb;
  $('class-cards').innerHTML = TIER2.map((k) => `
    <button class="class-card" data-cls="${k}"><b>${classes[k].label}</b><span>${classes[k].desc}</span></button>
  `).join('') + `<button class="class-card keep" data-cls="keep"><b>기본 유지</b><span>클래스 없이 계속</span></button>`;
  $('class-modal').classList.remove('hidden');
}
export function hideClassModal() { classCb = null; $('class-modal').classList.add('hidden'); }

// ── 결과 ──
export function showResult(r, best, name) {
  showScreen('result');
  $('r-cause').textContent = r.cause ? `— ${r.cause} —` : '';
  $('r-score').textContent = r.score.toLocaleString();
  $('r-detail').innerHTML =
    `Lv <b>${r.level}</b> · ${CLS_LABEL[r.cls] || r.cls} · 격파 <b>${r.kills}</b> · 생존 <b>${fmtTime(r.survival)}</b>`;
  const nb = $('r-newbest');
  nb.classList.toggle('hidden', r.score <= best);
  $('r-best').textContent = `내 최고: ${Math.max(best, r.score).toLocaleString()}`;
  window.__myName = name;
  renderBoard('score', name);
}

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const VAL = {
  score: (e) => e.score.toLocaleString(),
  level: (e) => `Lv ${e.level}`,
  kills: (e) => `${e.kills}킬`,
  survival: (e) => fmtTime(e.survival),
};

export async function renderBoard(board, myName) {
  document.querySelectorAll('.board-tabs button').forEach((b) =>
    b.classList.toggle('active', b.dataset.board === board));
  const el = $('board-list');
  el.innerHTML = '<li class="dim">불러오는 중...</li>';
  try {
    const { list } = await getBoard(board);
    el.innerHTML = list.length ? list.map((e, i) => `
      <li class="${e.name === myName ? 'me' : ''}">
        <b>${i + 1}</b><span>${esc(e.name)}</span><i>${CLS_LABEL[e.cls] || ''}</i><em>${VAL[board](e)}</em>
      </li>`).join('') : '<li class="dim">아직 기록이 없습니다 — 1등을 가져가세요</li>';
  } catch { el.innerHTML = '<li class="dim">랭킹을 불러오지 못했습니다</li>'; }
}

export async function renderMenuBoard(myName) {
  const el = $('menu-board');
  try {
    const { list } = await getBoard('score');
    el.innerHTML = list.slice(0, 5).map((e, i) =>
      `<li class="${e.name === myName ? 'me' : ''}"><b>${i + 1}</b><span>${esc(e.name)}</span><em>${e.score.toLocaleString()}</em></li>`
    ).join('') || '<li class="dim">첫 기록의 주인공이 되세요</li>';
  } catch { el.innerHTML = ''; }
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
