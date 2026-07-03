// 시각 효과 — 파티클, 플로터(텍스트 팝업), 화면 흔들림/플래시.
// 여기의 숫자는 밸런스가 아닌 연출 상수 (config 대상 아님).
export function createFx() {
  return { parts: [], floats: [], shake: 0, flash: 0, flashColor: 'rgba(255,80,80,0.25)' };
}

export function burst(fx, x, y, color, n = 8, speed = 180) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random() * 0.8);
    fx.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5, max: 0.5, color, r: 2 + Math.random() * 2.5 });
  }
}

export function floatText(fx, x, y, text, color, size = 14) {
  fx.floats.push({ x, y, text, color, size, life: 0.9, max: 0.9 });
}

export function shake(fx, power) { fx.shake = Math.max(fx.shake, power); }
export function flash(fx, color) { fx.flash = 0.18; fx.flashColor = color; }

export function updateFx(fx, dt) {
  fx.shake = Math.max(0, fx.shake - dt * 30);
  fx.flash = Math.max(0, fx.flash - dt);
  for (const p of fx.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; p.life -= dt; }
  for (const f of fx.floats) { f.y -= 40 * dt; f.life -= dt; }
  fx.parts = fx.parts.filter((p) => p.life > 0);
  fx.floats = fx.floats.filter((f) => f.life > 0);
}

// 월드 좌표계 안에서 호출 (셰이크 translate 적용 상태)
export function drawFx(fx, ctx) {
  for (const p of fx.parts) {
    ctx.globalAlpha = p.life / p.max; ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (p.life / p.max), 0, Math.PI * 2); ctx.fill();
  }
  for (const f of fx.floats) {
    ctx.globalAlpha = Math.min(1, (f.life / f.max) * 1.5); ctx.fillStyle = f.color;
    ctx.font = `bold ${f.size}px sans-serif`; ctx.textAlign = 'center';
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}
