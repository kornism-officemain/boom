// 플레이 씬 v6 — 퓨어 서바이벌, 단일 화면(960×600), 콤보 + 부스터 집중 설계
// 라이프 3 고정, 충돌 = 목숨 -1 (3번이면 끝). HP/업그레이드/하트 없음.
// 오브젝트 추가 = GOODS/THREATS 레지스트리 + config 계수 + schedule. (CLAUDE.md 철칙 2)
import { input } from './input.js';
import { createFx, burst, floatText, shake, flash, ring, updateFx, drawFx } from './fx.js';
import { sfx } from './sfx.js';

// 색 문법: 푸른 계열 = 이득 / 붉은 계열 = 위협 (GDD §0). v7 심해 발광 톤.
const C = {
  player: '#3fc9dd', belly: '#c8f4ff', lure: '#aef3ff',
  orb: '#6df0c8', cobalt: '#bfe3ff', freeze: '#5fe6f7', magnet: '#3fe0c0',
  boost2: '#b18bff', boost3: '#ffc542',
  octopus: '#9b8bff', turtle: '#3fd6a0', whale: '#7fb8d9',
  drone: '#c4457a', hunter: '#ff4d6a', splitter: '#ff7b7b', bullet: '#ff4040', mine: '#e0563f',
};
// 콤보 강조: 단계별 색 (청록 → 파랑 → 보라 → 골드)
const COMBO_COLORS = ['#6df0c8', '#6df0c8', '#5ad1ff', '#5ad1ff', '#b18bff', '#b18bff', '#b18bff', '#ffc542', '#ffc542', '#ffc542'];
const UNLOCK_LABEL = {
  cobalt: '은빛 치어 떼', hunter: '아기상어', splitter: '분열 해파리', magnet: '소용돌이 진주',
  bullet: '작살', freeze: '냉기 진주', boost2: '×2 황금진주', mine: '기뢰복어', boost3: '×3 무지개진주',
  octopus: '아기 문어', turtle: '등불 거북',
};
const GOOD_TYPES = new Set(['cobalt', 'freeze', 'magnet', 'boost2', 'boost3', 'octopus', 'turtle']);

export function runGame(cfg, canvas, hud, onEnd, meta = {}) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;   // 화면 = 월드. 보이는 게 전부.
  const rand = (a, b) => a + Math.random() * (b - a);
  // 인런 집착 장치: 동료 기록 추월 알림 + 개인 베스트 돌파
  const rivals = (meta.rivals || []).filter((r) => r.name !== meta.myName && r.score > 0)
    .sort((a, b) => a.score - b.score);

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
    rivalIdx: 0, bestNotified: false,
    shield: false, whale: null, whaleTimer: rand(cfg.whale.minGap, cfg.whale.maxGap),
    seen: new Set(['orb', 'drone']),   // 도감 — 이번 런에 만난 생물
  };
  // 배경: 심연 그라디언트 + 마린 스노우 + 빛기둥 (심해)
  const stars = Array.from({ length: 90 }, () => ({ x: rand(0, W), y: rand(0, H), r: rand(0.5, 1.9), a: rand(0.12, 0.4), tw: rand(0, Math.PI * 2), spd: rand(2, 9) }));
  const vign = (() => { // 비네트 — 화면 깊이감
    if (!ctx.createRadialGradient) return null;
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 1.0);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(4,6,20,0.5)');
    return g;
  })();
  const bgGrad = ctx.createLinearGradient ? (() => {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0b2e40'); g.addColorStop(0.5, '#082334'); g.addColorStop(1, '#041521');
    return g;
  })() : '#082334';
  const NEBULAS = [ // 심해의 발광 무리
    { x: W * 0.22, y: H * 0.32, r: 270, c: 'rgba(63,224,192,0.07)' },
    { x: W * 0.78, y: H * 0.66, r: 310, c: 'rgba(90,209,255,0.06)' },
    { x: W * 0.55, y: H * 0.12, r: 210, c: 'rgba(177,139,255,0.05)' },
  ];
  const SHAFTS = [ // 수면에서 내려오는 빛기둥
    { x: W * 0.3, w: 90, tilt: 60 }, { x: W * 0.62, w: 60, tilt: 40 }, { x: W * 0.85, w: 110, tilt: 80 },
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
      hud.banner.textContent = mult >= 3 ? `✦ 무지개진주! 점수 ×${mult}` : `★ 황금진주! 점수 ×${mult}`;
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
      floatText(fx, s.p.x, s.p.y - 28, '광란의 포식!', C.boost2, 26);
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
    octopus: { // 🐙 아기 문어 — 만지면 플랑크톤을 흩뿌리는 잭팟 (가변 보상)
      spawn: () => ({ type: 'octopus', x: rand(50, W - 50), y: rand(50, H - 50), r: cfg.octopus.radius, life: cfg.octopus.life }),
      collect: (g) => {
        for (let i = 0; i < cfg.octopus.scatter; i++) {
          const a = (i / cfg.octopus.scatter) * Math.PI * 2 + rand(-0.2, 0.2);
          const d = rand(50, 110);
          s.goods.push({ type: 'orb', x: Math.max(20, Math.min(W - 20, g.x + Math.cos(a) * d)),
                         y: Math.max(20, Math.min(H - 20, g.y + Math.sin(a) * d)), r: cfg.orb.radius, life: 6 });
        }
        burst(fx, g.x, g.y, 'rgba(40,50,90,0.7)', 20, 200); // 먹물 퍼프
        floatText(fx, g.x, g.y - 20, '🐙 플랑크톤 파티!', C.octopus, 22);
        ring(fx, g.x, g.y, C.octopus, 110, 300);
        sfx.special();
      },
    },
    turtle: { // 🐢 등불 거북 — 등껍질 실드 1회 (다음 피격 무효)
      spawn: () => {
        const dir = rand(0, 1) < 0.5 ? 1 : -1;
        return { type: 'turtle', x: rand(60, W - 60), y: rand(60, H - 60), r: cfg.turtle.radius,
                 life: cfg.turtle.life, vx: dir * cfg.turtle.speed, vy: rand(-8, 8) };
      },
      collect: (g) => {
        if (!s.shield) { s.shield = true; floatText(fx, g.x, g.y - 18, '🛡 등껍질 실드!', C.turtle, 20); }
        else { s.score += 15; popScore(15); floatText(fx, g.x, g.y - 18, '+15', C.turtle, 16); }
        ring(fx, s.p.x, s.p.y, C.turtle, 60, 220);
        sfx.shield();
      },
    },
  };
  const SPECIAL_GOODS = ['cobalt', 'freeze', 'magnet', 'boost2', 'boost3', 'octopus', 'turtle'];

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
      if (unlocked(t) && Math.random() < cfg[t].weight) { s.goods.push(GOODS[t].spawn()); s.seen.add(t); }
  }
  function spawnThreat(dt) {
    s.threatTimer -= dt;
    if (s.threatTimer > 0 || s.threats.length >= cfg.difficulty.maxThreats) return;
    s.threatTimer = Math.max(cfg.difficulty.threatSpawnBase / spawnCoef(), cfg.difficulty.threatSpawnMin);
    const pool = Object.entries(THREATS).map(([k, def]) => [k, def.weight()]);
    const total = pool.reduce((a, [, w]) => a + w, 0);
    let roll = Math.random() * total;
    for (const [k, w] of pool) { roll -= w; if (roll <= 0) { s.threats.push(THREATS[k].spawn()); s.seen.add(k); break; } }
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
    if (Math.abs(nx - p.x) > 0.4) s.faceX = nx > p.x ? 1 : -1; // 물고기 좌우 방향
    p.x = Math.max(p.r, Math.min(W - p.r, nx));
    p.y = Math.max(p.r, Math.min(H - p.r, ny));
    // 이동 시 기포 트레일
    s.trailTimer = (s.trailTimer || 0) - dt;
    if (s.moving && s.trailTimer <= 0) {
      s.trailTimer = 0.06;
      fx.parts.push({ x: p.x - (s.faceX || 1) * p.r, y: p.y + rand(-4, 4), vx: -(s.faceX || 1) * 30, vy: -28, life: 0.5, max: 0.5,
                      color: s.boostMult > 1 ? s.boostColor : 'rgba(180,230,255,0.55)', r: 2.5 });
    }
  }

  // ---- 피격: 충돌 = 목숨 -1. 3번이면 끝. (등껍질 실드가 있으면 1회 무효) ----
  function hit(threat) {
    if (s.invuln > 0 || s.rush > 0) return;
    threat.dead = true;
    if (s.shield) { // 실드 소모 — 목숨 보존
      s.shield = false;
      s.invuln = 0.8;
      ring(fx, s.p.x, s.p.y, C.turtle, 90, 320);
      burst(fx, s.p.x, s.p.y, C.turtle, 16, 240);
      floatText(fx, s.p.x, s.p.y - 30, '🛡 실드 파괴!', C.turtle, 20);
      shake(fx, 6);
      sfx.shieldBreak();
      return;
    }
    s.lives--;
    s.combo = 0; s.comboTimer = 0;
    endBoost();                                 // 피격 시 부스터도 소멸 — 부스터를 지키고 싶게
    burst(fx, s.p.x, s.p.y, C[threat.type], 18, 260);
    shake(fx, 11);
    flash(fx, 'rgba(255,80,80,0.3)');
    s.slowmo = 0.3;
    if (s.lives <= 0) {
      s.cause = `${UNLOCK_LABEL[threat.type] || threat.type}에게 잡아먹혔다`;
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
    // 🏆 동료 추월 알림 — 리더보드 집착의 핵심
    while (s.rivalIdx < rivals.length && s.score > rivals[s.rivalIdx].score) {
      const r = rivals[s.rivalIdx++];
      const rank = rivals.length - s.rivalIdx + 1;
      floatText(fx, W / 2, 130, `👑 ${r.name} 추월! 현재 ${rank}위`, C.boost3, 22);
      ring(fx, s.p.x, s.p.y, C.boost3, 70, 240);
      sfx.milestone();
    }
    // 개인 베스트 돌파 — 그 순간을 인런에서 터뜨림
    if (!s.bestNotified && meta.best > 0 && s.score > meta.best) {
      s.bestNotified = true;
      floatText(fx, W / 2, 170, '🚀 PERSONAL BEST 돌파!', `hsl(${(s.t * 240) % 360},100%,65%)`, 26);
      flash(fx, 'rgba(255,197,66,0.2)');
      ring(fx, s.p.x, s.p.y, C.boost3, 160, 360);
      sfx.newBest();
    }

    movePlayer(dt);
    // 🐋 고래 이벤트 — 잭팟 타임 (플랑크톤 비)
    if (!s.whale) {
      s.whaleTimer -= dt;
      if (s.whaleTimer <= 0) {
        const dir = Math.random() < 0.5 ? 1 : -1;
        s.whale = { x: dir > 0 ? -150 : W + 150, y: rand(110, H - 190), dir, drop: 0.6, spout: 0 };
        s.seen.add('whale');
        floatText(fx, W / 2, 100, '🐋 고래가 지나간다! 플랑크톤 비!', C.whale, 24);
        flash(fx, 'rgba(127,184,217,0.15)');
        sfx.whale();
      }
    } else {
      const w = s.whale;
      w.x += w.dir * cfg.whale.speed * dt;
      w.drop -= dt;
      if (w.drop <= 0 && s.goods.length < 70) {
        w.drop = cfg.whale.dropEvery;
        s.goods.push({ type: 'orb', x: Math.max(20, Math.min(W - 20, w.x + rand(-70, 70))),
                       y: Math.min(H - 30, w.y + rand(50, 110)), r: cfg.orb.radius, life: 6.5 });
      }
      w.spout -= dt; // 물뿜기
      if (w.spout <= 0) { w.spout = 1.1; for (let i = 0; i < 4; i++) fx.parts.push({ x: w.x + w.dir * 55, y: w.y - 42, vx: rand(-15, 15), vy: -rand(50, 90), life: 0.6, max: 0.6, color: 'rgba(200,240,255,0.5)', r: 2.5 }); }
      if ((w.dir > 0 && w.x > W + 170) || (w.dir < 0 && w.x < -170)) {
        s.whale = null;
        s.whaleTimer = rand(cfg.whale.minGap, cfg.whale.maxGap);
      }
    }
    // 앰비언트 기포 — 심해 분위기
    s.bubbleTimer = (s.bubbleTimer ?? rand(0.5, 1.5)) - dt;
    if (s.bubbleTimer <= 0) {
      s.bubbleTimer = rand(0.8, 2.2);
      fx.parts.push({ x: rand(20, W - 20), y: H + 8, vx: rand(-8, 8), vy: -rand(35, 65), life: 3, max: 3,
                      color: 'rgba(180,230,255,0.3)', r: rand(1.5, 3.5) });
    }
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
    // 아기 발광어 — 젤리 몸통 + 꼬리 스윙 + 발광 초롱(루어) + 큰 눈
    const by = Math.sin(s.t * 3) * 1.5;               // 둥실거림 (연출 전용)
    const flip = s.faceX || 1;
    ctx.save(); ctx.translate(p.x, p.y + by); ctx.scale(flip, 1);
    const wig = Math.sin(s.t * (s.moving ? 14 : 6)) * 0.35; // 꼬리 스윙 — 이동 시 빨라짐
    // 꼬리 지느러미
    ctx.fillStyle = 'rgba(63,201,221,0.75)';
    ctx.save(); ctx.translate(-r * 1.25, 0); ctx.rotate(wig);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-r * 0.9, -r * 0.62); ctx.lineTo(-r * 0.55, 0); ctx.lineTo(-r * 0.9, r * 0.62); ctx.closePath(); ctx.fill();
    ctx.restore();
    // 몸통 (발광 그라디언트)
    ctx.save(); ctx.shadowColor = C.player; ctx.shadowBlur = 14;
    const bgFish = ctx.createRadialGradient(r * 0.2, -r * 0.35, r * 0.15, 0, 0, r * 1.4);
    bgFish.addColorStop(0, '#d9fbff'); bgFish.addColorStop(0.45, C.player); bgFish.addColorStop(1, '#14707f');
    ctx.fillStyle = bgFish;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.35, r * 0.95, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // 배 (밝게)
    ctx.fillStyle = 'rgba(200,244,255,0.5)';
    ctx.beginPath(); ctx.ellipse(0, r * 0.4, r * 0.95, r * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    // 등지느러미
    ctx.fillStyle = 'rgba(63,201,221,0.8)';
    ctx.beginPath(); ctx.moveTo(-r * 0.3, -r * 0.85); ctx.quadraticCurveTo(r * 0.1, -r * 1.5, r * 0.45, -r * 0.8); ctx.closePath(); ctx.fill();
    // 초롱 루어 — 이 물고기의 정체성
    ctx.strokeStyle = 'rgba(200,244,255,0.8)'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(r * 0.55, -r * 0.8);
    ctx.quadraticCurveTo(r * 1.15, -r * 1.5, r * 1.35, -r * 1.0); ctx.stroke();
    const lureGlow = 0.7 + Math.sin(s.t * 5) * 0.3;
    glowCircle(r * 1.35, -r * 1.0, r * 0.22, C.lure, 16 * lureGlow, lureGlow);
    // 눈 + 뺨
    circle(r * 0.62, -r * 0.12, r * 0.34, '#ffffff');
    circle(r * 0.72, -r * 0.12, r * 0.17, '#123');
    circle(r * 0.78, -r * 0.18, r * 0.06, '#ffffff');
    circle(r * 0.35, r * 0.28, r * 0.14, 'rgba(255,150,160,0.35)'); // 홍조
    // 입 — 콤보 높으면 벌림 (먹보 모드)
    ctx.strokeStyle = '#0d4a56'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath();
    if (s.combo >= 5) ctx.arc(r * 1.05, r * 0.25, r * 0.2, 0.2, Math.PI - 0.2);
    else ctx.arc(r * 1.0, r * 0.2, r * 0.16, 0.4, Math.PI * 0.75);
    ctx.stroke();
    ctx.restore();
  }
  function drawGood(g) {
    const blink = g.life != null && g.life < 1.2 ? (Math.sin(s.t * 20) > 0 ? 0.35 : 1) : 1;
    if (g.type === 'orb') { // 에너지 구슬 — 광택 구체 + 글로우
      orbSphere(g.x, g.y, g.r, C.orb, blink);
    } else if (g.type === 'cobalt') { // 은빛 치어 — 빠르게 헤엄치는 작은 물고기
      const dir = g.vx >= 0 ? 1 : -1;
      ctx.save(); ctx.translate(g.x, g.y); ctx.scale(dir, 1); ctx.globalAlpha = blink;
      ctx.shadowColor = '#dff4ff'; ctx.shadowBlur = 8;
      const fg = ctx.createLinearGradient(0, -g.r, 0, g.r);
      fg.addColorStop(0, '#ffffff'); fg.addColorStop(0.5, C.cobalt); fg.addColorStop(1, '#7fa8c9');
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.ellipse(0, 0, g.r * 1.15, g.r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      const wig2 = Math.sin(s.t * 18 + g.x) * 0.4; // 꼬리
      ctx.fillStyle = 'rgba(191,227,255,0.8)';
      ctx.save(); ctx.translate(-g.r * 1.05, 0); ctx.rotate(wig2);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-g.r * 0.7, -g.r * 0.45); ctx.lineTo(-g.r * 0.7, g.r * 0.45); ctx.closePath(); ctx.fill();
      ctx.restore();
      circle(g.r * 0.55, -g.r * 0.1, g.r * 0.16, '#123'); // 눈
      ctx.restore(); ctx.globalAlpha = 1;
    } else if (g.type === 'octopus') { // 🐙 아기 문어 — 흐물흐물 다리 + 왕눈
      ctx.save(); ctx.translate(g.x, g.y); ctx.globalAlpha = blink;
      ctx.strokeStyle = C.octopus; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; // 다리 5개
      for (let i = 0; i < 5; i++) {
        const lx = (i - 2) * g.r * 0.42;
        const sway3 = Math.sin(s.t * 5 + i * 1.3) * 4;
        ctx.beginPath(); ctx.moveTo(lx * 0.6, g.r * 0.4);
        ctx.quadraticCurveTo(lx + sway3, g.r * 1.15, lx - sway3, g.r * 1.6); ctx.stroke();
      }
      ctx.save(); ctx.shadowColor = C.octopus; ctx.shadowBlur = 10; // 머리
      const og = ctx.createRadialGradient(-g.r * 0.3, -g.r * 0.4, g.r * 0.15, 0, 0, g.r);
      og.addColorStop(0, '#d8ceff'); og.addColorStop(1, C.octopus);
      ctx.fillStyle = og;
      ctx.beginPath(); ctx.arc(0, 0, g.r * 0.95, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      circle(-g.r * 0.32, 0, g.r * 0.26, '#ffffff', blink); circle(g.r * 0.32, 0, g.r * 0.26, '#ffffff', blink); // 눈
      circle(-g.r * 0.28, 0.5, g.r * 0.13, '#123', blink); circle(g.r * 0.36, 0.5, g.r * 0.13, '#123', blink);
      circle(0, g.r * 0.38, g.r * 0.1, 'rgba(255,150,160,0.5)', blink); // 입
      ctx.restore(); ctx.globalAlpha = 1;
    } else if (g.type === 'turtle') { // 🐢 등불 거북 — 등껍질 + 물갈퀴 + 등불
      const dir2 = g.vx >= 0 ? 1 : -1;
      ctx.save(); ctx.translate(g.x, g.y); ctx.scale(dir2, 1); ctx.globalAlpha = blink;
      const pad = Math.sin(s.t * 6) * 0.4; // 물갈퀴 젓기
      ctx.fillStyle = 'rgba(63,214,160,0.75)';
      ctx.save(); ctx.translate(-g.r * 0.35, g.r * 0.45); ctx.rotate(pad);
      ctx.beginPath(); ctx.ellipse(0, 0, g.r * 0.5, g.r * 0.22, 0.5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      ctx.save(); ctx.translate(g.r * 0.45, g.r * 0.45); ctx.rotate(-pad);
      ctx.beginPath(); ctx.ellipse(0, 0, g.r * 0.5, g.r * 0.22, -0.5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      circle(g.r * 0.95, -g.r * 0.1, g.r * 0.32, '#5ee8b8'); // 머리
      circle(g.r * 1.05, -g.r * 0.18, g.r * 0.09, '#123'); // 눈
      ctx.save(); ctx.shadowColor = C.turtle; ctx.shadowBlur = 8; // 등껍질
      const tg = ctx.createRadialGradient(-g.r * 0.2, -g.r * 0.5, g.r * 0.1, 0, -g.r * 0.1, g.r * 1.05);
      tg.addColorStop(0, '#7ff0c8'); tg.addColorStop(1, '#1e8f68');
      ctx.fillStyle = tg;
      ctx.beginPath(); ctx.ellipse(0, -g.r * 0.15, g.r * 0.95, g.r * 0.65, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.2; // 등껍질 무늬
      ctx.beginPath(); ctx.moveTo(-g.r * 0.6, -g.r * 0.15); ctx.lineTo(g.r * 0.6, -g.r * 0.15);
      ctx.moveTo(-g.r * 0.3, -g.r * 0.6); ctx.lineTo(-g.r * 0.2, g.r * 0.3);
      ctx.moveTo(g.r * 0.3, -g.r * 0.6); ctx.lineTo(g.r * 0.2, g.r * 0.3); ctx.stroke();
      const lg2 = 0.6 + Math.sin(s.t * 4) * 0.4;
      glowCircle(0, -g.r * 0.85, g.r * 0.18, '#aef3ff', 12 * lg2, lg2); // 등불
      ctx.restore(); ctx.globalAlpha = 1;
    } else { // 진주 — 진주광택 배지 + 컬러 링 + 글리프
      const GLYPH = { freeze: '❄', magnet: '◎', boost2: '★', boost3: '✦' };
      const col = C[g.type];
      ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = 14; ctx.globalAlpha = blink;
      const pg = ctx.createRadialGradient(g.x - g.r * 0.35, g.y - g.r * 0.45, g.r * 0.15, g.x, g.y, g.r + 3);
      pg.addColorStop(0, '#ffffff'); pg.addColorStop(0.55, '#e8f4ff'); pg.addColorStop(1, '#b9d4e8');
      ctx.fillStyle = pg;
      ctx.beginPath(); ctx.arc(g.x, g.y, g.r + 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.globalAlpha = blink;
      ctx.strokeStyle = col; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(g.x, g.y, g.r + 3, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = col;
      ctx.font = `bold ${g.r * 1.55}px sans-serif`; ctx.textAlign = 'center';
      ctx.fillText(GLYPH[g.type], g.x, g.y + g.r * 0.55);
      if (g.type === 'boost3') { // ✦ 무지개진주 — 색 순환 회전 링
        ctx.strokeStyle = `hsl(${(s.t * 180) % 360},100%,65%)`;
        ctx.globalAlpha = blink * (0.5 + Math.sin(s.t * 9) * 0.3);
        ctx.setLineDash([6, 6]); ctx.lineDashOffset = -s.t * 30;
        ctx.beginPath(); ctx.arc(g.x, g.y, g.r + 9, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.globalAlpha = 1;
    }
  }
  function drawThreat(th) {
    if (th.type === 'drone') { // 독가시 성게 — 회전 가시 + 셰이딩
      ctx.strokeStyle = C.drone; ctx.lineWidth = 2; ctx.lineCap = 'round';
      for (let i = 0; i < 10; i++) {
        const ang = (i * Math.PI) / 5 + th.spin;
        ctx.beginPath();
        ctx.moveTo(th.x + Math.cos(ang) * th.r * 0.5, th.y + Math.sin(ang) * th.r * 0.5);
        ctx.lineTo(th.x + Math.cos(ang) * th.r * 1.35, th.y + Math.sin(ang) * th.r * 1.35);
        ctx.stroke();
      }
      const ag = ctx.createRadialGradient(th.x - th.r * 0.3, th.y - th.r * 0.3, th.r * 0.15, th.x, th.y, th.r);
      ag.addColorStop(0, '#e87ba8'); ag.addColorStop(0.6, C.drone); ag.addColorStop(1, '#7a1f4a');
      ctx.fillStyle = ag;
      ctx.beginPath(); ctx.arc(th.x, th.y, th.r * 0.85, 0, Math.PI * 2); ctx.fill();
      circle(th.x - th.r * 0.25, th.y - th.r * 0.25, th.r * 0.18, 'rgba(255,255,255,0.4)');
    } else if (th.type === 'hunter') { // 아기상어 — 추적, 꼬리 스윙 + 등지느러미 + 눈
      const ang = Math.atan2(s.p.y - th.y, s.p.x - th.x);
      ctx.save(); ctx.translate(th.x, th.y); ctx.rotate(ang);
      ctx.shadowColor = C.hunter; ctx.shadowBlur = 10;
      const hg = ctx.createLinearGradient(0, -8, 0, 8);
      hg.addColorStop(0, '#ff8098'); hg.addColorStop(1, '#c21833');
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.ellipse(0, 0, 14, 7.5, 0, 0, Math.PI * 2); ctx.fill(); // 몸통 (기수 = +x)
      ctx.shadowBlur = 0;
      const tw2 = Math.sin(s.t * 16) * 0.5; // 꼬리
      ctx.save(); ctx.translate(-13, 0); ctx.rotate(tw2);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-8, -6); ctx.lineTo(-8, 6); ctx.closePath();
      ctx.fillStyle = '#c21833'; ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#e0304d'; // 등지느러미
      ctx.beginPath(); ctx.moveTo(-2, -6); ctx.lineTo(2, -13); ctx.lineTo(6, -6); ctx.closePath(); ctx.fill();
      circle(7, -2.5, 2.6, '#ffffff'); circle(7.8, -2.5, 1.4, '#123'); // 눈
      ctx.strokeStyle = '#5e0a18'; ctx.lineWidth = 1.6; // 이빨 입
      ctx.beginPath(); ctx.moveTo(10, 3); ctx.lineTo(12.5, 1.5); ctx.stroke();
      ctx.restore();
    } else if (th.type === 'splitter') { // 분열 해파리 — 맥동하는 이중 막
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
      ctx.strokeStyle = 'rgba(255,123,123,.55)'; ctx.lineWidth = 1.4; // 촉수
      for (let i = -1; i <= 1; i++) {
        const sway2 = Math.sin(s.t * 6 + i * 2 + th.x) * 3;
        ctx.beginPath(); ctx.moveTo(th.x + i * 4, th.y + th.r * 0.7);
        ctx.quadraticCurveTo(th.x + i * 4 + sway2, th.y + th.r * 1.5, th.x + i * 4 - sway2, th.y + th.r * 2.1); ctx.stroke();
      }
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
      } else { // 작살 — 흰 샤프트 + 붉은 촉
        ctx.save(); ctx.shadowColor = C.bullet; ctx.shadowBlur = 12; ctx.lineCap = 'round';
        ctx.strokeStyle = '#e8f4ff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(th.x - th.dx * 18, th.y - th.dy * 18); ctx.lineTo(th.x, th.y); ctx.stroke();
        const pxv = -th.dy, pyv = th.dx; // 촉 (삼각 화살촉)
        ctx.fillStyle = C.bullet;
        ctx.beginPath();
        ctx.moveTo(th.x + th.dx * 8, th.y + th.dy * 8);
        ctx.lineTo(th.x - th.dx * 2 + pxv * 4.5, th.y - th.dy * 2 + pyv * 4.5);
        ctx.lineTo(th.x - th.dx * 2 - pxv * 4.5, th.y - th.dy * 2 - pyv * 4.5);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    } else if (th.type === 'mine') { // 기뢰복어 — 무해할 땐 홀쭉, 활성화되면 빵빵하게 부풂
      const armed = !th.harmless;
      const a = !armed ? 0.35 + 0.45 * (th.age / cfg.mine.fadeIn)
              : th.life < 1.5 ? (Math.sin(s.t * 18) > 0 ? 0.5 : 1) : 1;
      const R = armed ? th.r : th.r * 0.6; // 부푸는 연출
      ctx.globalAlpha = a;
      if (armed) { // 가시
        ctx.strokeStyle = C.mine; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
        for (let i = 0; i < 8; i++) {
          const ang = (i * Math.PI) / 4 + s.t * 0.5;
          ctx.beginPath();
          ctx.moveTo(th.x + Math.cos(ang) * R * 0.75, th.y + Math.sin(ang) * R * 0.75);
          ctx.lineTo(th.x + Math.cos(ang) * R * 1.25, th.y + Math.sin(ang) * R * 1.25);
          ctx.stroke();
        }
      }
      const mg = ctx.createRadialGradient(th.x - 3, th.y - 4, 1, th.x, th.y, R);
      mg.addColorStop(0, '#ffb08a'); mg.addColorStop(1, armed ? '#b53324' : '#c9705e');
      ctx.fillStyle = mg;
      ctx.beginPath(); ctx.arc(th.x, th.y, R, 0, Math.PI * 2); ctx.fill();
      circle(th.x - R * 0.35, th.y - R * 0.2, R * 0.2, '#ffffff', a); // 눈
      circle(th.x - R * 0.3, th.y - R * 0.2, R * 0.1, '#123', a);
      ctx.strokeStyle = '#5e1a10'; ctx.lineWidth = 1.6; // 입 (활성 시 뾰루퉁)
      ctx.beginPath(); ctx.arc(th.x + R * 0.15, th.y + R * 0.35, R * 0.18, armed ? Math.PI : 0.3, armed ? Math.PI * 2 : Math.PI - 0.3); ctx.stroke();
      if (armed && Math.sin(s.t * 10) > 0) glowCircle(th.x, th.y - R * 0.05, 2.6, '#ff2020', 10, a);
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
    // 🐋 고래 — 배경 레이어에서 유유히
    if (s.whale) {
      const w = s.whale;
      ctx.save(); ctx.translate(w.x, w.y + Math.sin(s.t * 1.5) * 4); ctx.scale(w.dir, 1);
      const flk = Math.sin(s.t * 3.5) * 0.3; // 꼬리 플루크
      ctx.fillStyle = '#5b8fae';
      ctx.save(); ctx.translate(-78, 0); ctx.rotate(flk);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-26, -24, -38, -14);
      ctx.quadraticCurveTo(-24, -2, -38, 12); ctx.quadraticCurveTo(-24, 22, 0, 4); ctx.closePath(); ctx.fill();
      ctx.restore();
      const wg = ctx.createLinearGradient(0, -45, 0, 45); // 몸통
      wg.addColorStop(0, '#9fcbe4'); wg.addColorStop(0.6, C.whale); wg.addColorStop(1, '#4a7a9c');
      ctx.fillStyle = wg;
      ctx.beginPath(); ctx.ellipse(0, 0, 85, 45, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(230,245,255,0.55)'; // 배 (그루브)
      ctx.beginPath(); ctx.ellipse(5, 22, 70, 20, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(90,130,160,0.4)'; ctx.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-50, 14 + i * 7); ctx.quadraticCurveTo(10, 22 + i * 7, 62, 12 + i * 7); ctx.stroke(); }
      ctx.fillStyle = '#4a7a9c'; // 가슴 지느러미
      ctx.save(); ctx.translate(10, 28); ctx.rotate(0.5 + Math.sin(s.t * 3) * 0.15);
      ctx.beginPath(); ctx.ellipse(0, 0, 24, 9, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      ctx.strokeStyle = '#12313f'; ctx.lineWidth = 2; ctx.lineCap = 'round'; // 웃는 눈 + 입
      ctx.beginPath(); ctx.arc(52, -12, 5, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(40, 10); ctx.quadraticCurveTo(60, 20, 76, 8); ctx.stroke();
      ctx.restore();
    }
    // 빛기둥 — 은은하게 일렁임
    for (const sh of SHAFTS) {
      const sway = Math.sin(s.t * 0.4 + sh.x) * 14;
      ctx.globalAlpha = 0.05 + Math.sin(s.t * 0.7 + sh.x) * 0.015;
      ctx.fillStyle = '#bfefff';
      ctx.beginPath();
      ctx.moveTo(sh.x + sway, 0); ctx.lineTo(sh.x + sh.w + sway, 0);
      ctx.lineTo(sh.x + sh.w + sh.tilt + sway, H); ctx.lineTo(sh.x + sh.tilt + sway, H);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.save();
    if (fx.shake > 0) ctx.translate(rand(-fx.shake, fx.shake), rand(-fx.shake, fx.shake));
    for (const st of stars) circle(st.x, (st.y + s.t * st.spd) % H, st.r, '#d7f0ff', st.a * (0.55 + 0.45 * Math.sin(s.t * 2 + st.tw))); // 마린 스노우 — 아래로 침강
    for (const g of s.goods) drawGood(g);
    for (const th of s.threats) drawThreat(th);
    if (s.magnet > 0 || s.rush > 0) {
      const mr = s.rush > 0 ? cfg.rush.magnetRadius : cfg.magnet.radius;
      circle(s.p.x, s.p.y, mr, C.magnet, 0.07);
    }
    if (s.rush > 0) circle(s.p.x, s.p.y, s.p.r + 11 + Math.sin(s.t * 12) * 3, C.boost2, 0.3);
    if (s.shield) { // 🛡 등껍질 실드 — 회전 대시 링
      ctx.strokeStyle = C.turtle; ctx.lineWidth = 2.5;
      ctx.globalAlpha = 0.65 + Math.sin(s.t * 6) * 0.2;
      ctx.setLineDash([8, 6]); ctx.lineDashOffset = -s.t * 40;
      ctx.beginPath(); ctx.arc(s.p.x, s.p.y, s.p.r + 15, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
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
    if (vign) { ctx.fillStyle = vign; ctx.fillRect(0, 0, W, H); } // 비네트
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
                     nearMiss: s.nearMiss, cause: s.cause, discovered: [...s.seen] });
    }
    draw();
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  return { stop: () => cancelAnimationFrame(raf), _s: s /* 헤드리스 테스트용 */ };
}
