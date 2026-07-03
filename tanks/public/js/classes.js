// 클래스 정의 — 포신 구조(모양)는 여기, 배율 계수는 config.classes (관리자 콘솔에서 튜닝)
// barrel: ang(포신 방향 오프셋 rad), off(측면 오프셋, 반지름 배수), len(길이 배수), w(폭 배수)
export function getClasses(cfg) {
  const c = cfg.classes;
  return {
    basic: { label: '기본', desc: '균형형 단포신', dmg: 1, bulletSpeed: 1, reload: 1, spread: 0,
      barrels: [{ ang: 0, off: 0, len: 1.7, w: 0.62 }] },
    twin: { label: '트윈', desc: '2연장 교차 발사 — 탄막', dmg: c.twinDmg, bulletSpeed: 1, reload: c.twinCycle, spread: 0, alternate: true,
      barrels: [{ ang: 0, off: 0.52, len: 1.55, w: 0.5 }, { ang: 0, off: -0.52, len: 1.55, w: 0.5 }] },
    sniper: { label: '스나이퍼', desc: '한 방이 굵고 빠르다 — 느린 연사', dmg: c.sniperDmg, bulletSpeed: c.sniperSpeed, reload: c.sniperReload, spread: 0,
      barrels: [{ ang: 0, off: 0, len: 2.2, w: 0.52 }] },
    mg: { label: '머신건', desc: '퍼지는 속사 — 근접 제압', dmg: c.mgDmg, bulletSpeed: 1, reload: c.mgReload, spread: c.mgSpread,
      barrels: [{ ang: 0, off: 0, len: 1.45, w: 0.85 }] },
    flank: { label: '플랭크', desc: '앞뒤 동시 발사 — 후방 견제', dmg: 1, bulletSpeed: 1, reload: 1, spread: 0,
      barrels: [{ ang: 0, off: 0, len: 1.7, w: 0.62 }, { ang: Math.PI, off: 0, len: 1.35, w: 0.55 }] },
  };
}

export const TIER2 = ['twin', 'sniper', 'mg', 'flank'];
