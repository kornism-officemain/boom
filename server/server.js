// boom — 단일 서버: 정적 서빙 + config + 랭킹 + 관리자 API
const express = require('express');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'boom-admin';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data'); // Render 영구디스크 대응
const SCORES_FILE = path.join(DATA_DIR, 'scores.json');
const OVERRIDES_FILE = path.join(DATA_DIR, 'config.overrides.json');
const DEFAULTS = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.defaults.json'), 'utf8'));

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const loadJson = (f, fallback) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fallback; } };
const saveJson = (f, obj) => fs.writeFileSync(f, JSON.stringify(obj, null, 2));

let scores = loadJson(SCORES_FILE, []);
let overrides = loadJson(OVERRIDES_FILE, {});

// 깊은 병합: defaults ← overrides (숫자만 허용)
function mergedConfig() {
  const out = JSON.parse(JSON.stringify(DEFAULTS));
  for (const [sec, vals] of Object.entries(overrides)) {
    if (out[sec] && typeof vals === 'object') {
      for (const [k, v] of Object.entries(vals)) {
        if (typeof out[sec][k] === 'number' && typeof v === 'number') out[sec][k] = v;
      }
    }
  }
  return out;
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const adminOnly = (req, res, next) =>
  req.get('x-admin-key') === ADMIN_KEY ? next() : res.status(403).json({ error: 'bad admin key' });

app.get('/api/config', (req, res) => res.json(mergedConfig()));
app.get('/api/admin/config', adminOnly, (req, res) => res.json({ defaults: DEFAULTS, overrides }));
app.post('/api/admin/config', adminOnly, (req, res) => {
  overrides = req.body && typeof req.body === 'object' ? req.body : {};
  saveJson(OVERRIDES_FILE, overrides);
  res.json({ ok: true, config: mergedConfig() });
});
app.post('/api/admin/reset-scores', adminOnly, (req, res) => {
  scores = []; saveJson(SCORES_FILE, scores); res.json({ ok: true });
});

// 점수 제출 — 팀 내부용이라 안티치트 없음, sanity 클램프만
app.post('/api/scores', (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim().slice(0, 12);
  if (!name) return res.status(400).json({ error: 'name required' });
  const clamp = (v, max) => Math.max(0, Math.min(Math.round(Number(v) || 0), max));
  const entry = {
    name,
    mode: String(b.mode || 'CLASSIC').slice(0, 16),
    score: clamp(b.score, 1000000),
    survival: clamp(b.survival, 200),
    maxCombo: clamp(b.maxCombo, 5),
    nearMiss: clamp(b.nearMiss, 500),
    cleared: !!b.cleared,
    at: Date.now(),
  };
  scores.push(entry);
  if (scores.length > 5000) scores = scores.slice(-5000);
  saveJson(SCORES_FILE, scores);
  res.json({ ok: true });
});

// 보드별 랭킹 — 이름당 베스트 1개만
const BOARDS = { score: 'score', survival: 'survival', combo: 'maxCombo', nearmiss: 'nearMiss' };
app.get('/api/leaderboard', (req, res) => {
  const key = BOARDS[req.query.board] || 'score';
  const best = new Map();
  for (const s of scores) {
    const cur = best.get(s.name);
    if (!cur || s[key] > cur[key]) best.set(s.name, s);
  }
  const topN = mergedConfig().leaderboard.topN;
  const list = [...best.values()].sort((a, b) => b[key] - a[key]).slice(0, topN);
  res.json({ board: req.query.board || 'score', key, list });
});

app.listen(PORT, () => {
  console.log(`boom  →  http://localhost:${PORT}`);
  console.log(`admin →  http://localhost:${PORT}/admin.html  (key: ${ADMIN_KEY})`);
});
