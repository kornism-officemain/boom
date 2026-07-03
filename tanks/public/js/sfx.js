// WebAudio 합성 사운드 — 에셋 파일 없음. unlock 전엔 no-op (헤드리스 안전)
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

  shoot() { tone(880 + Math.random() * 200, 0.035, 'square', 0.02); },
  shapeHit() { tone(300, 0.03, 'triangle', 0.04); },
  shapeBreak(kind) { slide({ square: 500, tri: 420, penta: 340 }[kind] || 500, 120, 0.12, 'triangle', 0.09); },
  hurt() { slide(220, 70, 0.18, 'sawtooth', 0.14); },
  kill() { slide(700, 180, 0.16, 'square', 0.11); tone(1047, 0.1, 'triangle', 0.08, 0.1); },
  levelup() { [523, 659, 784].forEach((f, i) => tone(f, 0.1, 'triangle', 0.1, i * 0.06)); },
  classup() { [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.13, 'triangle', 0.12, i * 0.07)); },
  statup() { tone(660, 0.06, 'triangle', 0.08); },
  death() { slide(300, 40, 0.7, 'sawtooth', 0.16); },
  newBest() { [659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.15, 'triangle', 0.12, i * 0.09)); },
};
