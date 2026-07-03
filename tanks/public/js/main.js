// 부트 + 씬 상태머신: menu → play → result → (한 판 더) play
import { getConfig, postScore } from './net.js';
import { input } from './input.js';
import { runGame } from './game.js';
import { sfx } from './sfx.js';
import * as ui from './ui.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
let cfg = null;
let stopGame = null;

const getName = () => $('name-input').value.trim().slice(0, 12);
const BEST_KEY = 'tanky.best';

async function startRun() {
  const name = getName();
  if (!name) { $('name-input').focus(); return; }
  localStorage.setItem('tanky.name', name);
  window.__myName = name;
  sfx.unlock(); // 유저 제스처에서 AudioContext 활성화
  cfg = await getConfig(); // 매 런마다 최신 config — 관리자 밸런싱 즉시 반영
  ui.showScreen('play');
  ui.hideClassModal();
  if (stopGame) stopGame();
  ui.renderStats({ points: 0, stats: Object.fromEntries(['regen','hp','body','bulletSpeed','pen','dmg','reload','speed'].map(k=>[k,0])) }, cfg);
  stopGame = runGame(cfg, canvas, ui, onRunEnd, { myName: name });
}

async function onRunEnd(r) {
  stopGame = null;
  const best = Number(localStorage.getItem(BEST_KEY) || 0);
  ui.showResult(r, best, getName());
  if (r.score > best) { localStorage.setItem(BEST_KEY, String(r.score)); sfx.newBest(); }
  postScore({ name: getName(), ...r }).then(() => {
    ui.renderBoard('score', getName());
    ui.renderMenuBoard(getName());
  }).catch(() => {});
}

function boot() {
  input.init(canvas);
  ui.initUi();
  $('name-input').value = localStorage.getItem('tanky.name') || '';
  ui.renderMenuBoard($('name-input').value.trim());
  $('btn-start').addEventListener('click', startRun);
  $('name-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') startRun(); });
  $('btn-retry').addEventListener('click', startRun); // 한 판 더 — 클릭 1번
  $('btn-menu').addEventListener('click', () => { ui.showScreen('menu'); ui.renderMenuBoard(getName()); });
}

boot();
