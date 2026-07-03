// 부트 + 씬 상태머신: menu → play → result → (한 판 더) play
import { getConfig, postScore, getBoard } from './net.js';
import { input } from './input.js';
import { runGame } from './game.js';
import { sfx } from './sfx.js';
import { showScreen, initHowto, showResult, renderBoard, renderMenuBoard } from './ui.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const hud = { score: $('hud-score'), lives: $('hud-lives'), time: $('hud-time'), boost: $('hud-boost'), banner: $('levelup-banner') };

let cfg = null;
let mode = 'CLASSIC';
let playing = false;

const getName = () => $('name-input').value.trim().slice(0, 12);
const bestKey = () => `boom.best.${mode}`;

async function startRun() {
  const name = getName();
  if (!name) { $('name-input').focus(); return; }
  localStorage.setItem('boom.name', name);
  sfx.unlock(); // 유저 제스처에서 AudioContext 활성화
  let rivals = [];
  [cfg, rivals] = await Promise.all([
    getConfig(), // 매 런마다 최신 config — 관리자 밸런싱 즉시 반영
    getBoard('score').then((b) => b.list).catch(() => []),
  ]);
  showScreen('play');
  playing = true;
  if (hud.boost) hud.boost.className = 'hidden'; // 런 시작 시 부스터 배지 리셋
  if (hud.banner) hud.banner.classList.add('hidden');
  runGame(cfg, canvas, hud, onRunEnd, {
    best: Number(localStorage.getItem(bestKey()) || 0),
    rivals, myName: name,
  });
}

async function onRunEnd(r) {
  playing = false;
  const name = getName();
  const best = Number(localStorage.getItem(bestKey()) || 0);
  showResult(r, best, name);
  if (r.score > best) { localStorage.setItem(bestKey(), String(r.score)); sfx.newBest(); }
  postScore({ name, mode, ...r }).then(() => { renderBoard('score', name); renderMenuBoard(name); }).catch(() => {});
}

function boot() {
  input.init(canvas);
  initHowto();
  $('name-input').value = localStorage.getItem('boom.name') || '';
  renderMenuBoard($('name-input').value.trim()); // 첫 화면 리더보드

  $('btn-start').addEventListener('click', startRun);
  $('name-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') startRun(); });
  $('btn-retry').addEventListener('click', startRun); // 클릭 1번 재시작 (철칙 8)
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !playing && !$('screen-result').classList.contains('hidden')) {
      e.preventDefault(); startRun();
    }
    if (e.code === 'KeyM' && document.activeElement !== $('name-input')) {
      const m = sfx.toggle();
      $('hud-score').title = m ? '음소거' : '';
    }
  });
  document.querySelectorAll('.board-tabs .tab').forEach((b) =>
    b.addEventListener('click', () => renderBoard(b.dataset.board, getName())));

  showScreen('menu');
}

boot();
