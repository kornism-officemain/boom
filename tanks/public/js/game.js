// 플레이 씬 — 루프/스폰/충돌/점수/사망. 밸런스 숫자는 전부 config에서 온다.
import { input } from './input.js';
import { getClasses } from './classes.js';
import { makeTank, makeShape, refreshDerived, gainXp, applyStat, fire, STAT_KEYS, PALETTE } from './entities.js';
import { botThink, botSpendPoints, botName } from './ai.js';
import { makeFx, burst, floater, addShake, updateFx, drawFx } from './fx.js';
import { sfx } from './sfx.js';

const SHAPE_LABEL = { square: '사각형', tri: '삼각형', penta: '오각형' };

export function runGame(cfg, canvas, ui, onEnd, extras = {}) {
  const ctx = canvas.getContext('2d');
  const classes = getClasses(cfg);
  const W = cfg.world.size, VW = canvas.width, VH = canvas.height;

  const player = makeTank(cfg, W / 2, W / 2, { name: extras.myName || 'ME' });
  refreshDerived(player, cfg, classes);
  const st = {
    time: 0, timeScale: 1, player, bots: [], shapes: [], bullets: [],
    fx: makeFx(), botRespawn: [], cam: { x: 0, y: 0 },
    dying: -1, cause: '', over: false, classShown: false,
  };

  const rand = (a, b) => a + Math.random() * (b - a);
  const distSq = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

  function spawnShape() { // 항상 플레이어 300px 밖 — "내 잘못" 원칙
    for (let tries = 0; tries < 20; tries++) {
      const s = makeShape(cfg, rand(60, W - 60), rand(60, W - 60));
      if (distSq(s, player) < 300 ** 2) continue;
      st.shapes.push(s); return;
    }
  }

  function spawnBot() {
    const level = Math.min(Math.floor(cfg.bots.levelBase + st.time / cfg.bots.levelDiv), cfg.bots.levelCap);
    let x, y, tries = 0;
    do { x = rand(80, W - 80); y = rand(80, W - 80); }
    while (tries++ < 30 && (x - player.x) ** 2 + (y - player.y) ** 2 < cfg.bots.minSpawnDist ** 2);
    const bot = makeTank(cfg, x, y, { isBot: true, name: botName(), level });
    if (bot.level >= cfg.level.classAt) {
      const t2 = ['twin', 'sniper', 'mg', 'flank'];
      bot.cls = t2[Math.floor(Math.random() * t2.length)];
    }
    botSpendPoints(bot, cfg, classes);
    refreshDerived(bot, cfg, classes);
    bot.hp = bot.maxHp;
    st.bots.push(bot);
  }

  for (let i = 0; i < cfg.shapes.count; i++) spawnShape();
  for (let i = 0; i < cfg.bots.maxAlive; i++) spawnBot();

  // ── 스탯/클래스 UI 훅 ──
  function trySpendStat(idx) {
    if (player.dead) return;
    if (applyStat(player, STAT_KEYS[idx], cfg, classes)) { sfx.statup(); ui.renderStats(player, cfg); }
  }
  ui.setStatHandler(trySpendStat);

  function onLevelUps(ups) {
    if (!ups) return;
    sfx.levelup();
    floater(st.fx, player.x, player.y - player.r - 14, `Lv ${player.level}!`, PALETTE.playerDark);
    ui.renderStats(player, cfg);
    if (player.level >= cfg.level.classAt && player.cls === 'basic' && !st.classShown) {
      st.classShown = true;
      st.timeScale = 0.3; // 일시정지 대신 슬로우 — 긴장 유지
      ui.showClassModal(classes, (cls) => {
        if (cls) { player.cls = cls; refreshDerived(player, cfg, classes); sfx.classup(); }
        st.timeScale = 1;
      });
    }
  }

  function awardXp(killer, amt, x, y) {
    if (!killer || killer.dead || killer.kind !== 'tank') return;
    if (killer === player) {
      onLevelUps(gainXp(player, amt, cfg, classes));
      floater(st.fx, x, y, `+${amt}`, '#3a3f52');
    } else {
      gainXp(killer, amt, cfg, classes);
      if (killer.points > 0) { botSpendPoints(killer, cfg, classes); }
      if (killer.level >= cfg.level.classAt && killer.cls === 'basic') {
        const t2 = ['twin', 'sniper', 'mg', 'flank'];
        killer.cls = t2[Math.floor(Math.random() * t2.length)];
        refreshDerived(killer, cfg, classes);
      }
    }
  }

  function hurtTank(t, dmg, src) {
    if (t.invuln > 0 || t.dead) return;
    t.hp -= dmg;
    t.lastHitAt = st.time;
    t.lastHitBy = src;
    if (t === player) sfx.hurt(), addShake(st.fx, 5);
  }

  function moveTank(t, mx, my, dt) {
    const acc = cfg.player.accel * dt;
    t.vx += (mx * t.speed - t.vx) * Math.min(1, acc);
    t.vy += (my * t.speed - t.vy) * Math.min(1, acc);
    t.x = Math.max(t.r, Math.min(W - t.r, t.x + t.vx * dt));
    t.y = Math.max(t.r, Math.min(W - t.r, t.y + t.vy * dt));
  }

  // ── 업데이트 ──
  function update(dt) {
    st.time += dt;

    // 플레이어
    if (!player.dead) {
      const mv = input.moveVec();
      moveTank(player, mv.dx, mv.dy, dt);
      player.angle = Math.atan2(
        st.cam.y + input.mouse.y - player.y,
        st.cam.x + input.mouse.x - player.x
      );
      if (input.firing() && fire(player, cfg, classes, st.bullets)) sfx.shoot();
      for (const idx of input.takeStatKeys()) trySpendStat(idx);
    }

    // 봇
    for (const bot of st.bots) {
      const act = botThink(bot, st, cfg, st.time);
      moveTank(bot, act.mx, act.my, dt);
      bot.angle = act.aim;
      if (act.fire) fire(bot, cfg, classes, st.bullets);
    }

    // 타이머/재장전/회복
    for (const t of [player, ...st.bots]) {
      t.cooldown -= dt; t.invuln = Math.max(0, t.invuln - dt);
      t.fireAnim = Math.max(0, t.fireAnim - dt * 6);
      const fast = st.time - t.lastHitAt > cfg.combat.regenDelay;
      if (!t.dead) t.hp = Math.min(t.maxHp, t.hp + t.regen * (fast ? 1 : 0.2) * dt);
    }

    // 도형 드리프트
    for (const s of st.shapes) {
      s.x += s.vx * dt; s.y += s.vy * dt; s.rot += s.rotSpd * dt;
      if (s.x < s.r || s.x > W - s.r) s.vx *= -1, s.x = Math.max(s.r, Math.min(W - s.r, s.x));
      if (s.y < s.r || s.y > W - s.r) s.vy *= -1, s.y = Math.max(s.r, Math.min(W - s.r, s.y));
    }

    // 탄환
    for (const b of st.bullets) { b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; }
    st.bullets = st.bullets.filter((b) => b.life > 0 && b.hp > 0 && b.x > 0 && b.x < W && b.y > 0 && b.y < W);

    // 탄 vs 도형/탱크
    const tanks = [player, ...st.bots];
    for (const b of st.bullets) {
      for (const s of st.shapes) {
        if (s.hp <= 0 || b.hp <= 0) continue;
        if (distSq(b, s) < (b.r + s.r * 0.9) ** 2) {
          s.hp -= b.dmg; s.lastHitBy = b.from; b.hp -= cfg.bullet.hitCost;
        }
      }
      for (const t of tanks) {
        if (t === b.from || t.dead || b.hp <= 0) continue;
        if (b.from.isBot && t.isBot) continue; // 봇끼리 오사 없음 — 위협은 전부 플레이어를 향한다
        if (distSq(b, t) < (b.r + t.r) ** 2) {
          hurtTank(t, b.dmg, b.from); b.hp = 0;
          burst(st.fx, b.x, b.y, b.color, 4, 90);
        }
      }
    }
    st.bullets = st.bullets.filter((b) => b.hp > 0);

    // 몸통 충돌 — 탱크 vs 도형 (초당 피해)
    for (const t of tanks) {
      if (t.dead) continue;
      for (const s of st.shapes) {
        if (s.hp <= 0) continue;
        const rr = t.r + s.r * 0.9;
        if (distSq(t, s) < rr * rr) {
          s.hp -= t.body * dt; s.lastHitBy = t;
          if (t.invuln <= 0) { t.hp -= cfg.shapes.touchDmg * dt; t.lastHitAt = st.time; t.lastHitBy = s; }
          const a = Math.atan2(t.y - s.y, t.x - s.x);
          t.vx += Math.cos(a) * cfg.combat.bodyKnockback * dt * 4;
          t.vy += Math.sin(a) * cfg.combat.bodyKnockback * dt * 4;
        }
      }
    }
    // 탱크 vs 탱크 (플레이어 ↔ 봇만)
    for (const bot of st.bots) {
      if (bot.dead || player.dead) continue;
      const rr = player.r + bot.r;
      if (distSq(player, bot) < rr * rr) {
        if (bot.invuln <= 0) { bot.hp -= player.body * dt; bot.lastHitAt = st.time; bot.lastHitBy = player; }
        if (player.invuln <= 0) { player.hp -= bot.body * dt; player.lastHitAt = st.time; player.lastHitBy = bot; }
        const a = Math.atan2(player.y - bot.y, player.x - bot.x);
        const kb = cfg.combat.bodyKnockback * dt * 6;
        player.vx += Math.cos(a) * kb; player.vy += Math.sin(a) * kb;
        bot.vx -= Math.cos(a) * kb; bot.vy -= Math.sin(a) * kb;
      }
    }

    // 도형 사망 → XP + 즉시 보충 (총량 고정)
    st.shapes = st.shapes.filter((s) => {
      if (s.hp > 0) return true;
      burst(st.fx, s.x, s.y, s.color, s.sides * 3, 140);
      if (distSq(s, player) < 700 ** 2) sfx.shapeBreak(s.kind);
      awardXp(s.lastHitBy, s.xp, s.x, s.y - s.r);
      spawnShape();
      return false;
    });

    // 봇 사망
    st.bots = st.bots.filter((bot) => {
      if (bot.hp > 0) return true;
      burst(st.fx, bot.x, bot.y, PALETTE.bot, 22, 220);
      addShake(st.fx, 4);
      const xp = Math.round(cfg.bots.killXpBase + cfg.bots.killXpPerLv * bot.level);
      if (bot.lastHitBy === player) {
        player.kills++;
        sfx.kill();
        floater(st.fx, bot.x, bot.y - 20, `${bot.name} 격파! +${xp}`, PALETTE.botDark);
        onLevelUps(gainXp(player, xp, cfg, classes));
      }
      st.botRespawn.push(st.time + cfg.bots.respawnDelay);
      return false;
    });
    st.botRespawn = st.botRespawn.filter((at) => {
      if (st.time < at || st.bots.length >= cfg.bots.maxAlive) return st.time < at;
      spawnBot(); return false;
    });

    // 플레이어 사망 → 슬로모 연출 후 종료
    if (!player.dead && player.hp <= 0) {
      player.dead = true;
      st.dying = 1.5;
      st.timeScale = 0.25;
      const k = player.lastHitBy;
      st.cause = k ? (k.kind === 'tank' ? `${k.name} (Lv${k.level})의 공격` : `${SHAPE_LABEL[k.kind]}과 충돌`) : '???';
      burst(st.fx, player.x, player.y, PALETTE.player, 30, 260);
      addShake(st.fx, 12);
      sfx.death();
      ui.hideClassModal();
    }

    // 카메라
    st.cam.x = Math.max(0, Math.min(W - VW, player.x - VW / 2));
    st.cam.y = Math.max(0, Math.min(W - VH, player.y - VH / 2));

    updateFx(st.fx, dt);
    ui.updateHud(player, st, cfg);
  }

  // ── 렌더 ──
  function polyPath(x, y, r, sides, rot) {
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = rot + (i / sides) * Math.PI * 2;
      i ? ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
  }

  function drawHpBar(e, w) {
    if (e.hp >= e.maxHp - 0.5) return;
    const x = e.x - w / 2, y = e.y + e.r + 6;
    ctx.fillStyle = '#00000022'; ctx.fillRect(x, y, w, 5);
    ctx.fillStyle = e.hp / e.maxHp > 0.35 ? '#6fcf70' : '#ee5f5f';
    ctx.fillRect(x, y, w * Math.max(0, e.hp / e.maxHp), 5);
  }

  function drawTank(t) {
    ctx.globalAlpha = t.invuln > 0 ? 0.45 : 1;
    const c = classes[t.cls];
    for (const b of c.barrels) { // 포신 먼저 (몸통 밑)
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.rotate(t.angle + b.ang);
      ctx.translate(-t.fireAnim * 3, b.off * t.r);
      ctx.fillStyle = PALETTE.barrel;
      ctx.strokeStyle = PALETTE.barrelDark;
      ctx.lineWidth = 2;
      const w = t.r * b.w;
      ctx.beginPath(); ctx.rect(0, -w / 2, t.r * b.len, w); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = t.isBot ? PALETTE.bot : PALETTE.player;
    ctx.strokeStyle = t.isBot ? PALETTE.botDark : PALETTE.playerDark;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.globalAlpha = 1;
    if (t.isBot) {
      ctx.fillStyle = '#3a3f52'; ctx.textAlign = 'center'; ctx.font = 'bold 12px "Segoe UI", sans-serif';
      ctx.fillText(`${t.name} Lv${t.level}`, t.x, t.y - t.r - 10);
    }
    drawHpBar(t, t.r * 2.2);
  }

  function draw() {
    ctx.fillStyle = '#eee9dd'; // 월드 밖
    ctx.fillRect(0, 0, VW, VH);
    ctx.save();
    const shk = st.fx.shake;
    ctx.translate(-st.cam.x + (Math.random() - 0.5) * shk, -st.cam.y + (Math.random() - 0.5) * shk);

    ctx.fillStyle = '#f7f4ec'; ctx.fillRect(0, 0, W, W); // 월드 안
    ctx.strokeStyle = PALETTE.grid; ctx.lineWidth = 1;
    const g = cfg.world.gridStep;
    const x0 = Math.floor(st.cam.x / g) * g, y0 = Math.floor(st.cam.y / g) * g;
    ctx.beginPath();
    for (let x = x0; x <= st.cam.x + VW; x += g) { ctx.moveTo(x, st.cam.y); ctx.lineTo(x, st.cam.y + VH); }
    for (let y = y0; y <= st.cam.y + VH; y += g) { ctx.moveTo(st.cam.x, y); ctx.lineTo(st.cam.x + VW, y); }
    ctx.stroke();
    ctx.strokeStyle = PALETTE.border; ctx.lineWidth = 6; ctx.strokeRect(0, 0, W, W);

    const inView = (e, pad = 60) =>
      e.x > st.cam.x - pad && e.x < st.cam.x + VW + pad && e.y > st.cam.y - pad && e.y < st.cam.y + VH + pad;

    for (const s of st.shapes) {
      if (!inView(s)) continue;
      polyPath(s.x, s.y, s.r, s.sides, s.rot);
      ctx.fillStyle = s.color; ctx.fill();
      ctx.strokeStyle = '#00000026'; ctx.lineWidth = 3; ctx.stroke();
      drawHpBar(s, s.r * 1.8);
    }
    for (const b of st.bullets) {
      if (!inView(b, 20)) continue;
      ctx.fillStyle = b.color; ctx.strokeStyle = b.dark; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    for (const bot of st.bots) if (inView(bot)) drawTank(bot);
    if (!player.dead) drawTank(player);
    drawFx(st.fx, ctx);
    ctx.restore();

    // 미니맵 — 파랑 나, 빨강 봇, 보라 오각형
    const M = 124, mx = VW - M - 12, my = VH - M - 12, k = M / W;
    ctx.fillStyle = 'rgba(255,253,248,.82)'; ctx.fillRect(mx, my, M, M);
    ctx.strokeStyle = PALETTE.border; ctx.lineWidth = 2; ctx.strokeRect(mx, my, M, M);
    for (const s of st.shapes) if (s.kind === 'penta') {
      ctx.fillStyle = PALETTE.penta; ctx.fillRect(mx + s.x * k - 1.5, my + s.y * k - 1.5, 3, 3);
    }
    for (const b of st.bots) {
      ctx.fillStyle = PALETTE.bot;
      ctx.beginPath(); ctx.arc(mx + b.x * k, my + b.y * k, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    if (!player.dead) {
      ctx.fillStyle = PALETTE.player;
      ctx.beginPath(); ctx.arc(mx + player.x * k, my + player.y * k, 3.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ── 루프 ──
  let last = performance.now(), raf = 0;
  function loop(now) {
    const rawDt = Math.min((now - last) / 1000, 1 / 30); // dt 클램프 (프레임 독립)
    last = now;
    update(rawDt * st.timeScale);
    if (st.dying >= 0) {
      st.dying -= rawDt; // 사망 연출은 실시간 진행
      if (st.dying <= 0) {
        st.over = true;
        onEnd({
          score: Math.round(player.xp), level: player.level, kills: player.kills,
          survival: Math.round(st.time), cls: player.cls, cause: st.cause,
        });
        return;
      }
    }
    draw();
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);
  return () => cancelAnimationFrame(raf); // 강제 중단용
}
