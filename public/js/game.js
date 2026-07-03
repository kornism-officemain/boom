// 플레이 씬 v6 — 퓨어 서바이벌, 단일 화면(960×600), 콤보 + 부스터 집중 설계
// 라이프 3 고정, 충돌 = 목숨 -1 (3번이면 끝). HP/업그레이드/하트 없음.
// 오브젝트 추가 = GOODS/THREATS 레지스트리 + config 계수 + schedule. (CLAUDE.md 철칙 2)
import { input } from './input.js';
import { createFx, burst, floatText, shake, flash, ring, updateFx, drawFx } from './fx.js';
import { sfx } from './sfx.js';

// 색 문법: 푸른 계열 = 이득 / 붉은 계열 = 위협 (GDD §0)
const C = {
  player: '#4a5578', dome: '#bfe3ff',
  orb: '#7ec8f7', cobalt: '#2b6fb3', freeze: '#4dd6e8', magnet: '#2ec4b6',
  boost2: '#7b68ee', boost3: '#e8a13c',
  drone: '#ff9f5a', hunter: '#d7263d', splitter: '#ff6b6b', bullet: '#ff3b3b', mine: '#8e1e1e',
};
// 콤보 강조: 단계별 색 (파랑 → 청록 → 보라 → 골드)
const COMBO_COLORS = ['#2b6fb3', '#2b6fb3', '#2ec4b6', '#2ec4b6', '#7b68ee', '#7b68ee', '#7b68ee', '#e8a13c', '#e8a13c', '#e8a13c'];
const UNLOCK_LABEL = {
  cobalt: '코발트 크리스탈', hunter: '헌터', splitter: '스플리터', magnet: '마그넷',
  bullet: '레이저', freeze: '프리즈', boost2: '×2 부스터', mine: '마인', boost3: '×3 부스터',
};
const GOOD_TYPES = new Set(['cobalt', 'freeze', 'magnet', 'boost2', 'boost3']);

export function runGame(cfg, canvas, hud, onEnd) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;   // 화면 = 월드. 보이는 게 전부.
  const rand = (a, b) => a + Math.random() * (b - a);

  const s = {
    t: 0, lives: cfg.run.lives, invuln: 0,
    score: 0, survivalAcc: 0, collected: 0,
    combo: 0, comboTimer: 0, maxCombo: 0, nearMiss: 0,
    boostMult: 1, boostT: 0, boostMax: 1, boostColor: '',
    rush: 0, freeze: 0, magnet: 0, slowmo: 0,
    cause: '', over: false,
    p: { x: W / 2, y: H / 2, r: cfg.player.radius },
    goods: [], threats: [],
    orbTimer: 0, threatTimer: 0,
    nextMilestone: cfg.survival.milestoneEvery,
    unlockQueue: Object.entries(cfg.schedule).sort((a, b) => a[1] - b[1]),
  };
  const stars = Array.from({ length: 70 }, () => ({ x: rand(0, W), y: rand(0, H), r: rand(0.6, 1.8), a: rand(0.1, 0.3) }));

  const speedCoef = () => Math.min(1 + s.t / cfg.difficulty.speedDiv, cfg.difficulty.speedMax);
  const spawnCoef = () => Math.min(1 + s.t / cfg.difficulty.spawnDiv, cfg.difficulty.spawnMax);
  const unlocked = (name) => s.t >= (cfg.schedule[name] ?? 0);
  const fx = createFx();

  const popScore = (gained) => {
    const el = hud.score;
    if (!el.classList) return;
    const cls = gained >= 50 ? 'pop3' : gained >= 15 ? 'pop2' : 'pop1';
    el.classList.remove('pop1', 'pop2', 'pop3');
    void el.offsetWidth;
    el.classList.add(cls);
  };

  // ---- 부스터: 점수 배수 — 상위 우선, 동급이면 시간 갱신 ----
  function applyBoost(mult, dur, color) {
    if (mult < s.boostMult) { s.score += 10; popScore(10); return; }   // 하위 부스터는 +10점 보상
    s.boostMult = mult; s.boostT = dur; s.boostMax = dur; s.boostColor = color;
    s.slowmo = Math.max(s.slowmo, 0.3);        // 부스터의 순간 — 슬로모
    ring(fx, s.p.x, s.p.y, color, 190, 400);
    ring(fx, s.p.x, s.p.y, C.dome, 120, 280);
    burst(fx, s.p.x, s.p.y, color, 30, 360);
    flash(fx, mult >= 3 ? 'rgba(232,161,60,0.25)' : 'rgba(123,104,238,0.25)');
    shake(fx, 6);
    mult >= 3 ? sfx.levelup() : sfx.special();
    if (hud.boost && hud.boost.classList) {    // HUD 배지
      hud.boost.textContent = `×${mult} BOOST`;
      hud.boost.className = mult >= 3 ? 'b3' : 'b2';
    }
    if (hud.banner && hud.banner.classList) {  // 중앙 대형 배너
      hud.banner.textContent = `★ 점수 ×${mult} BOOSTER!`;
      hud.banner.classList.remove('hidden', 'anim', 'gold');
      if (mult >= 3) hud.banner.classList.add('gold');
      void hud.banner.offsetWidth;
      hud.banner.classList.add('anim');
    }
  }
  function endBoost() {
    s.boostMult = 1; s.boostT = 0;
    if (hud.boost && hud.boost.classList) hud.boost.className = 'hidden';
  }

  const onCollect = (base, g) => {
    s.comboTimer > 0 ? (s.combo = Math.min(s.combo + 1, cfg.combo.max)) : (s.combo = 1);
    s.comboTimer = cfg.combo.window;
    s.maxCombo = Math.max(s.maxCombo, s.combo);
    const gained = base * s.combo * s.boostMult;
    s.score += gained;
    popScore(gained);
    const col = s.boostMult > 1 ? s.boostColor : COMBO_COLORS[s.combo - 1];
    floatText(fx, g.x, g.y, `+${gained}`, col, (12 + s.combo * 1.5) * (s.boostMult > 1 ? 1.25 : 1));
    sfx.collect(s.combo);
    s.collected++;
    if (s.combo === cfg.combo.max) ring(fx, s.p.x, s.p.y, COMBO_COLORS[cfg.combo.max - 1], 60, 200); // 풀콤보 링
    if (s.collected % cfg.rush.need === 0) {
      s.rush = cfg.rush.duration;
      floatText(fx, s.p.x, s.p.y - 28, 'RUSH!', C.boost2, 26);
      burst(fx, s.p.x, s.p.y, C.boost2, 22, 280);
      sfx.rush();
    }
  };

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
    freeze: {
      spawn: () => ({ type: 'freeze', x: rand(40, W - 40), y: rand(40, H - 40), r: cfg.freeze.radius, life: cfg.freeze.life }),
      collect: (g) => { s.freeze = cfg.freeze.duration; floatText(fx, g.x, g.y, 'FREEZE ❄', C.freeze, 18); sfx.special(); },
    },
    magnet: {
      spawn: () => ({ type: 'magnet', x: rand(40, W - 40), y: rand(40, H - 40), r: cfg.magnet.pickRadius, life: cfg.magnet.life }),
      collect: (g) => { s.magnet = cfg.magnet.duration; floatText(fx, g.x, g.y, 'MAGNET ◎', C.magnet, 18); sfx.special(); },
    },
    boost2: { // ★ 점수 ×2 — 집착 포인트 1
      spawn: () => ({ type: 'boost2', x: rand(40, W - 40), y: rand(40, H - 40), r: cfg.boost2.radius, life: cfg.boost2.life }),
      collect: () => applyBoost(cfg.boost2.multiplier, cfg.boost2.duration, C.boost2),
    },
    boost3: { // ✦ 점수 ×3 — 희귀·짧음·후반. 집착 포인트 2
      spawn: () => ({ type: 'boost3', x: rand(40, W - 40), y: rand(40, H - 40), r: cfg.boost3.radius, life: cfg.boost3.life }),
      collect: () => applyBoost(cfg.boost3.multiplier, cfg.boost3.duration, C.boost3),
    },
  };
  const SPECIAL_GOODS = ['cobalt', 'freeze', 'magnet', 'boost2', 'boost3'];

  const THREATS = {
    drone: { // 소행성 — 가장자리→직선 횡단
      weight: () => 1,
      spawn: () => {
        const side = Math.floor(rand(0, 4));
        const v = cfg.difficulty.threatBaseSpeed * speedCoef();
        const m = 20;
        const [x, y, vx, vy] = [
          [-m, rand(0, H), v, 0], [W + m, rand(0, H), -v, 0],
          [rand(0, W), -m, 0, v], [rand(0, W), H + m, 0, -v],
        ][side];
        return { type: 'drone', x, y, vx, vy, r: 10, spin: rand(0, Math.PI * 2) };
      },
      update: (o, dt) => { o.x += o.vx * dt; o.y += o.vy * dt; o.spin += dt * 2; o.dead = o.x < -40 || o.x > W + 40 || o.y < -40 || o.y > H + 40; },
    },
    hunter: { // 추적선 — 후반(lateAt)엔 동시 3기
      weight: () => {
        const maxAlive = s.t >= cfg.hunter.lateAt ? cfg.hunter.maxAliveLate : cfg.hunter.maxAlive;
        return unlocked('hunter') && s.threats.filter((t) => t.type === 'hunter').length < maxAlive ? cfg.hunter.weight : 0;
      },
      spawn: () => ({ type: 'hunter', x: rand(0, 1) < 0.5 ? -20 : W + 20, y: rand(0, H), r: 11, life: cfg.hunter.life }),
      update: (o, dt) => {
        const d = Math.hypot(s.p.x - o.x, s.p.y - o.y) || 1;
        const v = cfg.hunter.speed * speedCoef();
        o.x += ((s.p.x - o.x) / d) * v * dt;
        o.y += ((s.p.y - o.y) / d) * v * dt;
        o.life -= dt; o.dead = o.life <= 0;
      },
    },
    splitter: { // 분열 셀
      weight: () => (unlocked('splitter') ? cfg.splitter.weight : 0),
      spawn: () => {
        const base = THREATS.drone.spawn();
        return { ...base, type: 'splitter', r: cfg.splitter.radius,
                 splitIn: rand(cfg.splitter.splitMin, cfg.splitter.splitMax), canSplit: true };
      },
      update: (o, dt) => {
        THREATS.drone.update(o, dt);
        if (!o.dead && o.canSplit && (o.splitIn -= dt) <= 0) {
          o.canSplit = false;
          const a = Math.atan2(o.vy, o.vx), v = Math.hypot(o.vx, o.vy);
          for (const da of [-0.45, 0.45]) {
            s.threats.push({ ...o, vx: Math.cos(a + da) * v, vy: Math.sin(a + da) * v, canSplit: false, nmDone: false });
          }
          o.dead = true;
        }
      },
    },
    bullet: { // 레이저 — 경고선 0.8초 후 발사
      weight: () => (unlocked('bullet') ? cfg.bullet.weight : 0),
      spawn: () => {
        const side = Math.floor(rand(0, 4)), m = 10;
        const [x, y] = [[-m, rand(0, H)], [W + m, rand(0, H)], [rand(0, W), -m], [rand(0, W), H + m]][side];
        const a = Math.atan2(s.p.y - y, s.p.x - x);
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
    mine: { // 기뢰 — 페이드인 0.6초(무해) + 플레이어 120px 내 스폰 금지
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

  function movePlayer(dt) {
    const mv = input.getMove();
    const p = s.p;
    let nx = p.x, ny = p.y;
    if (mv.mode === 'key') {
      nx += mv.dx * cfg.player.keySpeed * dt;
      ny += mv.dy * cfg.player.keySpeed * dt;
    } else if (mv.mode === 'mouse') {
      const f = 1 - Math.pow(1 - cfg.player.lerp, dt * 60);
      nx += (mv.tx - p.x) * f;
      ny += (mv.ty - p.y) * f;
    }
    const dx = nx - p.x, dy = ny - p.y, dist = Math.hypot(dx, dy), maxD = cfg.player.maxSpeed * dt;
    if (dist > maxD && dist > 0) { nx = p.x + (dx / dist) * maxD; ny = p.y + (dy / dist) * maxD; } // dist=0 → 0/0 NaN 방지
    p.x = Math.max(p.r, Math.min(W - p.r, nx));
    p.y = Math.max(p.r, Math.min(H - p.r, ny));
  }

  // ---- 피격: 충돌 = 목숨 -1. 3번이면 끝. ----
  function hit(threat) {
    if (s.invuln > 0 || s.rush > 0) return;
    threat.dead = true;
    s.lives--;
    s.combo = 0; s.comboTimer = 0;
    endBoost();                                 // 피격 시 부스터도 소멸 — 부스터를 지키고 싶게
    burst(fx, s.p.x, s.p.y, C[threat.type], 18, 260);
    shake(fx, 11);
    flash(fx, 'rgba(255,80,80,0.3)');
    s.slowmo = 0.3;
    if (s.lives <= 0) {
      s.cause = `${UNLOCK_LABEL[threat.type] || threat.type}에게 격침됨`;
      s.over = true;
      sfx.death();
    } else {
      s.invuln = cfg.run.hitInvuln;
      floatText(fx, s.p.x, s.p.y - 34, `충돌! 남은 목숨 ${s.lives}`, C.bullet, 20);
      sfx.hit();
    }
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
      if (th.harmless || th.dead) continue;
      const d = Math.hypot(th.x - p.x, th.y - p.y);
      if (d < th.r + p.r) hit(th);
      else if (!th.nmDone && d < th.r + p.r + cfg.nearMiss.dist && s.invuln <= 0) {
        th.nmDone = true; s.nearMiss++;
        const gained = cfg.nearMiss.score * s.boostMult;   // 니어미스도 부스터 적용
        s.score += gained;
        popScore(gained);
        s.slowmo = Math.max(s.slowmo, cfg.nearMiss.slowmo);
        burst(fx, (th.x + p.x) / 2, (th.y + p.y) / 2, C.freeze, 6, 140);
        floatText(fx, p.x, p.y - p.r - 18, `아슬! +${gained}`, C.freeze, 16);
        flash(fx, 'rgba(77,214,232,0.10)');
        sfx.nearMiss();
      }
    }
  }

  function update(dt) {
    s.t += dt;
    s.invuln = Math.max(0, s.invuln - dt);
    s.rush = Math.max(0, s.rush - dt);
    s.freeze = Math.max(0, s.freeze - dt);
    s.magnet = Math.max(0, s.magnet - dt);
    if (s.boostT > 0) { s.boostT -= dt; if (s.boostT <= 0) endBoost(); }
    if (s.comboTimer > 0) { s.comboTimer -= dt; if (s.comboTimer <= 0) s.combo = 0; }
    s.survivalAcc += dt;
    if (s.survivalAcc >= 1) { s.survivalAcc -= 1; s.score += cfg.survival.perSec * s.boostMult; }

    if (s.t >= s.nextMilestone) {
      const bonus = (s.nextMilestone / cfg.survival.milestoneEvery) * cfg.survival.milestoneBonus;
      s.score += bonus;
      popScore(bonus);
      floatText(fx, W / 2, 90, `${s.nextMilestone}초 생존! +${bonus}`, C.boost2, 24);
      sfx.milestone();
      s.nextMilestone += cfg.survival.milestoneEvery;
    }
    while (s.unlockQueue.length && s.t >= s.unlockQueue[0][1]) {
      const [name] = s.unlockQueue.shift();
      floatText(fx, W / 2, 60, `NEW: ${UNLOCK_LABEL[name] || name}`, GOOD_TYPES.has(name) ? C.cobalt : C.hunter, 20);
    }

    movePlayer(dt);
    spawnGood(dt); spawnThreat(dt);

    const threatDt = s.freeze > 0 ? dt * 0.15 : dt;
    for (const g of s.goods) {
      if (g.vx) {
        g.x += g.vx * dt; g.y += g.vy * dt;
        // 단일 화면: 표류 수집물은 벽에 튕김 (화면 밖 낭비 방지)
        if (g.x < g.r) { g.x = g.r; g.vx = Math.abs(g.vx); }
        if (g.x > W - g.r) { g.x = W - g.r; g.vx = -Math.abs(g.vx); }
        if (g.y < g.r) { g.y = g.r; g.vy = Math.abs(g.vy); }
        if (g.y > H - g.r) { g.y = H - g.r; g.vy = -Math.abs(g.vy); }
      }
      if (g.life != null) { g.life -= dt; if (g.life <= 0) g.dead = true; }
      const mr = s.rush > 0 ? cfg.rush.magnetRadius : (s.magnet > 0 ? cfg.magnet.radius : 0);
      if (mr) {
        const d = Math.hypot(s.p.x - g.x, s.p.y - g.y);
        if (d < mr && d > 1) { g.x += ((s.p.x - g.x) / d) * 500 * dt; g.y += ((s.p.y - g.y) / d) * 500 * dt; }
      }
    }
    for (const th of s.threats) if (!th.dead) THREATS[th.type].update(th, threatDt);
    collide();
    s.goods = s.goods.filter((o) => !o.dead);
    s.threats = s.threats.filter((o) => !o.dead);
    updateFx(fx, dt);
  }

  // ---- 렌더 ----
  function circle(x, y, r, color, alpha = 1) {
    ctx.globalAlpha = alpha; ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
  }
  function drawShip(p) {
    const r = p.r;
    // 부스터 오라 — 확실하게 느껴지게
    if (s.boostMult > 1) {
      const blink = s.boostT < 2 ? (Math.sin(s.t * 14) > 0 ? 1 : 0.3) : 1; // 만료 임박 점멸
      circle(p.x, p.y, r * 2.1 + Math.sin(s.t * 8) * 3, s.boostColor, 0.18 * blink);
      ctx.strokeStyle = s.boostColor; ctx.lineWidth = 3; ctx.globalAlpha = 0.7 * blink;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 1.8, -Math.PI / 2, -Math.PI / 2 + (s.boostT / s.boostMax) * Math.PI * 2); // 남은 시간 아크
      ctx.stroke(); ctx.globalAlpha = 1;
      ctx.fillStyle = s.boostColor; ctx.font = '900 15px sans-serif'; ctx.textAlign = 'center';
      ctx.globalAlpha = blink;
      ctx.fillText(`×${s.boostMult}`, p.x, p.y + r + 22);
      ctx.globalAlpha = 1;
    }
    // 원형 UFO
    circle(p.x, p.y + r * 0.4, r * 1.3, C.orb, 0.12);
    ctx.fillStyle = C.dome;
    ctx.beginPath(); ctx.arc(p.x, p.y - r * 0.25, r * 0.72, Math.PI, 0); ctx.fill();
    ctx.fillStyle = C.player;
    ctx.beginPath(); ctx.ellipse(p.x, p.y + r * 0.15, r * 1.45, r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 3; i++) {
      const k = (i / 2) * 2 - 1;
      const on = Math.sin(s.t * 6 + i * 1.7) > 0;
      circle(p.x + k * r * 1.0, p.y + r * 0.15, r * 0.15, on ? '#ffe28a' : '#8a93b8');
    }
  }
  function drawGood(g) {
    const blink = g.life != null && g.life < 1.2 ? (Math.sin(s.t * 20) > 0 ? 0.35 : 1) : 1;
    ctx.globalAlpha = blink;
    if (g.type === 'orb') {
      circle(g.x, g.y, g.r, C.orb, blink);
      circle(g.x - g.r * 0.3, g.y - g.r * 0.3, g.r * 0.3, '#ffffff', blink * 0.8);
    } else if (g.type === 'cobalt') {
      ctx.fillStyle = C.cobalt;
      ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(Math.PI / 4);
      ctx.fillRect(-g.r * 0.8, -g.r * 0.8, g.r * 1.6, g.r * 1.6);
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-g.r * 0.8, 0); ctx.lineTo(g.r * 0.8, 0); ctx.stroke();
      ctx.restore();
    } else {
      const GLYPH = { freeze: '❄', magnet: '◎', boost2: '★', boost3: '✦' };
      circle(g.x, g.y, g.r + 3, '#ffffff', blink);
      ctx.globalAlpha = blink;
      ctx.strokeStyle = C[g.type]; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(g.x, g.y, g.r + 3, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = C[g.type];
      ctx.font = `bold ${g.r * 1.7}px sans-serif`; ctx.textAlign = 'center';
      ctx.fillText(GLYPH[g.type], g.x, g.y + g.r * 0.62);
      if (g.type === 'boost3') { // ✦는 눈에 띄게 반짝
        ctx.strokeStyle = C.boost3; ctx.globalAlpha = blink * (0.3 + Math.sin(s.t * 9) * 0.25);
        ctx.beginPath(); ctx.arc(g.x, g.y, g.r + 7, 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
  function drawThreat(th) {
    if (th.type === 'drone') {
      circle(th.x, th.y, th.r, C.drone);
      const a1 = th.spin, a2 = th.spin + 2.4;
      circle(th.x + Math.cos(a1) * th.r * 0.4, th.y + Math.sin(a1) * th.r * 0.4, th.r * 0.28, 'rgba(120,50,20,.35)');
      circle(th.x + Math.cos(a2) * th.r * 0.5, th.y + Math.sin(a2) * th.r * 0.5, th.r * 0.2, 'rgba(120,50,20,.3)');
    } else if (th.type === 'hunter') {
      const ang = Math.atan2(s.p.y - th.y, s.p.x - th.x);
      ctx.save(); ctx.translate(th.x, th.y); ctx.rotate(ang + Math.PI / 2);
      ctx.fillStyle = C.hunter;
      ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(-9, 9); ctx.lineTo(0, 5); ctx.lineTo(9, 9); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffb3bd'; ctx.beginPath(); ctx.arc(0, -3, 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else if (th.type === 'splitter') {
      circle(th.x - 2.5, th.y, th.r * 0.85, C.splitter);
      circle(th.x + 2.5, th.y, th.r * 0.85, C.splitter);
      ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(th.x, th.y - th.r * 0.8); ctx.lineTo(th.x, th.y + th.r * 0.8); ctx.stroke();
    } else if (th.type === 'bullet') {
      if (th.warn > 0) {
        ctx.globalAlpha = 0.15 + 0.5 * (1 - th.warn / cfg.bullet.telegraph);
        ctx.strokeStyle = C.bullet; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(th.x, th.y);
        ctx.lineTo(th.x + th.dx * 2000, th.y + th.dy * 2000); ctx.stroke();
        ctx.globalAlpha = 1;
      } else {
        ctx.strokeStyle = C.bullet; ctx.lineWidth = 5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(th.x - th.dx * 14, th.y - th.dy * 14);
        ctx.lineTo(th.x, th.y); ctx.stroke();
      }
    } else if (th.type === 'mine') {
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
      if (!th.harmless && Math.sin(s.t * 10) > 0) circle(th.x, th.y, 3, '#ff3b3b', a);
      ctx.globalAlpha = 1;
    }
  }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (fx.shake > 0) ctx.translate(rand(-fx.shake, fx.shake), rand(-fx.shake, fx.shake));
    for (const st of stars) circle(st.x, st.y, st.r, '#3a3f52', st.a);
    for (const g of s.goods) drawGood(g);
    for (const th of s.threats) drawThreat(th);
    if (s.magnet > 0 || s.rush > 0) {
      const mr = s.rush > 0 ? cfg.rush.magnetRadius : cfg.magnet.radius;
      circle(s.p.x, s.p.y, mr, C.magnet, 0.07);
    }
    if (s.rush > 0) circle(s.p.x, s.p.y, s.p.r + 11 + Math.sin(s.t * 12) * 3, C.boost2, 0.3);
    const visible = s.invuln <= 0 || Math.sin(s.t * 25) > 0;
    if (visible) drawShip(s.p);
    // 콤보 — 올라갈수록 크고 진하게
    if (s.combo > 1 && s.comboTimer > 0) {
      const cRatio = s.combo / cfg.combo.max;
      const col = COMBO_COLORS[s.combo - 1];
      ctx.strokeStyle = col; ctx.lineWidth = 2.5 + cRatio * 3.5;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(s.p.x, s.p.y, s.p.r + 10, -Math.PI / 2, -Math.PI / 2 + (s.comboTimer / cfg.combo.window) * Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      const fs = 13 + s.combo * 2.2;
      const pulse = s.combo >= cfg.combo.max ? 1 + Math.sin(s.t * 12) * 0.08 : 1;
      ctx.fillStyle = col;
      ctx.font = `900 ${Math.round(fs * pulse)}px sans-serif`;
      ctx.textAlign = 'center';
      if (s.combo >= 7) { ctx.shadowColor = col; ctx.shadowBlur = 12; }
      ctx.fillText(`×${s.combo}`, s.p.x, s.p.y - s.p.r - 18);
      ctx.shadowBlur = 0;
    }
    drawFx(fx, ctx);
    ctx.restore();
    // 부스터 중 — 화면 테두리 글로우 (확실한 상태 인지)
    if (s.boostMult > 1) {
      const blink = s.boostT < 2 ? (Math.sin(s.t * 14) > 0 ? 1 : 0.35) : 1;
      ctx.globalAlpha = (0.35 + Math.sin(s.t * 6) * 0.15) * blink;
      ctx.strokeStyle = s.boostColor; ctx.lineWidth = 10;
      ctx.strokeRect(2, 2, W - 4, H - 4);
      ctx.globalAlpha = 1;
    }
    if (s.freeze > 0) { ctx.strokeStyle = C.freeze; ctx.lineWidth = 6; ctx.globalAlpha = 0.5; ctx.strokeRect(3, 3, W - 6, H - 6); ctx.globalAlpha = 1; }
    if (s.lives === 1 && !s.over) {
      ctx.globalAlpha = 0.18 + Math.sin(s.t * 5) * 0.1;
      ctx.strokeStyle = '#ff3b3b'; ctx.lineWidth = 14;
      ctx.strokeRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    if (fx.flash > 0) {
      ctx.globalAlpha = (fx.flash / 0.18) * 0.8; ctx.fillStyle = fx.flashColor;
      ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    }
    // HUD
    hud.score.textContent = Math.round(s.score);
    hud.time.textContent = `🕐 ${Math.floor(s.t)}s`;
    hud.lives.textContent = '♥'.repeat(Math.max(0, s.lives));
    if (hud.lives.classList) hud.lives.classList.toggle('danger', s.lives === 1);
  }

  let raf, last = performance.now(), endDelay = 0;
  function frame(now) {
    let dt = Math.max(0.0001, Math.min((now - last) / 1000, 1 / 30)); // 음수 dt 방지 (NaN 오염 버그)
    last = now;
    if (s.slowmo > 0) { s.slowmo -= dt; dt *= 0.25; }
    if (!s.over) update(dt);
    else if ((endDelay += dt) > 0.35) {
      cancelAnimationFrame(raf);
      return onEnd({ score: Math.round(s.score), survival: Math.round(s.t), maxCombo: s.maxCombo,
                     nearMiss: s.nearMiss, cause: s.cause });
    }
    draw();
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  return { stop: () => cancelAnimationFrame(raf), _s: s /* 헤드리스 테스트용 */ };
}
