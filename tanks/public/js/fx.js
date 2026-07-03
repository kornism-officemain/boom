// 파티클/플로터/셰이크 — 연출 상수는 여기 하드코딩 허용 (boom 규약)
export function makeFx() {
  return { parts: [], floaters: [], shake: 0 };
}

export function burst(fx, x, y, color, n = 10, speed = 130) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.8);
    fx.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5, max: 0.5, r: 2 + Math.random() * 3, color });
  }
}

export function floater(fx, x, y, text, color = '#3a3f52') {
  fx.floaters.push({ x, y, text, color, life: 0.9, max: 0.9 });
}

export function addShake(fx, amt) { fx.shake = Math.min(fx.shake + amt, 14); }

export function updateFx(fx, dt) {
  fx.shake = Math.max(0, fx.shake - dt * 30);
  fx.parts = fx.parts.filter((p) => {
    p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= 0.92; p.vy *= 0.92;
    return p.life > 0;
  });
  fx.floaters = fx.floaters.filter((f) => { f.life -= dt; f.y -= 34 * dt; return f.life > 0; });
}

// 월드 좌표계(카메라 변환 후)에서 호출
export function drawFx(fx, ctx) {
  for (const p of fx.parts) {
    ctx.globalAlpha = p.life / p.max;
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  ctx.font = 'bold 14px "Segoe UI", sans-serif';
  for (const f of fx.floaters) {
    ctx.globalAlpha = Math.min(1, f.life / f.max * 1.6);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}
