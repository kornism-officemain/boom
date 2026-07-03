// 플레이 씬 v4 — 서바이벌 + 자동사격 + 5단계 진화 + 2배 월드(카메라 추적)
// 오브젝트 추가 = GOODS/THREATS 레지스트리 + config 계수 + schedule. (CLAUDE.md 철칙 2)
import { input } from './input.js';
import { createFx, burst, floatText, shake, flash, updateFx, drawFx } from './fx.js';
import { sfx } from './sfx.js';

// 색 문법: 푸른 계열 = 이득 / 붉은 계열 = 위협 (GDD §0)
const C = {
  player: '#4a5578', dome: '#bfe3ff', flame: '#ffb54a', shot: '#8fd0ff',
  orb: '#7ec8f7', cobalt: '#2b6fb3', freeze: '#4dd6e8', magnet: '#2ec4b6', star: '#7b68ee', heart: '#4f9cf0',
  drone: '#ff9f5a', hunter: '#d7263d', splitter: '#ff6b6b', bullet: '#ff3b3b', mine: '#8e1e1e',
};
const UNLOCK_LABEL = {
  cobalt: '코발트 크리스탈', hunter: '헌터', splitter: '스플리터', magnet: '마그넷',
  bullet: '레이저', freeze: '프리즈', heart: '하트', mine: '마인', star: '스타',
};
const GOOD_TYPES = new Set(['cobalt', 'freeze', 'magnet', 'star', 'heart']);

export function runGame(cfg, canvas, hud, onEnd) {
  const ctx = canvas.getContext('2d');
  const VW = canvas.width, VH = canvas.height;           // 뷰포트
  const WORLD = cfg.world;                               // 월드 (2배)
  const rand = (a, b) => a + Math.random() * (b - a);
  const LEVELS = [cfg.shipLv1, cfg.shipLv2, cfg.shipLv3, cfg.shipLv4, cfg.shipLv5];

  const s = {
    t: 0, lives: cfg.run.lives, invuln: 0,
    lv: 0, hp: cfg.shipLv1.hp, face: -Math.PI / 2, fireTimer: 0, kills: 0,
    score: 0, survivalAcc: 0, collected: 0,
    combo: 0, comboTimer: 0, maxCombo: 0, nearMiss: 0,
    rush: 0, star: 0, freeze: 0, magnet: 0, slowmo: 0,
    cause: '', over: false,
    p: { x: WORLD.w / 2, y: WORLD.h / 2, r: cfg.shipLv1.radius },
    goods: [], threats: [], shots: [],
    orbTimer: 0, threatTimer: 0,
    nextMilestone: cfg.survival.milestoneEvery,
    unlockQueue: Object.entries(cfg.schedule).sort((a, b) => a[1] - b[1]),
  };
  const cam = { x: WORLD.w / 2 - VW / 2, y: WORLD.h / 2 - VH / 2 };
  const capT = cfg.difficulty.spawnDiv * (cfg.difficulty.spawnMax - 1);
  // 스타필드 — 카메라 이동감의 필수 요소
  const stars = Array.from({ length: 140 }, () => ({ x: rand(0, WORLD.w), y: rand(0, WORLD.h), r: rand(0.6, 1.9), a: rand(0.12, 0.35) }));

  const speedCoef = () => Math.min(1 + s.t / cfg.difficulty.speedDiv, cfg.difficulty.speedMax);
  const spawnCoef = () => Math.min(1 + s.t / cfg.difficulty.spawnDiv, cfg.difficulty.spawnMax);
  const unlocked = (name) => s.t >= (cfg.schedule[name] ?? 0);
  const offView = (o, m) => o.x < cam.x - m || o.x > cam.x + VW + m || o.y < cam.y - m || o.y > cam.y + VH + m;
  const fx = createFx();

  const popScore = (gained) => {
    const el = hud.score;
    if (!el.classList) return;
    const cls = gained >= 50 ? 'pop3' : gained >= 15 ? 'pop2' : 'pop1';
    el.classList.remove('pop1', 'pop2', 'pop3');
    void el.offsetWidth;
    el.classList.add(cls);
  };

  // ---- 진화 (점수 도달 시 자동, 루프 무중단) ----
  function checkLevelUp() {
    let nl = s.lv;
    while (nl + 1 < LEVELS.length && s.score >= LEVELS[nl + 1].at) nl++;
    if (nl === s.lv) return;
    s.lv = nl;
    const L = LEVELS[nl];
    s.hp = L.hp; s.p.r = L.radius;             // 풀 수리 + 기체 확대
    s.invuln = Math.max(s.invuln, 1.2);
    floatText(fx, s.p.x, s.p.y - 40, `LEVEL UP!  Lv.${nl + 1}`, C.star, 28);
    burst(fx, s.p.x, s.p.y, C.dome, 26, 320);
    flash(fx, 'rgba(123,104,238,0.18)');
    sfx.levelup();
    if (hud.level) { hud.level.textContent = `Lv.${nl + 1}`; popScore(60); }
  }

  const onCollect = (base, g) => {
    s.comboTimer > 0 ? (s.combo = Math.min(s.combo + 1, cfg.combo.max)) : (s.combo = 1);
    s.comboTimer = cfg.combo.window;
    s.maxCombo = Math.max(s.maxCombo, s.combo);
    const gained = base * s.combo * (s.star > 0 ? cfg.star.multiplier : 1);
    s.score += gained;
    popScore(gained);
    floatText(fx, g.x, g.y, `+${gained}`, C.cobalt, 12 + s.combo * 1.5);
    sfx.collect(s.combo);
    s.collected++;
    if (s.collected % cfg.rush.need === 0) {
      s.rush = cfg.rush.duration;
      floatText(fx, s.p.x, s.p.y - 28, 'RUSH!', C.star, 26);
      burst(fx, s.p.x, s.p.y, C.star, 22, 280);
      sfx.rush();
    }
  };

  // 뷰포트 안 랜덤 위치 (수집물은 항상 발견 가능해야 함)
  const inView = (pad) => ({ x: cam.x + rand(pad, VW - pad), y: cam.y + rand(pad, VH - pad) });

  const GOODS = {
    orb: {
      spawn: () => ({ type: 'orb', ...inView(40), r: cfg.orb.radius, life: cfg.orb.life }),
      collect: (g) => onCollect(cfg.orb.score, g),
    },
    cobalt: {
      spawn: () => {
        const a = rand(0, Math.PI * 2);
        return { type: 'cobalt', ...inView(70), r: cfg.cobalt.radius, life: cfg.cobalt.life,
                 vx: Math.cos(a) * cfg.cobalt.speed, vy: Math.sin(a) * cfg.cobalt.speed };
      },
      collect: (g) => onCollect(cfg.cobalt.score, g),
    },
    freeze: {
      spawn: () => ({ type: 'freeze', ...inView(50), r: cfg.freeze.radius, life: cfg.freeze.life }),
      collect: (g) => { s.freeze = cfg.freeze.duration; floatText(fx, g.x, g.y, 'FREEZE ❄', C.freeze, 18); sfx.special(); },
    },
    magnet: {
      spawn: () => ({ type: 'magnet', ...inView(50), r: cfg.magnet.pickRadius, life: cfg.magnet.life }),
      collect: (g) => { s.magnet = cfg.magnet.duration; floatText(fx, g.x, g.y, 'MAGNET ◎', C.magnet, 18); sfx.special(); },
    },
    star: {
      spawn: () => ({ type: 'star', ...inView(50), r: cfg.star.radius, life: cfg.star.life }),
      collect: (g) => { s.star = cfg.star.duration; floatText(fx, g.x, g.y, `점수 ×${cfg.star.multiplier}!`, C.star, 20); sfx.special(); },
    },
    heart: {
      spawn: () => ({ type: 'heart', ...inView(50), r: cfg.heart.radius, life: cfg.heart.life }),
      collect: (g) => {
        const L = LEVELS[s.lv];
        if (s.lives < cfg.run.lifeMax) { s.lives++; floatText(fx, g.x, g.y, '♥ +1 LIFE', C.heart, 20); }
        else if (s.hp < L.hp) { s.hp = L.hp; floatText(fx, g.x, g.y, '풀 수리!', C.heart, 18); }
        else { s.score += 20; popScore(20); floatText(fx, g.x, g.y, '+20', C.heart, 16); }
        sfx.heart();
      },
    },
  };
  const SPECIAL_GOODS = ['cobalt', 'freeze', 'magnet', 'star', 'heart'];

  // 뷰포트 가장자리 스폰 (텔레그래프 원칙: 위협은 보이는 곳 근처에서 온다)
  function viewEdge(m) {
    const side = Math.floor(rand(0, 4));
    return [
      { x: cam.x - m, y: cam.y + rand(0, VH) }, { x: cam.x + VW + m, y: cam.y + rand(0, VH) },
      { x: cam.x + rand(0, VW), y: cam.y - m }, { x: cam.x + rand(0, VW), y: cam.y + VH + m },
    ][side];
  }

  const THREATS = {
    drone: { // 소행성 — 뷰를 가로질러 직선 비행
      weight: () => 1,
      spawn: () => {
        const pos = viewEdge(20);
        const aim = { x: cam.x + rand(VW * 0.2, VW * 0.8), y: cam.y + rand(VH * 0.2, VH * 0.8) };
        const a = Math.atan2(aim.y - pos.y, aim.x - pos.x);
        const v = cfg.difficulty.threatBaseSpeed * speedCoef();
        return { type: 'drone', ...pos, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 10,
                 spin: rand(0, Math.PI * 2), hp: cfg.enemyHp.drone, hpMax: cfg.enemyHp.drone };
      },
      update: (o, dt) => { o.x += o.vx * dt; o.y += o.vy * dt; o.spin += dt * 2; o.dead = o.dead || offView(o, 420); },
    },
    hunter: { // 추적선 — 후반(lateAt)엔 동시 3기
      weight: () => {
        const maxAlive = s.t >= cfg.hunter.lateAt ? cfg.hunter.maxAliveLate : cfg.hunter.maxAlive;
        return unlocked('hunter') && s.threats.filter((t) => t.type === 'hunter').length < maxAlive ? cfg.hunter.weight : 0;
      },
      spawn: () => ({ type: 'hunter', ...viewEdge(20), r: 11, life: cfg.hunter.life,
                      hp: cfg.enemyHp.hunter, hpMax: cfg.enemyHp.hunter }),
      update: (o, dt) => {
        const d = Math.hypot(s.p.x - o.x, s.p.y - o.y) || 1;
        const v = cfg.hunter.speed * speedCoef();
        o.x += ((s.p.x - o.x) / d) * v * dt;
        o.y += ((s.p.y - o.y) / d) * v * dt;
        o.life -= dt; o.dead = o.dead || o.life <= 0;
      },
    },
    splitter: { // 분열 셀 — 분열 전에 격추하면 이득
      weight: () => (unlocked('splitter') ? cfg.splitter.weight : 0),
      spawn: () => {
        const base = THREATS.drone.spawn();
        return { ...base, type: 'splitter', r: cfg.splitter.radius,
                 hp: cfg.enemyHp.splitter, hpMax: cfg.enemyHp.splitter,
                 splitIn: rand(cfg.splitter.splitMin, cfg.splitter.splitMax), canSplit: true };
      },
      update: (o, dt) => {
        THREATS.drone.update(o, dt);
        if (!o.dead && o.canSplit && (o.splitIn -= dt) <= 0) {
          o.canSplit = false;
          const a = Math.atan2(o.vy, o.vx), v = Math.hypot(o.vx, o.vy);
          const childHp = Math.ceil(cfg.enemyHp.splitter / 2);
          for (const da of [-0.45, 0.45]) {
            s.threats.push({ ...o, vx: Math.cos(a + da) * v, vy: Math.sin(a + da) * v,
                             canSplit: false, nmDone: false, hp: childHp, hpMax: childHp });
          }
          o.dead = true;
        }
      },
    },
    bullet: { // 레이저 — 경고선 0.8초 후 발사 (격추 불가)
      weight: () => (unlocked('bullet') ? cfg.bullet.weight : 0),
      spawn: () => {
        const pos = viewEdge(10);
        const a = Math.atan2(s.p.y - pos.y, s.p.x - pos.x);
        return { type: 'bullet', ...pos, dx: Math.cos(a), dy: Math.sin(a), r: cfg.bullet.radius,
                 warn: cfg.bullet.telegraph, harmless: true };
      },
      update: (o, dt) => {
        if (o.warn > 0) { o.warn -= dt; if (o.warn <= 0) o.harmless = false; return; }
        o.x += o.dx * cfg.bullet.speed * dt;
        o.y += o.dy * cfg.bullet.speed * dt;
        o.dead = o.dead || offView(o, 420);
      },
    },
    mine: { // 기뢰 — 페이드인 중에도 격추 가능 (해체 플레이)
      weight: () => (unlocked('mine') ? cfg.mine.weight : 0),
      spawn: () => {
        let x, y, tries = 0;
        do { ({ x, y } = inView(30)); }
        while (Math.hypot(x - s.p.x, y - s.p.y) < cfg.mine.safeRadius && ++tries < 20);
        return { type: 'mine', x, y, r: cfg.mine.radius, life: cfg.mine.life, age: 0, harmless: true,
                 hp: cfg.enemyHp.mine, hpMax: cfg.enemyHp.mine };
      },
      update: (o, dt) => {
        o.age += dt;
        if (o.harmless && o.age >= cfg.mine.fadeIn) o.harmless = false;
        o.life -= dt; o.dead = o.dead || o.life <= 0;
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

  // ---- 이동 + 기수 방향 (기수는 항상 진행 방향) ----
  function movePlayer(dt) {
    const mv = input.getMove();
    const p = s.p;
    const spd = LEVELS[s.lv].speedMul;
    let nx = p.x, ny = p.y;
    if (mv.mode === 'key') {
      nx += mv.dx * cfg.player.keySpeed * spd * dt;
      ny += mv.dy * cfg.player.keySpeed * spd * dt;
    } else if (mv.mode === 'mouse') {
      const f = 1 - Math.pow(1 - cfg.player.lerp, dt * 60);
      nx += (mv.tx + cam.x - p.x) * f;                    // 마우스 좌표 → 월드 좌표
      ny += (mv.ty + cam.y - p.y) * f;
    }
    const dx = nx - p.x, dy = ny - p.y, dist = Math.hypot(dx, dy), maxD = cfg.player.maxSpeed * spd * dt;
    if (dist > maxD) { nx = p.x + (dx / dist) * maxD; ny = p.y + (dy / dist) * maxD; }
    if (dist > 1.5) s.face = Math.atan2(ny - p.y, nx - p.x);
    s.moving = dist > 1.5;
    p.x = Math.max(p.r, Math.min(WORLD.w - p.r, nx));
    p.y = Math.max(p.r, Math.min(WORLD.h - p.r, ny));
  }

  // ---- 자동 사격 (기수 방향 — 쏘려면 다가가야 한다) ----
  function autoFire(dt) {
    s.fireTimer -= dt;
    if (s.fireTimer > 0 || s.shots.length >= cfg.shot.max) return;
    const L = LEVELS[s.lv];
    s.fireTimer = L.fireInt;
    const nose = { x: s.p.x + Math.cos(s.face) * s.p.r * 1.4, y: s.p.y + Math.sin(s.face) * s.p.r * 1.4 };
    const mk = (ang, ox = 0, oy = 0) => ({
      x: nose.x + ox, y: nose.y + oy,
      dx: Math.cos(ang), dy: Math.sin(ang),
      dmg: L.dmg, life: cfg.shot.life, r: cfg.shot.radius,
    });
    const px = Math.cos(s.face + Math.PI / 2), py = Math.sin(s.face + Math.PI / 2);
    if (L.shots === 1) s.shots.push(mk(s.face));
    else if (L.shots === 2) { s.shots.push(mk(s.face, px * 6, py * 6), mk(s.face, -px * 6, -py * 6)); }
    else { s.shots.push(mk(s.face), mk(s.face - 0.14, px * 7, py * 7), mk(s.face + 0.14, -px * 7, -py * 7)); }
    sfx.shoot();
  }
  function updateShots(dt) {
    for (const b of s.shots) {
      b.x += b.dx * cfg.shot.speed * dt;
      b.y += b.dy * cfg.shot.speed * dt;
      b.life -= dt;
      if (b.life <= 0 || offView(b, 60)) { b.dead = true; continue; }
      for (const th of s.threats) {
        if (th.hp == null || th.dead) continue;      // 레이저는 격추 불가
        if (Math.hypot(th.x - b.x, th.y - b.y) < th.r + b.r) {
          b.dead = true;
          th.hp -= b.dmg;
          burst(fx, b.x, b.y, C[th.type], 4, 120);
          floatText(fx, th.x, th.y - th.r - 8, `-${b.dmg}`, '#ffffff', 11);
          if (th.hp <= 0) {                          // 격추!
            th.dead = true; s.kills++;
            const ks = cfg.killScore[th.type] || 0;
            s.score += ks; popScore(ks);
            burst(fx, th.x, th.y, C[th.type], 14, 220);
            floatText(fx, th.x, th.y, `격추 +${ks}`, C.drone, 14);
            sfx.kill();
          }
          break;
        }
      }
    }
    s.shots = s.shots.filter((b) => !b.dead);
  }

  // ---- 피격: HP를 깎고, HP 소진 시 목숨 -1 ----
  function hit(threat) {
    if (s.invuln > 0 || s.rush > 0) return;
    const dmg = cfg.contactDmg[threat.type] || 10;
    threat.dead = true;
    s.combo = 0; s.comboTimer = 0;
    s.hp -= dmg;
    burst(fx, s.p.x, s.p.y, C[threat.type], 14, 230);
    floatText(fx, s.p.x, s.p.y - s.p.r - 14, `-${dmg}`, C.bullet, 18);
    if (s.hp <= 0) {
      s.lives--;
      shake(fx, 11); flash(fx, 'rgba(255,80,80,0.3)'); s.slowmo = 0.3;
      if (s.lives <= 0) { s.cause = `${UNLOCK_LABEL[threat.type] || threat.type}에게 격침됨`; s.over = true; sfx.death(); }
      else {
        s.hp = LEVELS[s.lv].hp;
        s.invuln = cfg.run.hitInvuln;
        floatText(fx, s.p.x, s.p.y - 34, '기체 대파! -1 LIFE', C.bullet, 20);
        sfx.hit();
      }
    } else {
      s.invuln = cfg.run.dmgInvuln;
      shake(fx, 6); flash(fx, 'rgba(255,80,80,0.18)'); s.slowmo = 0.12;
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
        th.nmDone = true; s.nearMiss++; s.score += cfg.nearMiss.score;
        popScore(cfg.nearMiss.score);
        s.slowmo = Math.max(s.slowmo, cfg.nearMiss.slowmo);   // 니어미스 슬로모 — 곡예 강조
        burst(fx, (th.x + p.x) / 2, (th.y + p.y) / 2, C.freeze, 6, 140);
        floatText(fx, p.x, p.y - p.r - 18, `아슬! +${cfg.nearMiss.score}`, C.freeze, 16);
        flash(fx, 'rgba(77,214,232,0.10)');
        sfx.nearMiss();
      }
    }
  }

  function update(dt) {
    s.t += dt;
    s.invuln = Math.max(0, s.invuln - dt);
    s.rush = Math.max(0, s.rush - dt);
    s.star = Math.max(0, s.star - dt);
    s.freeze = Math.max(0, s.freeze - dt);
    s.magnet = Math.max(0, s.magnet - dt);
    if (s.comboTimer > 0) { s.comboTimer -= dt; if (s.comboTimer <= 0) s.combo = 0; }
    s.survivalAcc += dt;
    if (s.survivalAcc >= 1) { s.survivalAcc -= 1; s.score += cfg.survival.perSec; }

    if (s.t >= s.nextMilestone) {
      const bonus = (s.nextMilestone / cfg.survival.milestoneEvery) * cfg.survival.milestoneBonus;
      s.score += bonus;
      popScore(bonus);
      floatText(fx, cam.x + VW / 2, cam.y + 90, `${s.nextMilestone}초 생존! +${bonus}`, C.star, 24);
      sfx.milestone();
      s.nextMilestone += cfg.survival.milestoneEvery;
    }
    while (s.unlockQueue.length && s.t >= s.unlockQueue[0][1]) {
      const [name] = s.unlockQueue.shift();
      floatText(fx, cam.x + VW / 2, cam.y + 60, `NEW: ${UNLOCK_LABEL[name] || name}`, GOOD_TYPES.has(name) ? C.cobalt : C.hunter, 20);
    }
    checkLevelUp();

    movePlayer(dt);
    // 카메라 — 플레이어 추적 (월드 경계 클램프)
    const f = 1 - Math.pow(0.85, dt * 60);
    cam.x += (s.p.x - VW / 2 - cam.x) * f;
    cam.y += (s.p.y - VH / 2 - cam.y) * f;
    cam.x = Math.max(0, Math.min(WORLD.w - VW, cam.x));
    cam.y = Math.max(0, Math.min(WORLD.h - VH, cam.y));

    autoFire(dt);
    spawnGood(dt); spawnThreat(dt);

    const threatDt = s.freeze > 0 ? dt * 0.15 : dt;
    for (const g of s.goods) {
      if (g.vx) { g.x += g.vx * dt; g.y += g.vy * dt; }
      if (g.life != null) { g.life -= dt; if (g.life <= 0) g.dead = true; }
      const mr = s.rush > 0 ? cfg.rush.magnetRadius : (s.magnet > 0 ? cfg.magnet.radius : 0);
      if (mr) {
        const d = Math.hypot(s.p.x - g.x, s.p.y - g.y);
        if (d < mr && d > 1) { g.x += ((s.p.x - g.x) / d) * 500 * dt; g.y += ((s.p.y - g.y) / d) * 500 * dt; }
      }
    }
    for (const th of s.threats) if (!th.dead) THREATS[th.type].update(th, threatDt);
    updateShots(dt);
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
  function bar(x, y, w, h, ratio, back, front) {
    ctx.fillStyle = back; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = front; ctx.fillRect(x, y, w * Math.max(0, ratio), h);
  }
  function drawShip(p) {
    // 비행선 — 레벨이 오를수록 커지고 디테일 추가 (크기·디테일 = 강함)
    const lv = s.lv, r = p.r;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(s.face + Math.PI / 2);
    if (s.moving) { // 추진 화염
      const fl = r * (1.1 + Math.sin(s.t * 30) * 0.3);
      ctx.fillStyle = C.flame; ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.moveTo(-r * 0.35, r * 0.9); ctx.lineTo(0, r * 0.9 + fl); ctx.lineTo(r * 0.35, r * 0.9); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (lv >= 2) { // 날개
      ctx.fillStyle = '#5f6c96';
      ctx.beginPath(); ctx.moveTo(-r * 0.6, r * 0.1); ctx.lineTo(-r * 1.5, r * 0.9); ctx.lineTo(-r * 0.5, r * 0.75); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(r * 0.6, r * 0.1); ctx.lineTo(r * 1.5, r * 0.9); ctx.lineTo(r * 0.5, r * 0.75); ctx.closePath(); ctx.fill();
    }
    if (lv >= 4) { // 트윈 테일 핀
      ctx.fillStyle = '#39415e';
      ctx.fillRect(-r * 0.75, r * 0.5, r * 0.28, r * 0.75);
      ctx.fillRect(r * 0.47, r * 0.5, r * 0.28, r * 0.75);
    }
    // 본체
    ctx.fillStyle = C.player;
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.5);
    ctx.quadraticCurveTo(r * 0.95, -r * 0.1, r * 0.62, r * 0.9);
    ctx.lineTo(-r * 0.62, r * 0.9);
    ctx.quadraticCurveTo(-r * 0.95, -r * 0.1, 0, -r * 1.5);
    ctx.fill();
    if (lv >= 5) { ctx.strokeStyle = C.star; ctx.lineWidth = 2; ctx.globalAlpha = 0.8; ctx.stroke(); ctx.globalAlpha = 1; } // 최종형 아우라 라인
    // 콕핏
    ctx.fillStyle = C.dome;
    ctx.beginPath(); ctx.arc(0, -r * 0.35, r * 0.4, 0, Math.PI * 2); ctx.fill();
    if (lv >= 3) { // 윙팁 라이트
      const on = Math.sin(s.t * 8) > 0;
      circle(-r * 1.3, r * 0.75, 2.4, on ? '#ffe28a' : '#8a93b8');
      circle(r * 1.3, r * 0.75, 2.4, on ? '#ffe28a' : '#8a93b8');
    }
    ctx.restore();
    // 내 HP 게이지 — 기체 아래 상시 표시
    const ratio = s.hp / LEVELS[s.lv].hp;
    bar(p.x - 18, p.y + r + 8, 36, 5, ratio, 'rgba(58,63,82,.25)', ratio > 0.5 ? '#3ecf8e' : ratio > 0.25 ? '#ffd166' : '#ff6b6b');
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
      const GLYPH = { freeze: '❄', magnet: '◎', star: '★', heart: '♥' };
      circle(g.x, g.y, g.r + 3, '#ffffff', blink);
      ctx.globalAlpha = blink;
      ctx.strokeStyle = C[g.type]; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(g.x, g.y, g.r + 3, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = C[g.type];
      ctx.font = `bold ${g.r * 1.7}px sans-serif`; ctx.textAlign = 'center';
      ctx.fillText(GLYPH[g.type], g.x, g.y + g.r * 0.62);
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
        ctx.lineTo(th.x + th.dx * 2400, th.y + th.dy * 2400); ctx.stroke();
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
    // 적 HP 게이지 — 피격당한 적만 표시 (화면 소음 최소화)
    if (th.hp != null && th.hp < th.hpMax) {
      const ratio = th.hp / th.hpMax;
      bar(th.x - 12, th.y - th.r - 10, 24, 3.5, ratio, 'rgba(58,63,82,.25)', '#ff6b6b');
    }
  }
  function draw() {
    ctx.clearRect(0, 0, VW, VH);
    ctx.save();
    const sx = fx.shake > 0 ? rand(-fx.shake, fx.shake) : 0;
    const sy = fx.shake > 0 ? rand(-fx.shake, fx.shake) : 0;
    ctx.translate(-cam.x + sx, -cam.y + sy);
    // 스타필드 + 월드 경계
    for (const st of stars) circle(st.x, st.y, st.r, '#3a3f52', st.a);
    ctx.strokeStyle = 'rgba(90,169,230,.35)'; ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, WORLD.w - 4, WORLD.h - 4);
    for (const g of s.goods) drawGood(g);
    for (const th of s.threats) drawThreat(th);
    // 내 총알
    ctx.lineCap = 'round';
    for (const b of s.shots) {
      ctx.strokeStyle = C.shot; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(b.x - b.dx * 10, b.y - b.dy * 10); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    if (s.magnet > 0 || s.rush > 0) {
      const mr = s.rush > 0 ? cfg.rush.magnetRadius : cfg.magnet.radius;
      circle(s.p.x, s.p.y, mr, C.magnet, 0.07);
    }
    if (s.star > 0) circle(s.p.x, s.p.y, s.p.r + 8, C.star, 0.35 + (s.star < 2 ? Math.sin(s.t * 15) * 0.2 : 0));
    if (s.rush > 0) circle(s.p.x, s.p.y, s.p.r + 11 + Math.sin(s.t * 12) * 3, C.star, 0.3);
    const visible = s.invuln <= 0 || Math.sin(s.t * 25) > 0;
    if (visible) drawShip(s.p);
    if (s.combo > 1 && s.comboTimer > 0) {
      ctx.strokeStyle = C.orb; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(s.p.x, s.p.y, s.p.r + 10, -Math.PI / 2, -Math.PI / 2 + (s.comboTimer / cfg.combo.window) * Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = C.cobalt; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(`×${s.combo}`, s.p.x, s.p.y - s.p.r - 20);
    }
    drawFx(fx, ctx);
    ctx.restore();
    if (s.freeze > 0) { ctx.strokeStyle = C.freeze; ctx.lineWidth = 6; ctx.globalAlpha = 0.5; ctx.strokeRect(3, 3, VW - 6, VH - 6); ctx.globalAlpha = 1; }
    if (s.lives === 1 && !s.over) {
      ctx.globalAlpha = 0.18 + Math.sin(s.t * 5) * 0.1;
      ctx.strokeStyle = '#ff3b3b'; ctx.lineWidth = 14;
      ctx.strokeRect(0, 0, VW, VH);
      ctx.globalAlpha = 1;
    }
    if (fx.flash > 0) {
      ctx.globalAlpha = (fx.flash / 0.18) * 0.8; ctx.fillStyle = fx.flashColor;
      ctx.fillRect(0, 0, VW, VH); ctx.globalAlpha = 1;
    }
    // HUD
    hud.score.textContent = Math.round(s.score);
    const danger = Math.min(s.t / capT, 1);
    hud.barFill.style.width = `${Math.max(danger * 100, 4)}%`;
    hud.barFill.className = danger < 0.4 ? 'b-blue' : danger < 0.75 ? 'b-green' : 'b-red';
    if (danger >= 1 && hud.barFill.classList) hud.barFill.classList.add('b-max');
    hud.barText.textContent = `🕐 ${Math.floor(s.t)}s`;
    hud.lives.textContent = '♥'.repeat(Math.max(0, s.lives));
    if (hud.lives.classList) hud.lives.classList.toggle('danger', s.lives === 1);
  }

  let raf, last = performance.now(), endDelay = 0;
  function frame(now) {
    let dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    if (s.slowmo > 0) { s.slowmo -= dt; dt *= 0.25; }
    if (!s.over) update(dt);
    else if ((endDelay += dt) > 0.35) {
      cancelAnimationFrame(raf);
      return onEnd({ score: Math.round(s.score), survival: Math.round(s.t), maxCombo: s.maxCombo,
                     nearMiss: s.nearMiss, kills: s.kills, lv: s.lv + 1, cause: s.cause });
    }
    draw();
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  return { stop: () => cancelAnimationFrame(raf), _s: s /* 헤드리스 테스트용 */ };
}
