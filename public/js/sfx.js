// WebAudio 합성 사운드 — 에셋 파일 없음 (CLAUDE.md 스택 규칙 준수).
// unlock()은 유저 제스처(START 클릭)에서 1회 호출. unlock 전엔 전부 no-op → 헤드리스 테스트 안전.
let ac = null;
let muted = false;

function tone(freq, dur, type = 'sine', vol = 0.12, delay = 0) {
  if (!ac || muted) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(ac.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

function slide(f1, f2, dur, type = 'sine', vol = 0.12) {
  if (!ac || muted) return;
  const t = ac.currentTime;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f1, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(f2, 1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(ac.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

export const sfx = {
  unlock() {
    if (!ac && typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext))
      ac = new (window.AudioContext || window.webkitAudioContext)();
    if (ac && ac.state === 'suspended') ac.resume();
  },
  toggle() { muted = !muted; return muted; },

  collect(combo = 1) { tone(392 * Math.pow(1.1225, Math.min(combo, 8)), 0.07, 'triangle', 0.11); }, // 콤보 오를수록 피치 ↑
  special() { tone(523, 0.08, 'triangle', 0.1); tone(784, 0.1, 'triangle', 0.1, 0.07); },
  heart() { slide(440, 880, 0.25, 'sine', 0.12); },
  milestone() { tone(659, 0.1, 'triangle', 0.1); tone(880, 0.14, 'triangle', 0.1, 0.09); },
  shoot() { tone(1200, 0.03, 'square', 0.025); },
  kill() { slide(700, 180, 0.12, 'square', 0.09); },
  whale() { slide(85, 55, 1.4, 'sine', 0.2); slide(140, 95, 1.2, 'sine', 0.08); }, // 고래 울음
  rare() { [880, 1174, 1568, 2093].forEach((f, i) => tone(f, 0.12, 'triangle', 0.1, i * 0.06)); }, // 무지개 반짝
  bite() { tone(150, 0.09, 'square', 0.2); slide(420, 180, 0.12, 'sawtooth', 0.1); }, // 박치기 쿵
  jackpotIntro() { slide(70, 50, 1.6, 'sine', 0.22); [392, 494, 587, 740].forEach((f, i) => tone(f, 0.16, 'triangle', 0.12, 0.3 + i * 0.12)); },
  jackpot() { [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 0.22, 'square', 0.1, i * 0.09)); tone(65, 0.5, 'sine', 0.25); },
  shield() { tone(880, 0.07, 'triangle', 0.1); tone(1320, 0.12, 'triangle', 0.1, 0.06); },
  shieldBreak() { slide(620, 140, 0.22, 'square', 0.14); },
  levelup() { [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.14, 'triangle', 0.12, i * 0.08)); },
  nearMiss() { tone(1568, 0.04, 'sine', 0.05); },
  rush() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.09, 'square', 0.06, i * 0.06)); },
  hit() { slide(220, 55, 0.25, 'sawtooth', 0.18); },
  death() { [330, 262, 196, 131].forEach((f, i) => tone(f, 0.18, 'sawtooth', 0.11, i * 0.14)); },
  clear() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.15, 'triangle', 0.11, i * 0.1)); },
  newBest() { [784, 988, 1175, 1568, 1976].forEach((f, i) => tone(f, 0.2, 'square', 0.07, i * 0.11)); },
};
