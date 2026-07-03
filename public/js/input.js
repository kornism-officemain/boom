// 듀얼 입력 통합 — 게임은 input.getMove()만 호출한다.
// 마우스/터치 추종이 기본, 키보드(화살표/WASD)가 눌리면 키보드 우선.
export const input = {
  keys: new Set(),
  mouse: { x: 480, y: 300, seen: false },
  _lastKeyAt: -1,
  _lastMouseAt: -1,

  init(canvas) {
    const toLocal = (cx, cy) => {
      const r = canvas.getBoundingClientRect();
      return {
        x: (cx - r.left) * (canvas.width / r.width),
        y: (cy - r.top) * (canvas.height / r.height),
      };
    };
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD'].includes(e.code)) {
        e.preventDefault();
        this.keys.add(e.code);
        this._lastKeyAt = performance.now();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    canvas.addEventListener('mousemove', (e) => {
      Object.assign(this.mouse, toLocal(e.clientX, e.clientY), { seen: true });
      this._lastMouseAt = performance.now();
    });
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const t = e.touches[0];
      Object.assign(this.mouse, toLocal(t.clientX, t.clientY), { seen: true });
      this._lastMouseAt = performance.now();
    }, { passive: false });
  },

  // 반환: { mode: 'key'|'mouse'|'none', dx, dy(정규화 방향) 또는 tx, ty(목표점) }
  getMove() {
    const k = this.keys;
    let dx = 0, dy = 0;
    if (k.has('ArrowLeft') || k.has('KeyA')) dx -= 1;
    if (k.has('ArrowRight') || k.has('KeyD')) dx += 1;
    if (k.has('ArrowUp') || k.has('KeyW')) dy -= 1;
    if (k.has('ArrowDown') || k.has('KeyS')) dy += 1;
    const keyActive = (dx || dy);
    const keyRecent = this._lastKeyAt >= this._lastMouseAt;

    if (keyActive && (keyRecent || !this.mouse.seen)) {
      const len = Math.hypot(dx, dy) || 1;
      return { mode: 'key', dx: dx / len, dy: dy / len };
    }
    if (this.mouse.seen) return { mode: 'mouse', tx: this.mouse.x, ty: this.mouse.y };
    return { mode: 'none' };
  },
};
