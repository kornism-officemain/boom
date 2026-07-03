// 플레이 씬 — 루프, 스폰, 충돌, 점수. 밸런스 숫자는 전부 cfg(서버 config)에서.
// 오브젝트 추가 = GOODS/THREATS 레지스트리에 엔트리 추가 + config 계수 + schedule 등록. (CLAUDE.md 철칙 2)
import { input } from './input.js';
import { createFx, burst, floatText, shake, flash, updateFx, drawFx } from './fx.js';
import { sfx } from './sfx.js';

// 색 문법: 푸른 계열 = 이득 / 붉은 계열 = 위협 (GDD §0)
const C = {
  player: '#3a3f52', orb: '#7ec8f7', cobalt: '#2b6fb3', freeze: '#4dd6e8',
  magnet: '#2ec4b6', star: '#7b68ee', timeExt: '#5aa9e6',
  drone: '#ff8c5a', hunter: '#d7263d', splitter: '#ff6b6b', bullet: '#ff3b3b', mine: '#8e1e1e',
};

export function runGame(cfg, canvas, hud, onEnd) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const rand = (a, b) => a + Math.random() * (b - a);

  // ---- 런 상태 ----
  const s = {
    t: 0, timeLeft: cfg.run.timeLimit, lives: cfg.run.lives, invuln: 0,
    score: 0, survivalAcc: 0, collected: 0,
    combo: 0, comboTimer: 0, maxCombo: 0, nearMiss: 0,
    rush: 0, star: 0, freeze: 0, magnet: 0, slowmo: 0,
    cause: '', over: false,
    p: { x: W / 2, y: H / 2, r: cfg.player.radius },
    goods: [], threats: [],
    orbTimer: 0, threatTimer: 0,
  };

  const speedCoef = () => Math.min(1 + s.t / cfg.difficulty.speedDiv, cfg.difficulty.speedMax);
  const spawnCoef = () => Math.min(1 + s.t / cfg.difficulty.spawnDiv, cfg.difficulty.spawnMax);
  const unlocked = (name) => s.t >= (cfg.schedule[name] ?? 0);
  const fx = createFx();
  const onCollect = (base, g) => {
    s.comboTimer > 0 ? (s.combo = Math.min(s.combo + 1, cfg.combo.max)) : (s.combo = 1);
    s.comboTimer = cfg.combo.window;
    s.maxCombo = Math.max(s.maxCombo, s.combo);
    const gained = base * s.combo * (s.star > 0 ? cfg.star.multiplier : 1);
    s.score += gained;
    floatText(fx, g.x, g.y, `+${gained}`, C.cobalt, 12 + s.combo * 2); // 콤보 클수록 팝업 크게
    sfx.collect(s.combo);
    s.collected++;
    if (s.collected % cfg.rush.need === 0) { // 러시 모드 발동
      s.rush = cfg.rush.duration;
      floatText(fx, s.p.x, s.p.y - 28, 'RUSH!', C.star, 26);
      burst(fx, s.p.x, s.p.y, C.star, 22, 280);
      sfx.rush();
    }
  };

  // ---- 좋은 것 레지스트리 (푸른 계열) ----
  const GOODS = {
    orb: {
      spawn: () => ({ type: 'orb', x: rand(30, W - 30), y: rand(30, H - 30), r: cfg.orb.radius, life: cfg.orb.life }),
      collect: (g) => onCollect(cfg.orb.score, g),
    },
    cobalt: {
      spawn: () => {
        const a = rand(0, Math.PI * 2);
        return { type: 'cobalt', x: rand(60, W - 60), y: rand(60, H - 60), r: cfg.cobalt.radius,
                 life: cfg.cobalt.life, vx: Math.cos(a) * cfg.cobalt.speed, vy: Math.sin(a) * cfg.cobalt.speed };
      },
      collect: (g) => onCollect(cfg.cobalt.score, g),
    },
    freeze: { // 위협 전체 슬로우 — 핀치 역전 수단
      spawn: () => ({ type: 'freeze', x: rand(40, W - 40), y: rand(40, H - 40), r: cfg.freeze.radius, life: cfg.freeze.life }),
      collect: (g) => { s.freeze = cfg.freeze.duration; floatText(fx, g.x, g.y, 'FREEZE ❄', C.freeze, 18); sfx.special(); },
    },
    magnet: { // 자석 — 먹는 타이밍 최적화 유도
      spawn: () => ({ type: 'magnet', x: rand(40, W - 40), y: rand(40, H - 40), r: cfg.magnet.pickRadius, life: cfg.magnet.life }),
      collect: (g) => { s.magnet = cfg.magnet.duration; floatText(fx, g.x, g.y, 'MAGNET ◎', C.magnet, 18); sfx.special(); },
    },
    star: { // 점수 ×2 — 최대 욕심, 사망 원인 1위 설계
      spawn: () => ({ type: 'star', x: rand(40, W - 40), y: rand(40, H - 40), r: cfg.star.radius, life: cfg.star.life }),
      collect: (g) => { s.star = cfg.star.duration; floatText(fx, g.x, g.y, `점수 ×${cfg.star.multiplier}!`, C.star, 20); sfx.special(); },
    },
    timeExt: { // +15초 — 더 벌 것인가, 더 오래 버틸 위험을 질 것인가
      spawn: () => ({ type: 'timeExt', x: rand(40, W - 40), y: rand(40, H - 40), r: cfg.timeExt.radius, life: cfg.timeExt.life }),
      collect: (g) => {
        s.timeLeft = Math.min(s.timeLeft + cfg.timeExt.amount, cfg.run.timeCap - s.t);
        floatText(fx, g.x, g.y, `+${cfg.timeExt.amount}s`, C.timeExt, 20); sfx.timeExt();
      },
    },
  };
  const SPECIAL_GOODS = ['cobalt', 'freeze', 'magnet', 'star', 'timeExt'];

  // ---- 나쁜 것 레지스트리 (붉은 계열) ----
  const THREATS = {
    drone: {
      weight: () => 1, // 나머지 가중치의 기본값
      spawn: () => {
        const side = Math.floor(rand(0, 4)); // 가장자리 → 직선 횡단
        const v = cfg.difficulty.threatBaseSpeed * speedCoef();
        const m = 20;
        const [x, y, vx, vy] = [
          [-m, rand(0, H), v, 0], [W + m, rand(0, H), -v, 0],
          [rand(0, W), -m, 0, v], [rand(0, W), H + m, 0, -v],
        ][side];
        return { type: 'drone', x, y, vx, vy, r: 10 };
      },
      update: (o, dt) => { o.x += o.vx * dt; o.y += o.vy * dt; o.dead = o.x < -40 || o.x > W + 40 || o.y < -40 || o.y > H + 40; },
    },
    hunter: {
      weight: () => (unlocked('hunter') && s.threats.filter((t) => t.type === 'hunter').length < cfg.hunter.maxAlive ? cfg.hunter.weight : 0),
      spawn: () => ({ type: 'hunter', x: rand(0, 1) < 0.5 ? -20 : W + 20, y: rand(0, H), r: 11, life: cfg.hunter.life }),
      update: (o, dt) => {
        const d = Math.hypot(s.p.x - o.x, s.p.y - o.y) || 1;
        const v = cfg.hunter.speed * speedCoef();
        o.x += ((s.p.x - o.x) / d) * v * dt;
        o.y += ((s.p.y - o.y) / d) * v * dt;
        o.life -= dt; o.dead = o.life <= 0;
      },
    },
    splitter: { // 횡단 중 1회 분열 → 밀도 압박
      weight: () => (unlocked('splitter') ? cfg.splitter.weight : 0),
      spawn: () => {
        const base = THREATS.drone.spawn();
        return { ...base, type: 'splitter', r: cfg.splitter.radius,
                 splitIn: rand(cfg.splitter.splitMin, cfg.splitter.splitMax), canSplit: true };
      },
      update: (o, dt) => {
        THREATS.drone.update(o, dt);
        if (o.canSplit && (o.splitIn -= dt) <= 0) {
          o.canSplit = false;
          const a = Math.atan2(o.vy, o.vx), v = Math.hypot(o.vx, o.vy);
          for (const da of [-0.45, 0.45]) {
            s.threats.push({ ...o, vx: Math.cos(a + da) * v, vy: Math.sin(a + da) * v, canSplit: false, nmDone: false });
          }
          o.dead = true;
        }
      },
    },
    bullet: { // 경고선 0.8초 → 고속 직사. 텔레그래프 = "내 잘못" 원칙
      weight: () => (unlocked('bullet') ? cfg.bullet.weight : 0),
      spawn: () => {
        const side = Math.floor(rand(0, 4)), m = 10;
        const [x, y] = [[-m, rand(0, H)], [W + m, rand(0, H)], [rand(0, W), -m], [rand(0, W), H + m]][side];
        const a = Math.atan2(s.p.y - y, s.p.x - x); // 스폰 순간의 플레이어를 조준 (고정)
        return { type: 'bullet', x, y, dx: Math.cos(a), dy: Math.sin(a), r: cfg.bullet.radius,
                 warn: cfg.bullet.telegraph, harmless: true };
      },
      update: (o, dt) => {
        if (o.warn > 0) { o.warn -= dt; if (o.warn <= 0) o.harmless = false; return; }
        o.x += o.dx * cfg.bullet.speed * dt;
        o.y += o.dy * cfg.bullet.speed * dt;
        o.dead = o.x < -40 || o.x > W + 40 || o.y < -40 || o.y > H + 40;
      },
    },
    mine: { // 안전지대 잠식. 페이드인 0.6초(무해) + 플레이어 120px 내 스폰 금지
      weight: () => (unlocked('mine') ? cfg.mine.weight : 0),
      spawn: () => {
        let x, y, tries = 0;
        do { x = rand(30, W - 30); y = rand(30, H - 30); }
        while (Math.hypot(x - s.p.x, y - s.p.y) < cfg.mine.safeRadius && ++tries < 20);
        return { type: 'mine', x, y, r: cfg.mine.radius, life: cfg.mine.life, age: 0, harmless: true };
      },
      update: (o, dt) => {
        o.age += dt;
        if (o.harmless && o.age >= cfg.mine.fadeIn) o.harmless = false;
        o.life -= dt; o.dead = o.life <= 0;
      },
    },
  };

  // ---- 스폰 ----
  function spawnGood(dt) {
    s.orbTimer -= dt;
    if (s.orbTimer > 0) return;
    s.orbTimer = cfg.orb.spawnInterval;
    s.goods.push(GOODS.orb.spawn());
    for (const t of SPECIAL_GOODS)
      if (unlocked(t) && Math.random() < cfg[t].weight) s.goods.push(GOODS[t].spawn());
  }
  function spawnThreat(dt) {
    s.threatTimer -= dt;
    if (s.threatTimer > 0 || s.threats.length >= cfg.difficulty.maxThreats) return;
    s.threatTimer = Math.max(cfg.difficulty.threatSpawnBase / spawnCoef(), cfg.difficulty.threatSpawnMin);
    const pool = Object.entries(THREATS).map(([k, def]) => [k, def.weight()]);
    const total = pool.reduce((a, [, w]) => a + w, 0);
    let roll = Math.random() * total;
    for (const [k, w] of pool) { roll -= w; if (roll <= 0) { s.threats.push(THREATS[k].spawn()); break; } }
  }

  // ---- 이동 (듀얼 입력, GDD §0) ----
  function movePlayer(dt) {
    const mv = input.getMove();
    const p = s.p;
    let nx = p.x, ny = p.y;
    if (mv.mode === 'key') {
      nx += mv.dx * cfg.player.keySpeed * dt;
      ny += mv.dy * cfg.player.keySpeed * dt;
    } else if (mv.mode === 'mouse') {
      const f = 1 - Math.pow(1 - cfg.player.lerp, dt * 60); // 프레임 독립 lerp
      nx += (mv.tx - p.x) * f;
      ny += (mv.ty - p.y) * f;
    }
    // 700px/s 클램프 — 순간이동 방지 (v2.1 철칙)
    const dx = nx - p.x, dy = ny - p.y, dist = Math.hypot(dx, dy), maxD = cfg.player.maxSpeed * dt;
    if (dist > maxD) { nx = p.x + (dx / dist) * maxD; ny = p.y + (dy / dist) * maxD; }
    p.x = Math.max(p.r, Math.min(W - p.r, nx));
    p.y = Math.max(p.r, Math.min(H - p.r, ny));
  }

  // ---- 충돌 & 피격 ----
  function hit(threat) {
    if (s.invuln > 0 || s.rush > 0) return;
    s.lives--; s.combo = 0; s.comboTimer = 0;
    s.invuln = cfg.run.hitInvuln; s.slowmo = 0.3;
    threat.dead = true;
    burst(fx, s.p.x, s.p.y, C[threat.type], 16, 250);
    shake(fx, 9);
    flash(fx, 'rgba(255,80,80,0.25)');
    if (s.lives <= 0) { s.cause = `${threat.type.toUpperCase()}에게 당했다`; s.over = true; sfx.death(); }
    else sfx.hit();
  }
  function collide() {
    const p = s.p;
    for (const g of s.goods) {
      if (Math.hypot(g.x - p.x, g.y - p.y) < g.r + p.r) {
        g.dead = true;
        burst(fx, g.x, g.y, C[g.type], 8);
        GOODS[g.type].collect(g);
      }
    }
    for (const th of s.threats) {
      if (th.harmless) continue; // 텔레그래프 중(불릿 경고, 마인 페이드인)엔 무해
      const d = Math.hypot(th.x - p.x, th.y - p.y);
      if (d < th.r + p.r) hit(th);
      else if (!th.nmDone && d < th.r + p.r + cfg.nearMiss.dist && s.invuln <= 0) {
        th.nmDone = true; s.nearMiss++; s.score += cfg.nearMiss.score; // 위협 1개당 1회 (파밍 방지)
        floatText(fx, p.x, p.y - 22, `스침 +${cfg.nearMiss.score}`, C.freeze, 12); sfx.nearMiss();
      }
    }
  }

  // ---- 업데이트 ----
  function update(dt) {
    s.t += dt; s.timeLeft -= dt;
    s.invuln = Math.max(0, s.invuln - dt);
    s.rush = Math.max(0, s.rush - dt);
    s.star = Math.max(0, s.star - dt);
    s.freeze = Math.max(0, s.freeze - dt);
    s.magnet = Math.max(0, s.magnet - dt);
    if (s.comboTimer > 0) { s.comboTimer -= dt; if (s.comboTimer <= 0) s.combo = 0; }
    s.survivalAcc += dt;
    if (s.survivalAcc >= 1) { s.survivalAcc -= 1; s.score += cfg.survival.perSec; } // 생존 1초당 +1

    movePlayer(dt);
    spawnGood(dt); spawnThreat(dt);

    const threatDt = s.freeze > 0 ? dt * 0.15 : dt;
    for (const g of s.goods) {
      if (g.vx) { g.x += g.vx * dt; g.y += g.vy * dt; }
      if (g.life != null) { g.life -= dt; if (g.life <= 0) g.dead = true; }
      // 자석 (마그넷 아이템 or 러시)
      const mr = s.rush > 0 ? cfg.rush.magnetRadius : (s.magnet > 0 ? cfg.magnet.radius : 0);
      if (mr) {
        const d = Math.hypot(s.p.x - g.x, s.p.y - g.y);
        if (d < mr && d > 1) { g.x += ((s.p.x - g.x) / d) * 500 * dt; g.y += ((s.p.y - g.y) / d) * 500 * dt; }
      }
    }
    for (const th of s.threats) THREATS[th.type].update(th, threatDt);
    collide();
    s.goods = s.goods.filter((o) => !o.dead);
    s.threats = s.threats.filter((o) => !o.dead);

    if (s.timeLeft <= 0 && !s.over) {
      s.score += s.lives * cfg.run.clearLifeBonus;
      s.cause = 'CLEAR!'; s.cleared = true; s.over = true; s.slowmo = 0.3;
      flash(fx, 'rgba(90,169,230,0.2)');
      sfx.clear();
    }
    updateFx(fx, dt);
  }

  // ---- 렌더 ----
  function circle(x, y, r, color, alpha = 1) {
    ctx.globalAlpha = alpha; ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
  }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (fx.shake > 0) ctx.translate(rand(-fx.shake, fx.shake), rand(-fx.shake, fx.shake)); // 피격 셰이크
    const GLYPH = { freeze: '❄', magnet: '◎', star: '★', timeExt: '⏱' };
    for (const g of s.goods) {
      const blink = g.life != null && g.life < 1.2 ? (Math.sin(s.t * 20) > 0 ? 0.35 : 1) : 1;
      if (g.type === 'orb') circle(g.x, g.y, g.r, C.orb, blink);
      else if (g.type === 'cobalt') { // ◆
        ctx.globalAlpha = blink; ctx.fillStyle = C.cobalt;
        ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(Math.PI / 4);
        ctx.fillRect(-g.r * 0.8, -g.r * 0.8, g.r * 1.6, g.r * 1.6);
        ctx.restore(); ctx.globalAlpha = 1;
      } else {
        ctx.globalAlpha = blink; ctx.fillStyle = C[g.type];
        ctx.font = `bold ${g.r * 2.2}px sans-serif`; ctx.textAlign = 'center';
        ctx.fillText(GLYPH[g.type], g.x, g.y + g.r * 0.8);
        ctx.globalAlpha = 1;
      }
    }
    for (const th of s.threats) {
      if (th.type === 'hunter') { // ▲
        ctx.fillStyle = C.hunter; ctx.beginPath();
        ctx.moveTo(th.x, th.y - 12); ctx.lineTo(th.x - 10, th.y + 8); ctx.lineTo(th.x + 10, th.y + 8);
        ctx.closePath(); ctx.fill();
      } else if (th.type === 'bullet') {
        if (th.warn > 0) { // 경고선 — 발사 임박할수록 진해짐
          ctx.globalAlpha = 0.15 + 0.5 * (1 - th.warn / cfg.bullet.telegraph);
          ctx.strokeStyle = C.bullet; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(th.x, th.y);
          ctx.lineTo(th.x + th.dx * 2000, th.y + th.dy * 2000); ctx.stroke();
          ctx.globalAlpha = 1;
        } else { // 발사체 — 진행 방향 스트릭
          ctx.strokeStyle = C.bullet; ctx.lineWidth = 5; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(th.x - th.dx * 14, th.y - th.dy * 14);
          ctx.lineTo(th.x, th.y); ctx.stroke();
        }
      } else if (th.type === 'mine') { // ✱ — 페이드인(무해) → 활성 → 만료 직전 깜빡
        const a = th.harmless ? 0.15 + 0.45 * (th.age / cfg.mine.fadeIn)
                : th.life < 1.5 ? (Math.sin(s.t * 18) > 0 ? 0.4 : 1) : 1;
        ctx.globalAlpha = a; ctx.strokeStyle = C.mine; ctx.lineWidth = 3; ctx.lineCap = 'round';
        for (let i = 0; i < 3; i++) {
          const ang = (i * Math.PI) / 3 + s.t * 0.8;
          ctx.beginPath();
          ctx.moveTo(th.x - Math.cos(ang) * th.r, th.y - Math.sin(ang) * th.r);
          ctx.lineTo(th.x + Math.cos(ang) * th.r, th.y + Math.sin(ang) * th.r);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      } else circle(th.x, th.y, th.r, C[th.type]); // 드론, 스플리터
    }
    // 활성 효과 링 (색 문법 준수: 전부 푸른 계열)
    if (s.freeze > 0) { ctx.strokeStyle = C.freeze; ctx.lineWidth = 6; ctx.globalAlpha = 0.5; ctx.strokeRect(3, 3, W - 6, H - 6); ctx.globalAlpha = 1; }
    if (s.magnet > 0 || s.rush > 0) {
      const mr = s.rush > 0 ? cfg.rush.magnetRadius : cfg.magnet.radius;
      circle(s.p.x, s.p.y, mr, C.magnet, 0.07);
    }
    if (s.star > 0) circle(s.p.x, s.p.y, s.p.r + 5, C.star, 0.35 + (s.star < 2 ? Math.sin(s.t * 15) * 0.2 : 0));
    // 플레이어 (피격 무적 = 깜빡임, 러시 = 보라 오라)
    const p = s.p;
    if (s.rush > 0) circle(p.x, p.y, p.r + 8 + Math.sin(s.t * 12) * 3, C.star, 0.3);
    const visible = s.invuln <= 0 || Math.sin(s.t * 25) > 0;
    if (visible) circle(p.x, p.y, p.r, C.player);
    // 콤보 게이지 — 플레이어 근처 (시선 이동 최소화, GDD §5)
    if (s.combo > 1 && s.comboTimer > 0) {
      ctx.strokeStyle = C.orb; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + 6, -Math.PI / 2, -Math.PI / 2 + (s.comboTimer / cfg.combo.window) * Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = C.cobalt; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(`×${s.combo}`, p.x, p.y - p.r - 12);
    }
    drawFx(fx, ctx);
    ctx.restore();
    if (fx.flash > 0) { // 피격 붉은 플래시 / 클리어 푸른 플래시
      ctx.globalAlpha = (fx.flash / 0.18) * 0.8; ctx.fillStyle = fx.flashColor;
      ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    }
    hud.score.textContent = Math.round(s.score);
    hud.time.textContent = Math.ceil(Math.max(0, s.timeLeft));
    hud.time.style.color = s.timeLeft < 10 ? 'var(--bad)' : ''; // 시간 임박 = 위협 색
    hud.lives.textContent = '♥'.repeat(Math.max(0, s.lives));
  }

  // ---- 루프 ----
  let raf, last = performance.now(), endDelay = 0;
  function frame(now) {
    let dt = Math.min((now - last) / 1000, 1 / 30); // dt 클램프 (CLAUDE.md 철칙 5)
    last = now;
    if (s.slowmo > 0) { s.slowmo -= dt; dt *= 0.25; } // 종료/피격 슬로모
    if (!s.over) update(dt);
    else if ((endDelay += dt) > 0.35) {
      cancelAnimationFrame(raf);
      return onEnd({ score: Math.round(s.score), survival: Math.round(s.t), maxCombo: s.maxCombo,
                     nearMiss: s.nearMiss, cleared: !!s.cleared, cause: s.cause });
    }
    draw();
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  return { stop: () => cancelAnimationFrame(raf), _s: s /* 헤드리스 테스트용 */ };
}
