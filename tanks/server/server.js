// tanky — 단일 서버: 정적 서빙 + config + 랭킹 + 관리자 API (boom 패턴 계승)
const express = require('express');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3100;
const ADMIN_KEY = process.env.ADMIN_KEY || 'tanky-admin';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data'); // Render 영구디스크 대응
const SCORES_FILE = path.join(DATA_DIR, 'scores.json');
const OVERRIDES_FILE = path.join(DATA_DIR, 'config.overrides.json');
// readJson: 클라우드 동기화(OneDrive 등)가 남기는 후행 NUL/공백 방어
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/[\0\s]+$/, ''));
const DEFAULTS = readJson(path.join(__dirname, 'config.defaults.json'));

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const loadJson = (f, fallback) => { try { return readJson(f); } catch { return fallback; } };
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
app.use(express.static(path.join(__dirname, '..', 'public'), {
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'), // 배포 후 구버전 섞임 방지
}));

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

// 점수 제출 — 팀 내부용, sanity 클램프만
app.post('/api/scores', (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim().slice(0, 12);
  if (!name) return res.status(400).json({ error: 'name required' });
  const clamp = (v, max) => Math.max(0, Math.min(Math.round(Number(v) || 0), max));
  const entry = {
    name,
    score: clamp(b.score, 5000000),
    level: clamp(b.level, 30),
    kills: clamp(b.kills, 500),
    survival: clamp(b.survival, 7200),
    cls: String(b.cls || 'basic').slice(0, 16),
    at: Date.now(),
  };
  scores.push(entry);
  if (scores.length > 5000) scores = scores.slice(-5000);
  saveJson(SCORES_FILE, scores);
  res.json({ ok: true });
});

// 보드별 랭킹 — 이름당 베스트 1개만
const BOARDS = { score: 'score', level: 'level', kills: 'kills', survival: 'survival' };
app.get('/api/leaderboard', (req, res) => {
  const key = BOARDS[req.query.board] || 'score';
  const best = new Map();
  for (const s of scores) {
    const cur = best.get(s.name);
    if (!cur || s[key] > cur[key]) best.set(s.name, s);
  }
  const topN = mergedConfig().leaderboard.topN;
  const list = [...best.values()].sort((a, b) => b[key] - a[key]).slice(0, topN);
  res.json({ board: key, list });
});

app.listen(PORT, () => {
  console.log(`tanky http://localhost:${PORT}  (admin key: ${ADMIN_KEY})`);
});
