// API 래퍼 — 서버 통신은 전부 여기서만
export async function getConfig() {
  const r = await fetch('/api/config');
  return r.json();
}

export async function postScore(entry) {
  const r = await fetch('/api/scores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  });
  return r.json();
}

export async function getBoard(board = 'score') {
  const r = await fetch(`/api/leaderboard?board=${board}`);
  return r.json();
}
