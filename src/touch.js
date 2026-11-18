// Touch gestures as pure logic (no DOM): swipes become arrow keys, short still touches are taps.

/** @returns {{ down: (x: number, y: number, t: number) => void, move: (x: number, y: number) => string | null, up: (x: number, y: number, t: number) => boolean }} */
export function createTouch() {
  /** @type {{ x0: number, y0: number, t0: number, ax: number, ay: number, swiped: boolean } | null} */
  let cur = null;
  return {
    down(x, y, t) {
      cur = { x0: x, y0: y, t0: t, ax: x, ay: y, swiped: false };
    },
    move(x, y) {
      if (!cur) return null;
      const dx = x - cur.ax;
      const dy = y - cur.ay;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return null;
      // re-anchor so a finger held down can swipe again to turn
      cur.ax = x;
      cur.ay = y;
      cur.swiped = true;
      if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "ArrowRight" : "ArrowLeft";
      return dy > 0 ? "ArrowDown" : "ArrowUp";
    },
    up(x, y, t) {
      const c = cur;
      cur = null;
      return (
        !!c &&
        !c.swiped &&
        Math.abs(x - c.x0) < 10 &&
        Math.abs(y - c.y0) < 10 &&
        t - c.t0 < 300
      );
    },
  };
}

/**
 * The key a tap stands for. `yFrac` is the tap's y as a fraction of the canvas height.
 * @param {string} screen @param {number} yFrac
 */
export function tapKey(screen, yFrac) {
  if (screen === "game") return "p";
  // the INVITE OTHERS: TAP HERE FOR QR CODE line sits at y 44 of 288
  if (screen === "title" && yFrac >= 0.12 && yFrac < 0.19) return "q";
  // the SOUND ON/OFF line sits at y 272 of 288
  if (screen === "title" && yFrac >= 0.89 && yFrac <= 1) return "m";
  return "Enter";
}
