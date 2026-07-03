// 엔티티 팩토리 + 파생 스탯 — plain object, 클래스 계층 없음 (boom 규약 계승)
export const PALETTE = {
  player: '#4a9df0', playerDark: '#2f7cc9',
  bot: '#ee5f5f', botDark: '#c74848',
  barrel: '#8a93a6', barrelDark: '#6d7488',
  square: '#f6c945', tri: '#f2924a', penta: '#a06ee8',
  grid: '#e3ded2', border: '#c9c2b0',
};

export const STAT_KEYS = ['regen', 'hp', 'body', 'bulletSpeed', 'pen', 'dmg', 'reload', 'speed'];
export const STAT_LABELS = {
  regen: '체력 회복', hp: '최대 체력', body: '몸통 피해', bulletSpeed: '탄속',
  pen: '탄 관통', dmg: '탄 피해', reload: '연사 속도', speed: '이동 속도',
};

export const SHAPE_DEFS = {
  square: { sides: 4, r: 16, color: PALETTE.square },
  tri: { sides: 3, r: 15, color: PALETTE.tri },
  penta: { sides: 5, r: 24, color: PALETTE.penta },
};

export const xpNeed = (level, cfg) => Math.round(cfg.level.xpBase * Math.pow(level, cfg.level.xpPow));

export function makeTank(cfg, x, y, { isBot = false, name = '', level = 1 } = {}) {
  const t = {
    kind: 'tank', x, y, vx: 0, vy: 0, angle: 0, isBot, name,
    level: 1, xp: 0, xpInto: 0, points: 0, kills: 0,
    stats: Object.fromEntries(STAT_KEYS.map((k) => [k, 0])),
    cls: 'basic', hp: 0, cooldown: 0, barrelIdx: 0, fireAnim: 0,
    invuln: cfg.combat.spawnInvuln, lastHitAt: -99, lastHitBy: null, dead: false,
    seed: Math.random() * 1000, // 봇 무빙 위상
  };
  t.level = Math.max(1, level);
  t.points = t.level - 1; // 봇 초기 레벨 — 포인트는 ai가 자동 분배
  refreshDerived(t, cfg);
  t.hp = t.maxHp;
  return t;
}

// 파생 스탯 재계산 — 스탯 분배/클래스 변경/레벨업 시 호출
export function refreshDerived(t, cfg, classes) {
  const s = cfg.stats, p = t.stats;
  const c = classes ? classes[t.cls] : { dmg: 1, bulletSpeed: 1, reload: 1 };
  t.maxHp = cfg.player.baseHp + s.hpPer * p.hp;
  t.regen = cfg.player.baseRegen + s.regenPer * p.regen;
  t.body = cfg.player.baseBody + s.bodyPer * p.body;
  t.bulletSpeed = (cfg.bullet.baseSpeed + s.bulletSpeedPer * p.bulletSpeed) * c.bulletSpeed;
  t.pen = cfg.bullet.basePen + s.penPer * p.pen;
  t.dmg = (cfg.bullet.baseDamage + s.dmgPer * p.dmg) * c.dmg;
  t.reload = cfg.bullet.baseReload * (1 - s.reloadPer * p.reload) * c.reload;
  t.speed = (cfg.player.baseSpeed + s.speedPer * p.speed) * (t.isBot ? cfg.bots.speedMul : 1);
  t.r = cfg.player.radius * (1 + (t.level - 1) * 0.012); // 레벨 따라 미세하게 커짐
}

// XP 획득 → 레벨업 처리. 획득한 레벨 수 반환
export function gainXp(t, amt, cfg, classes) {
  t.xp += amt;
  let ups = 0;
  if (t.level >= cfg.level.max) return 0;
  t.xpInto += amt;
  while (t.level < cfg.level.max && t.xpInto >= xpNeed(t.level, cfg)) {
    t.xpInto -= xpNeed(t.level, cfg);
    t.level++; t.points++; ups++;
  }
  if (ups) refreshDerived(t, cfg, classes);
  return ups;
}

export function applyStat(t, key, cfg, classes) {
  if (t.points <= 0 || t.stats[key] >= cfg.stats.maxPerStat) return false;
  t.stats[key]++; t.points--;
  const ratio = t.hp / t.maxHp;
  refreshDerived(t, cfg, classes);
  if (key === 'hp') t.hp = t.maxHp * ratio; // 최대체력 증가 시 비율 유지
  return true;
}

// 사격 — 성공 시 true. bullets 배열에 탄 추가 + 반동
export function fire(t, cfg, classes, bullets) {
  if (t.cooldown > 0) return false;
  const c = classes[t.cls];
  t.cooldown = t.reload;
  t.invuln = 0; // 발사하면 스폰 무적 해제 (공정성)
  t.fireAnim = 1;
  const list = c.alternate ? [c.barrels[t.barrelIdx++ % c.barrels.length]] : c.barrels;
  for (const b of list) {
    const a = t.angle + b.ang + (c.spread ? (Math.random() - 0.5) * 2 * c.spread : 0);
    const px = Math.cos(t.angle + Math.PI / 2), py = Math.sin(t.angle + Math.PI / 2);
    const x = t.x + Math.cos(a) * t.r * b.len + px * b.off * t.r;
    const y = t.y + Math.sin(a) * t.r * b.len + py * b.off * t.r;
    bullets.push({
      x, y, vx: Math.cos(a) * t.bulletSpeed, vy: Math.sin(a) * t.bulletSpeed,
      r: cfg.bullet.radius, dmg: t.dmg, hp: t.pen, from: t, life: cfg.bullet.life,
      color: t.isBot ? PALETTE.bot : PALETTE.player,
      dark: t.isBot ? PALETTE.botDark : PALETTE.playerDark,
    });
    t.vx -= Math.cos(a) * cfg.bullet.recoil; // 반동
    t.vy -= Math.sin(a) * cfg.bullet.recoil;
  }
  return true;
}

export function makeShape(cfg, x, y) {
  const w = Math.random();
  const kind = w < cfg.shapes.pentaWeight ? 'penta'
    : w < cfg.shapes.pentaWeight + cfg.shapes.triWeight ? 'tri' : 'square';
  const d = SHAPE_DEFS[kind];
  const hp = { square: cfg.shapes.squareHp, tri: cfg.shapes.triHp, penta: cfg.shapes.pentaHp }[kind];
  const xp = { square: cfg.shapes.squareXp, tri: cfg.shapes.triXp, penta: cfg.shapes.pentaXp }[kind];
  const a = Math.random() * Math.PI * 2;
  return {
    kind, x, y, r: d.r, sides: d.sides, color: d.color, hp, maxHp: hp, xp,
    rot: Math.random() * Math.PI * 2, rotSpd: (Math.random() - 0.5) * 0.6,
    vx: Math.cos(a) * cfg.shapes.drift, vy: Math.sin(a) * cfg.shapes.drift,
    lastHitBy: null,
  };
}
