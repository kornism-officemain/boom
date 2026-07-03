// 입력 — WASD/화살표 이동, 마우스 조준, 클릭/스페이스 사격, 숫자키 1~8 스탯
export const input = {
  keys: new Set(),
  mouse: { x: 480, y: 300 },
  mouseDown: false,
  statQueue: [], // 숫자키로 누른 스탯 인덱스(0~7) — game이 소비

  init(canvas) {
    const toLocal = (cx, cy) => {
      const r = canvas.getBoundingClientRect();
      return {
        x: (cx - r.left) * (canvas.width / r.width),
        y: (cy - r.top) * (canvas.height / r.height),
      };
    };
    window.addEventListener('keydown', (e) => {
      if (e.target && e.target.tagName === 'INPUT') return; // 이름 입력 중엔 무시
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD','Space'].includes(e.code)) {
        e.preventDefault();
        this.keys.add(e.code);
      }
      if (e.code.startsWith('Digit')) {
        const n = Number(e.code.slice(5));
        if (n >= 1 && n <= 8) this.statQueue.push(n - 1);
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('mousemove', (e) => Object.assign(this.mouse, toLocal(e.clientX, e.clientY)));
    canvas.addEventListener('mousedown', (e) => { if (e.button === 0) this.mouseDown = true; });
    window.addEventListener('mouseup', () => { this.mouseDown = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  },

  moveVec() { // 정규화된 이동 방향
    const k = this.keys;
    let dx = 0, dy = 0;
    if (k.has('ArrowLeft') || k.has('KeyA')) dx -= 1;
    if (k.has('ArrowRight') || k.has('KeyD')) dx += 1;
    if (k.has('ArrowUp') || k.has('KeyW')) dy -= 1;
    if (k.has('ArrowDown') || k.has('KeyS')) dy += 1;
    const len = Math.hypot(dx, dy) || 1;
    return { dx: dx / len, dy: dy / len };
  },

  firing() { return this.mouseDown || this.keys.has('Space'); },
  takeStatKeys() { const q = this.statQueue; this.statQueue = []; return q; },
};
