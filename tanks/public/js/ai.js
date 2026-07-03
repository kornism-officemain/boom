// AI 봇 — 상태머신: 파밍 → 교전(시야 내 플레이어) → 도주(저체력)
import { STAT_KEYS, applyStat } from './entities.js';

const BOT_NAMES = ['REX', 'NOVA', 'BOLT', 'VIPER', 'TITAN', 'ECHO', 'ZED', 'MAX', 'IRIS', 'ONYX'];
export const botName = () => BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)] + '·' + Math.floor(Math.random() * 90 + 10);

// 스탯 자동 분배 우선순위 (공격형)
const BUILD = ['dmg', 'reload', 'hp', 'speed', 'pen', 'regen', 'bulletSpeed', 'body'];

export function botSpendPoints(bot, cfg, classes) {
  let guard = 64;
  while (bot.points > 0 && guard--) {
    let spent = false;
    for (const k of BUILD) {
      if (bot.points <= 0) break;
      if (applyStat(bot, k, cfg, classes)) spent = true;
    }
    if (!spent) break; // 전부 캡이면 종료
  }
}

// 반환: { mx, my(이동 방향), aim(라디안), fire(bool) }
export function botThink(bot, world, cfg, time) {
  const { player, shapes } = world;
  const b = cfg.bots;
  const dp = player && !player.dead ? Math.hypot(player.x - bot.x, player.y - bot.y) : Infinity;

  // 1) 도주 — 저체력 + 위협 근접
  if (bot.hp < bot.maxHp * b.fleeHpRatio && dp < b.viewRange) {
    const a = Math.atan2(bot.y - player.y, bot.x - player.x); // 반대 방향
    return { mx: Math.cos(a), my: Math.sin(a), aim: a + Math.PI, fire: true }; // 후퇴 사격
  }

  // 2) 교전 — 플레이어 시야 내 (스폰 무적 중엔 안 때림)
  if (dp < b.viewRange && player.invuln <= 0) {
    const lead = dp / bot.bulletSpeed; // 예측 조준
    const tx = player.x + player.vx * lead, ty = player.y + player.vy * lead;
    const aim = Math.atan2(ty - bot.y, tx - bot.x) + (Math.random() - 0.5) * 2 * b.aimError;
    const pref = b.viewRange * 0.55; // 선호 교전 거리
    const toward = Math.atan2(player.y - bot.y, player.x - bot.x);
    const radial = dp > pref ? 1 : -0.8; // 멀면 접근, 가까우면 이탈
    const strafe = Math.sin(time * 1.7 + bot.seed); // 좌우 무빙
    const mx = Math.cos(toward) * radial + Math.cos(toward + Math.PI / 2) * strafe;
    const my = Math.sin(toward) * radial + Math.sin(toward + Math.PI / 2) * strafe;
    const len = Math.hypot(mx, my) || 1;
    return { mx: mx / len, my: my / len, aim, fire: true };
  }

  // 3) 파밍 — 가성비(xp/거리) 좋은 도형으로
  let best = null, bestScore = -1;
  for (const s of shapes) {
    const d = Math.hypot(s.x - bot.x, s.y - bot.y);
    if (d > 900) continue;
    const v = s.xp / (d + 60);
    if (v > bestScore) { bestScore = v; best = s; }
  }
  if (best) {
    const aim = Math.atan2(best.y - bot.y, best.x - bot.x);
    const d = Math.hypot(best.x - bot.x, best.y - bot.y);
    return { mx: Math.cos(aim), my: Math.sin(aim), aim, fire: d < 420 };
  }
  // 근처에 아무것도 없음 — 월드 중앙 쪽으로
  const c = cfg.world.size / 2;
  const a = Math.atan2(c - bot.y, c - bot.x);
  return { mx: Math.cos(a), my: Math.sin(a), aim: a, fire: false };
}
