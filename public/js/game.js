// 플레이 씬 v6 — 퓨어 서바이벌, 단일 화면(960×600), 콤보 + 부스터 집중 설계
// 라이프 3 고정, 충돌 = 목숨 -1 (3번이면 끝). HP/업그레이드/하트 없음.
// 오브젝트 추가 = GOODS/THREATS 레지스트리 + config 계수 + schedule. (CLAUDE.md 철칙 2)
import { input } from './input.js';
import { createFx, burst, floatText, shake, flash, ring, updateFx, drawFx } from './fx.js';
import { sfx } from './sfx.js';

// 색 문법: 푸른 계열 = 이득 / 붉은 계열 = 위협 (GDD §0). 다크 스페이스용 네온 톤.
const C = {
  player: '#8a97c9', dome: '#cfeaff',
  orb: '#5ad1ff', cobalt: '#4f9bff', freeze: '#5fe6f7', magnet: '#3fe0c0',
  boost2: '#a88bff', boost3: '#ffc542',
  drone: '#ff9f5a', hunter: '#ff4d6a', splitter: '#ff7b7b', bullet: '#ff4040', mine: '#d9453a',
};
// 콤보 강조: 단계별 색 (파랑 → 청록 → 보라 → 골드)
const COMBO_COLORS = ['#5ad1ff', '#5ad1ff', '#3fe0c0', '#3fe0c0', '#a88bff', '#a88bff', '#a88bff', '#ffc542', '#ffc542', '#ffc542'];
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
  // 배경: 그라디언트 + 성운 + 반짝이는 별 (다크 스페이스)
  const stars = Array.from({ length: 90 }, () => ({ x: rand(0, W), y: rand(0, H), r: rand(0.5, 1.9), a: rand(0.15, 0.5), tw: rand(0, Math.PI * 2) }));
  const bgGrad = ctx.createLinearGradient ? (() => {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#131634'); g.addColorStop(0.6, '#171a3e'); g.addColorStop(1, '#241b52');
    return g;
  })() : '#10122b';
  const NEBULAS = [
    { x: W * 0.22, y: H * 0.28, r: 270, c: 'rgba(123,104,238,0.10)' },
    { x: W * 0.78, y: H * 0.68, r: 310, c: 'rgba(77,169,255,0.08)' },
    { x: W * 0.55, y: H * 0.12, r: 210, c: 'rgba(255,120,170,0.05)' },
  ];

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
    s.moving = dist > 1.5;
    p.x = Math.max(p.r, Math.min(W - p.r, nx));
    p.y = Math.max(p.r, Math.min(H - p.r, ny));
    // 이동 트레일 — 속도감 연출
    s.trailTimer = (s.trailTimer || 0) - dt;
    if (s.moving && s.trailTimer <= 0) {
      s.trailTimer = 0.05;
      fx.parts.push({ x: p.x, y: p.y + p.r * 0.4, vx: 0, vy: 26, life: 0.35, max: 0.35,
                      color: s.boostMult > 1 ? s.boostColor : 'rgba(122,196,255,0.9)', r: 3 });
    }
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
    // 풀콤보(×10) 무지개 스파크 — 맥스 상태를 온몸으로 알림
    if (s.combo >= cfg.combo.max && s.comboTimer > 0) {
      s.rainbowTimer = (s.rainbowTimer || 0) - dt;
      if (s.rainbowTimer <= 0) {
        s.rainbowTimer = 0.06;
        const a = rand(0, Math.PI * 2);
        fx.parts.push({ x: s.p.x + Math.cos(a) * (s.p.r + 12), y: s.p.y + Math.sin(a) * (s.p.r + 12),
                        vx: Math.cos(a) * 70, vy: Math.sin(a) * 70, life: 0.4, max: 0.4,
                        color: `hsl(${Math.floor(rand(0, 360))}, 100%, 65%)`, r: 2.5 });
      }
    }
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
  function glowCircle(x, y, r, color, blur, alpha = 1) { // 네온 글로우 (남용 금지 — 성능)
    ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = blur;
    circle(x, y, r, color, alpha);
    ctx.restore();
  }
  function orbSphere(x, y, r, base, alpha) { // 광택 구체
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.15, x, y, r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, base); g.addColorStop(1, 'rgba(20,40,90,0.9)');
    ctx.save(); ctx.shadowColor = base; ctx.shadowBlur = 12;
    ctx.globalAlpha = alpha; ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore(); ctx.globalAlpha = 1;
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
    // 원형 UFO — 광택 돔 + 메탈 새서 + 엔진 글로우 + 호버링 바운스
    const by = Math.sin(s.t * 3) * 1.5;               // 둥실거림 (연출 전용)
    const px = p.x, py = p.y + by;
    // 엔진 언더글로우
    glowCircle(px, py + r * 0.55, r * 0.9, 'rgba(90,209,255,0.35)', 18, 0.5);
    // 새서 (메탈 그라디언트 + 림 라이트)
    const sg = ctx.createLinearGradient(px, py - r * 0.4, px, py + r * 0.7);
    sg.addColorStop(0, '#d7ddf7'); sg.addColorStop(0.5, C.player); sg.addColorStop(1, '#4d5680');
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.ellipse(px, py + r * 0.15, r * 1.45, r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(210,230,255,0.65)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(px, py + r * 0.15, r * 1.45, r * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
    // 돔 (유리 광택)
    const dg = ctx.createRadialGradient(px - r * 0.25, py - r * 0.55, r * 0.1, px, py - r * 0.25, r * 0.8);
    dg.addColorStop(0, '#ffffff'); dg.addColorStop(0.4, C.dome); dg.addColorStop(1, 'rgba(110,160,230,0.9)');
    ctx.fillStyle = dg;
    ctx.beginPath(); ctx.arc(px, py - r * 0.25, r * 0.72, Math.PI, 0); ctx.fill();
    circle(px - r * 0.28, py - r * 0.5, r * 0.13, 'rgba(255,255,255,0.95)'); // 스펙큘러
    // 라이트 3개 순차 점멸
    for (let i = 0; i < 3; i++) {
      const k = (i / 2) * 2 - 1;
      const on = Math.sin(s.t * 6 + i * 1.7) > 0;
      if (on) glowCircle(px + k * r * 1.0, py + r * 0.15, r * 0.16, '#ffe28a', 8);
      else circle(px + k * r * 1.0, py + r * 0.15, r * 0.15, '#5d6690');
    }
  }
  function drawGood(g) {
    const blink = g.life != null && g.life < 1.2 ? (Math.sin(s.t * 20) > 0 ? 0.35 : 1) : 1;
    if (g.type === 'orb') { // 에너지 구슬 — 광택 구체 + 글로우
      orbSphere(g.x, g.y, g.r, C.orb, blink);
    } else if (g.type === 'cobalt') { // 크리스탈 젬 — 그라디언트 패싯 + 스파클
      ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(Math.PI / 4);
      ctx.shadowColor = C.cobalt; ctx.shadowBlur = 12; ctx.globalAlpha = blink;
      const cg = ctx.createLinearGradient(-g.r, -g.r, g.r, g.r);
      cg.addColorStop(0, '#bfe0ff'); cg.addColorStop(0.5, C.cobalt); cg.addColorStop(1, '#1c4fa0');
      ctx.fillStyle = cg;
      ctx.fillRect(-g.r * 0.8, -g.r * 0.8, g.r * 1.6, g.r * 1.6);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-g.r * 0.8, 0); ctx.lineTo(g.r * 0.8, 0);
      ctx.moveTo(0, -g.r * 0.8); ctx.lineTo(0, g.r * 0.8); ctx.stroke();
      ctx.restore(); ctx.globalAlpha = 1;
      const sp = (s.t * 2 + g.x) % 1; // 흐르는 스파클
      if (sp < 0.5) circle(g.x + g.r * 0.5, g.y - g.r * 0.6, 1.6, '#ffffff', blink * (1 - sp * 2));
    } else { // 스페셜 배지 — 컬러 그라디언트 원판 + 흰 글리프 + 글로우
      const GLYPH = { freeze: '❄', magnet: '◎', boost2: '★', boost3: '✦' };
      const col = C[g.type];
      ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = 14; ctx.globalAlpha = blink;
      const bg2 = ctx.createRadialGradient(g.x - g.r * 0.3, g.y - g.r * 0.4, g.r * 0.2, g.x, g.y, g.r + 3);
      bg2.addColorStop(0, '#ffffff'); bg2.addColorStop(0.35, col); bg2.addColorStop(1, col);
      ctx.fillStyle = bg2;
      ctx.beginPath(); ctx.arc(g.x, g.y, g.r + 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.globalAlpha = blink;
      ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(g.x, g.y, g.r + 3, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${g.r * 1.7}px sans-serif`; ctx.textAlign = 'center';
      ctx.fillText(GLYPH[g.type], g.x, g.y + g.r * 0.62);
      if (g.type === 'boost3') { // ✦ 골드는 회전 링으로 존재감
        ctx.strokeStyle = C.boost3; ctx.globalAlpha = blink * (0.4 + Math.sin(s.t * 9) * 0.3);
        ctx.setLineDash([6, 6]); ctx.lineDashOffset = -s.t * 30;
        ctx.beginPath(); ctx.arc(g.x, g.y, g.r + 9, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.globalAlpha = 1;
    }
  }
  function drawThreat(th) {
    if (th.type === 'drone') { // 소행성 — 셰이딩 + 크레이터 + 아웃라인
      const ag = ctx.createRadialGradient(th.x - th.r * 0.4, th.y - th.r * 0.4, th.r * 0.2, th.x, th.y, th.r);
      ag.addColorStop(0, '#ffc48a'); ag.addColorStop(0.55, C.drone); ag.addColorStop(1, '#b3541e');
      ctx.fillStyle = ag;
      ctx.beginPath(); ctx.arc(th.x, th.y, th.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(60,20,5,.5)'; ctx.lineWidth = 1.5; ctx.stroke();
      const a1 = th.spin, a2 = th.spin + 2.4;
      circle(th.x + Math.cos(a1) * th.r * 0.4, th.y + Math.sin(a1) * th.r * 0.4, th.r * 0.26, 'rgba(120,50,20,.45)');
      circle(th.x + Math.cos(a2) * th.r * 0.5, th.y + Math.sin(a2) * th.r * 0.5, th.r * 0.18, 'rgba(120,50,20,.4)');
    } else if (th.type === 'hunter') { // 추적선 — 글로우 + 스러스터 트레일 + 눈
      const ang = Math.atan2(s.p.y - th.y, s.p.x - th.x);
      ctx.save(); ctx.translate(th.x, th.y); ctx.rotate(ang + Math.PI / 2);
      ctx.globalAlpha = 0.5; // 스러스터 불꽃
      ctx.fillStyle = '#ff9e40';
      const fl = 6 + Math.sin(s.t * 25) * 3;
      ctx.beginPath(); ctx.moveTo(-4, 9); ctx.lineTo(0, 9 + fl); ctx.lineTo(4, 9); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.shadowColor = C.hunter; ctx.shadowBlur = 12;
      const hg = ctx.createLinearGradient(0, -13, 0, 9);
      hg.addColorStop(0, '#ff8098'); hg.addColorStop(1, '#c21833');
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(-9, 9); ctx.lineTo(0, 5); ctx.lineTo(9, 9); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
      circle(0, -3, 3.4, '#ffffff'); circle(0, -3, 1.8, '#ff2038'); // 눈
      ctx.restore();
    } else if (th.type === 'splitter') { // 분열 셀 — 맥동하는 이중 막
      const pul = 1 + Math.sin(s.t * 7 + th.x) * 0.08;
      ctx.save(); ctx.shadowColor = C.splitter; ctx.shadowBlur = 8;
      const lg = ctx.createRadialGradient(th.x, th.y - 3, 1, th.x, th.y, th.r * 1.1);
      lg.addColorStop(0, '#ffb3b3'); lg.addColorStop(1, '#d63a3a');
      ctx.fillStyle = lg;
      ctx.beginPath(); ctx.arc(th.x - 2.5 * pul, th.y, th.r * 0.85 * pul, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(th.x + 2.5 * pul, th.y, th.r * 0.85 * pul, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(th.x, th.y - th.r * 0.8); ctx.lineTo(th.x, th.y + th.r * 0.8); ctx.stroke();
    } else if (th.type === 'bullet') {
      if (th.warn > 0) { // 경고선 — 대시 + 글로우, 임박할수록 진해짐
        const prog = 1 - th.warn / cfg.bullet.telegraph;
        ctx.save();
        ctx.globalAlpha = 0.2 + 0.55 * prog;
        ctx.shadowColor = C.bullet; ctx.shadowBlur = 6;
        ctx.strokeStyle = C.bullet; ctx.lineWidth = 1.5 + prog * 1.5;
        ctx.setLineDash([10, 8]); ctx.lineDashOffset = -s.t * 60;
        ctx.beginPath(); ctx.moveTo(th.x, th.y);
        ctx.lineTo(th.x + th.dx * 2000, th.y + th.dy * 2000); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        glowCircle(th.x, th.y, 4 + prog * 3, C.bullet, 10, 0.7); // 발사 지점 표시
      } else { // 레이저 — 흰 코어 + 붉은 글로우
        ctx.save(); ctx.shadowColor = C.bullet; ctx.shadowBlur = 14; ctx.lineCap = 'round';
        ctx.strokeStyle = C.bullet; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(th.x - th.dx * 16, th.y - th.dy * 16); ctx.lineTo(th.x, th.y); ctx.stroke();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.6;
        ctx.beginPath(); ctx.moveTo(th.x - th.dx * 14, th.y - th.dy * 14); ctx.lineTo(th.x, th.y); ctx.stroke();
        ctx.restore();
      }
    } else if (th.type === 'mine') { // 기뢰 — 스파이크 몸체 + 붉은 코어 점멸
      const a = th.harmless ? 0.15 + 0.45 * (th.age / cfg.mine.fadeIn)
              : th.life < 1.5 ? (Math.sin(s.t * 18) > 0 ? 0.4 : 1) : 1;
      ctx.globalAlpha = a;
      for (let i = 0; i < 6; i++) { // 스파이크
        const ang = (i * Math.PI) / 3 + s.t * 0.8;
        ctx.strokeStyle = C.mine; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(th.x + Math.cos(ang) * th.r * 0.5, th.y + Math.sin(ang) * th.r * 0.5);
        ctx.lineTo(th.x + Math.cos(ang) * th.r * 1.15, th.y + Math.sin(ang) * th.r * 1.15);
        ctx.stroke();
      }
      const mg = ctx.createRadialGradient(th.x - 2, th.y - 3, 1, th.x, th.y, th.r * 0.75);
      mg.addColorStop(0, '#ff8a7a'); mg.addColorStop(1, '#8e1e1e');
      ctx.fillStyle = mg;
      ctx.beginPath(); ctx.arc(th.x, th.y, th.r * 0.75, 0, Math.PI * 2); ctx.fill();
      if (!th.harmless && Math.sin(s.t * 10) > 0) glowCircle(th.x, th.y, 3.2, '#ff2020', 10, a);
      ctx.globalAlpha = 1;
    }
  }
  function draw() {
    // 우주 배경 — 그라디언트 + 성운 + 반짝이는 별
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);
    for (const nb of NEBULAS) {
      const ng = ctx.createRadialGradient(nb.x, nb.y, 10, nb.x, nb.y, nb.r);
      ng.addColorStop(0, nb.c); ng.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = ng;
      ctx.fillRect(nb.x - nb.r, nb.y - nb.r, nb.r * 2, nb.r * 2);
    }
    ctx.save();
    if (fx.shake > 0) ctx.translate(rand(-fx.shake, fx.shake), rand(-fx.shake, fx.shake));
    for (const st of stars) circle(st.x, st.y, st.r, '#cfd8ff', st.a * (0.55 + 0.45 * Math.sin(s.t * 2 + st.tw)));
    for (const g of s.goods) drawGood(g);
    for (const th of s.threats) drawThreat(th);
    if (s.magnet > 0 || s.rush > 0) {
      const mr = s.rush > 0 ? cfg.rush.magnetRadius : cfg.magnet.radius;
      circle(s.p.x, s.p.y, mr, C.magnet, 0.07);
    }
    if (s.rush > 0) circle(s.p.x, s.p.y, s.p.r + 11 + Math.sin(s.t * 12) * 3, C.boost2, 0.3);
    const visible = s.invuln <= 0 || Math.sin(s.t * 25) > 0;
    if (visible) drawShip(s.p);
    // 콤보 — 올라갈수록 크고 진하게. ×10(맥스)은 무지개 발광.
    if (s.combo > 1 && s.comboTimer > 0) {
      const isMax = s.combo >= cfg.combo.max;
      const cRatio = s.combo / cfg.combo.max;
      const gaugeFrac = (s.comboTimer / cfg.combo.window) * Math.PI * 2;
      if (isMax) {
        // 무지개 게이지 링 — 12분할 색상환 회전
        ctx.lineWidth = 6; ctx.lineCap = 'round';
        const segs = 12;
        for (let i = 0; i < segs; i++) {
          const a0 = -Math.PI / 2 + (gaugeFrac * i) / segs;
          const a1 = -Math.PI / 2 + (gaugeFrac * (i + 1)) / segs;
          ctx.strokeStyle = `hsl(${(i * 30 + s.t * 240) % 360}, 100%, 62%)`;
          ctx.beginPath(); ctx.arc(s.p.x, s.p.y, s.p.r + 10, a0, a1 + 0.02); ctx.stroke();
        }
        // 무지개 오라
        const hue = (s.t * 240) % 360;
        glowCircle(s.p.x, s.p.y, s.p.r + 16 + Math.sin(s.t * 10) * 2, `hsla(${hue}, 100%, 62%, 0.18)`, 20, 1);
      } else {
        const col = COMBO_COLORS[s.combo - 1];
        ctx.strokeStyle = col; ctx.lineWidth = 2.5 + cRatio * 3.5;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.arc(s.p.x, s.p.y, s.p.r + 10, -Math.PI / 2, -Math.PI / 2 + gaugeFrac);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      const fs = 13 + s.combo * 2.2;
      const pulse = isMax ? 1 + Math.sin(s.t * 12) * 0.1 : 1;
      ctx.font = `900 ${Math.round(fs * pulse)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = Math.max(3, fs * 0.16); ctx.strokeStyle = 'rgba(10,12,30,0.85)';
      ctx.strokeText(`×${s.combo}`, s.p.x, s.p.y - s.p.r - 18);
      const textCol = isMax ? `hsl(${(s.t * 240) % 360}, 100%, 65%)` : COMBO_COLORS[s.combo - 1]; // 맥스 = 무지개 순환
      ctx.fillStyle = textCol;
      if (s.combo >= 7) { ctx.shadowColor = textCol; ctx.shadowBlur = isMax ? 18 : 12; }
      ctx.fillText(isMax ? `×${s.combo} MAX!` : `×${s.combo}`, s.p.x, s.p.y - s.p.r - 18);
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
