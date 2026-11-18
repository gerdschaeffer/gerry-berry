// Canvas renderer (spec 001 §8.7, §8.8). Reads views only; every sprite is drawn in code.
import { levelSpec } from "./engine/rules.js";
import { QR } from "./qr.js";

/**
 * @typedef {{ role: string, x: number, y: number, dir: string, state: string,
 *   frightened: boolean, flashLight: boolean }} Drone
 * @typedef {{ tick: number, state: string, stateTicks: number, paused: boolean, level: number,
 *   score: number, lives: number, maze: string[], eatFreeze: number,
 *   player: { x: number, y: number, dir: string }, ghosts: Drone[],
 *   fruit: { x: number, y: number, name: string } | null,
 *   popup: { x: number, y: number, points: number } | null }} Snap
 * @typedef {{ screen: string, muted: boolean, persistent: boolean, scores: unknown[],
 *   paused: boolean, high: number, game: Snap | null,
 *   initials: { chars: string[], slot: number } | null, touch?: boolean, qr?: boolean }} View
 * @typedef {CanvasRenderingContext2D} Ctx
 */

const TAU = 2 * Math.PI;
const W = 224;
const H = 288;
const TOP = 24; // maze origin y
const BG = "#07060D";
const EDGE = "#D96CFF";
const FLASH = "#FFFFFF";
const GREEN = "#3DDC97";
const DARK = "#0B1020";
const TEXT = "#E8E6F0";
/** @type {Record<string, [number, number]>} */
const DIRV = { up: [0, -1], left: [-1, 0], down: [0, 1], right: [1, 0] };
/** @type {Record<string, string>} */
const ROLE = {
  chaser: "#2EC4B6",
  ambusher: "#F59E0B",
  flanker: "#B07CE8",
  wanderer: "#9BD13D",
};

/**
 * Integer scale for a 224 x 288 canvas in a cssW x cssH window (AC-63).
 * @param {number} cssW
 * @param {number} cssH
 * @param {number} dpr
 * @returns {number}
 */
export function computeScale(cssW, cssH, dpr) {
  const s = Math.floor(Math.min((cssW * dpr) / W, (cssH * dpr) / H));
  return Number.isFinite(s) ? Math.max(1, s) : 1;
}

/** @param {Ctx} ctx @param {number} x @param {number} y @param {number} r @param {string} c */
function disc(ctx, x, y, r, c) {
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

/** @param {Ctx} ctx @param {number} x @param {number} y @param {number} rx @param {number} ry @param {string} c */
function oval(ctx, x, y, rx, ry, c) {
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.fill();
}

/** Filled polygon of offsets from (x, y). @param {Ctx} ctx @param {number} x @param {number} y @param {string} c @param {number[][]} pts */
function poly(ctx, x, y, c, pts) {
  ctx.fillStyle = c;
  ctx.beginPath();
  pts.forEach(([dx, dy], i) =>
    i ? ctx.lineTo(x + dx, y + dy) : ctx.moveTo(x + dx, y + dy),
  );
  ctx.closePath();
  ctx.fill();
}

/** Filled half disc, flat side up when `a` is 0. @param {Ctx} ctx @param {number} x @param {number} y @param {number} r @param {number} a @param {string} c */
function half(ctx, x, y, r, a, c) {
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.arc(x, y, r, a, a + Math.PI);
  ctx.closePath();
  ctx.fill();
}

/** @param {Ctx} ctx @param {number} x @param {number} y @param {number} w @param {number} h @param {string} c */
function box(ctx, x, y, w, h, c) {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
}

/** The eight bonus shapes, centred on (x, y), about 12 px. @type {Record<string, (ctx: Ctx, x: number, y: number) => void>} */
const BONUS = {
  acorn(ctx, x, y) {
    disc(ctx, x, y + 1, 3.5, "#C68642");
    half(ctx, x, y - 1, 4.5, Math.PI, "#6B4226");
    box(ctx, x - 0.5, y - 6, 1, 2, "#6B4226");
  },
  mushroom(ctx, x, y) {
    box(ctx, x - 1.5, y, 3, 5, "#F2E3C6");
    half(ctx, x, y + 1, 5.5, Math.PI, "#E5484D");
    disc(ctx, x - 2, y - 2, 1, FLASH);
    disc(ctx, x + 2, y - 1.5, 1, FLASH);
  },
  carrot(ctx, x, y) {
    poly(ctx, x, y, "#3FA34D", [
      [-2, -3],
      [0, -7],
      [2, -3],
    ]);
    poly(ctx, x, y, "#FF7A1A", [
      [-3, -3],
      [3, -3],
      [0, 6],
    ]);
  },
  pear(ctx, x, y) {
    disc(ctx, x, y - 2, 2.5, "#D4E157");
    disc(ctx, x, y + 2, 4, "#D4E157");
    box(ctx, x - 0.5, y - 6, 1, 2, "#6B4226");
  },
  melon(ctx, x, y) {
    half(ctx, x, y - 2, 6, 0, "#2E7D32");
    half(ctx, x, y - 2, 4.5, 0, "#FF6B6B");
    box(ctx, x - 2, y, 1, 1, "#1A1A1A");
    box(ctx, x + 1, y, 1, 1, "#1A1A1A");
  },
  comet(ctx, x, y) {
    poly(ctx, x, y, "#7DD3FC", [
      [-6, 6],
      [0, -3],
      [3, 0],
    ]);
    disc(ctx, x + 2, y - 2, 3, "#FFF3B0");
  },
  crown(ctx, x, y) {
    poly(ctx, x, y, "#FFC93C", [
      [-5, 4],
      [-5, -3],
      [-2.5, 0],
      [0, -5],
      [2.5, 0],
      [5, -3],
      [5, 4],
    ]);
    disc(ctx, x, y + 1.5, 1, "#E5484D");
  },
  gem(ctx, x, y) {
    poly(ctx, x, y, "#60A5FA", [
      [-5, -2],
      [-2.5, -5],
      [2.5, -5],
      [5, -2],
      [0, 5],
    ]);
    poly(ctx, x, y, "#BFDBFE", [
      [-2.5, -5],
      [0, -2],
      [2.5, -5],
    ]);
  },
};

/** @param {Ctx} ctx @param {string} name @param {number} x @param {number} y */
function bonus(ctx, name, x, y) {
  if (Object.hasOwn(BONUS, name)) BONUS[name](ctx, x, y);
  else disc(ctx, x, y, 4, TEXT);
}

/** @param {Ctx} ctx @param {string} s @param {number} x @param {number} y @param {CanvasTextAlign} align @param {number} size @param {string} color @param {boolean} bold */
function text(ctx, s, x, y, align = "center", size = 8, color = TEXT, bold = false) {
  ctx.font = `${bold ? "bold " : ""}${size}px monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

/** The title, one rainbow colour per letter. @param {Ctx} ctx @param {number} y */
function drawTitleText(ctx, y) {
  const name = "GERRY BERRY";
  const cw = 14.4; // shortcut: monospace is 0.6 em wide at 24 px; a font that differs only spaces the letters unevenly
  let n = 0;
  [...name].forEach((ch, i) => {
    if (ch === " ") return;
    const x = 112 + (i - (name.length - 1) / 2) * cw;
    text(ctx, ch, x, y, "center", 24, `hsl(${36 * n++}, 100%, 60%)`);
  });
}

/** The QR code, m px per module on a white plate with a 3-module quiet zone, centred. @param {Ctx} ctx @param {number} y @param {number} m */
function drawQr(ctx, y, m = 2) {
  const size = (QR.length + 6) * m;
  const x = (W - size) / 2;
  box(ctx, x, y, size, size, FLASH);
  QR.forEach((row, ty) => {
    for (let tx = 0; tx < row.length; tx++)
      if (row[tx] === "#")
        box(ctx, x + 3 * m + tx * m, y + 3 * m + ty * m, m, m, BG);
  });
}

/** @param {Ctx} ctx @param {Snap} g */
function drawMaze(ctx, g) {
  const rows = g.maze;
  const st = g.stateTicks;
  const light =
    g.state === "levelComplete" &&
    st > 60 &&
    Math.floor((st - 61) / 15) % 2 === 0;
  const edge = light ? FLASH : EDGE;
  /** @param {number} tx @param {number} ty */
  const wall = (tx, ty) =>
    tx < 0 ||
    ty < 0 ||
    ty >= rows.length ||
    tx >= rows[ty].length ||
    rows[ty][tx] === "#";
  /** @param {string} c @param {(x: number, y: number, tx: number, ty: number) => void} fn */
  const each = (c, fn) =>
    rows.forEach((row, ty) => {
      for (let tx = 0; tx < row.length; tx++)
        if (row[tx] === c) fn(tx * 8, ty * 8 + TOP, tx, ty);
    });
  each("#", (x, y, tx, ty) => {
    box(ctx, x, y, 8, 8, "#1B1030");
    ctx.fillStyle = edge;
    if (!wall(tx, ty - 1)) ctx.fillRect(x, y, 8, 1);
    if (!wall(tx, ty + 1)) ctx.fillRect(x, y + 7, 8, 1);
    if (!wall(tx - 1, ty)) ctx.fillRect(x, y, 1, 8);
    if (!wall(tx + 1, ty)) ctx.fillRect(x + 7, y, 1, 8);
  });
  each("-", (x, y) => box(ctx, x, y + 3, 8, 2, "#9AE6B4"));
  each(".", (x, y) => box(ctx, x + 3, y + 3, 2, 2, "#7FFFD4"));
  if (g.state !== "playing" || Math.floor(g.tick / 10) % 2 === 0)
    each("o", (x, y) => disc(ctx, x + 4, y + 4, 3, "#7FFFD4"));
}

/** @param {Ctx} ctx @param {Snap} g */
function drawPlayer(ctx, g) {
  if (g.state === "gameOver" || g.eatFreeze > 0) return;
  const { x, dir } = g.player;
  const y = g.player.y + TOP;
  if (g.state === "dying" && g.stateTicks >= 60) {
    const r = (6 * (150 - g.stateTicks)) / 90;
    if (r > 0) disc(ctx, x, y, r, GREEN);
    return;
  }
  const [dx, dy] = DIRV[dir] ?? [0, 0];
  const across = dx !== 0;
  box(ctx, x - 3, y - 8, 1, 2, GREEN); // antennae
  box(ctx, x + 2, y - 8, 1, 2, GREEN);
  disc(ctx, x, y, 6, GREEN);
  const p = across ? x : g.player.y;
  const h = [0, 1, 2, 1][(((Math.floor(p / 2) % 4) + 4) % 4) | 0];
  if (h)
    oval(ctx, x + 3 * dx, y + 3 * dy, across ? h : 3, across ? 3 : h, DARK);
  const ex = across ? x + dx : x - 3;
  const ey = across ? y - 3 : y + dy;
  disc(ctx, ex, ey, 1.5, FLASH);
  disc(ctx, ex + 0.5 * dx, ey + 0.5 * dy, 0.75, DARK);
}

/** Drone body: 12 x 12 rounded square, corner r 3. @param {Ctx} ctx @param {number} x @param {number} y @param {string} c */
function body(ctx, x, y, c) {
  const l = x - 6;
  const t = y - 6;
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.moveTo(l + 3, t);
  ctx.arc(l + 9, t + 3, 3, -Math.PI / 2, 0);
  ctx.arc(l + 9, t + 9, 3, 0, Math.PI / 2);
  ctx.arc(l + 3, t + 9, 3, Math.PI / 2, Math.PI);
  ctx.arc(l + 3, t + 3, 3, Math.PI, 1.5 * Math.PI);
  ctx.closePath();
  ctx.fill();
}

/** @param {Ctx} ctx @param {Snap} g @param {Drone} d */
function drawDrone(ctx, g, d) {
  const x = d.x;
  const y = d.y + TOP;
  const [dx, dy] = DIRV[d.dir] ?? [0, 0];
  if (d.state !== "eyes" && d.state !== "entering") {
    const colour = d.frightened
      ? d.flashLight
        ? "#FF8FD0"
        : "#8A6F2A"
      : (ROLE[d.role] ?? TEXT);
    body(ctx, x, y, colour);
    const o = Math.floor(g.tick / 8) % 2;
    box(ctx, x - 5 + o, y + 6, 3, 1, colour); // foot bars
    box(ctx, x + 2 - o, y + 6, 3, 1, colour);
    if (d.frightened) {
      const f = d.flashLight ? "#2B0A3D" : "#101010";
      disc(ctx, x - 2.5, y - 1.5, 1, f);
      disc(ctx, x + 2.5, y - 1.5, 1, f);
      ctx.strokeStyle = f;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - 3, y + 2.5);
      ctx.lineTo(x + 3, y + 2.5);
      ctx.stroke();
      return;
    }
  }
  disc(ctx, x, y, 3, FLASH);
  disc(ctx, x + 1.5 * dx, y + 1.5 * dy, 1.5, DARK);
}

/** @param {Ctx} ctx @param {Snap} g */
function drawDrones(ctx, g) {
  const st = g.stateTicks;
  if (
    g.state === "gameOver" ||
    (g.state === "dying" && st >= 60) ||
    (g.state === "levelComplete" && st > 60)
  )
    return;
  const p = g.popup;
  for (const d of g.ghosts) {
    const eaten = d.state === "eyes" || d.state === "entering";
    if (eaten && p && g.eatFreeze > 0 && d.x === p.x && d.y === p.y) continue;
    drawDrone(ctx, g, d);
  }
}

/** @param {Ctx} ctx @param {Snap} g @param {number} high */
function drawHud(ctx, g, high) {
  text(ctx, "SCORE", 8, 6, "left");
  text(ctx, String(g.score), 8, 15, "left");
  text(ctx, "HIGH", 112, 6);
  text(ctx, String(high), 112, 15);
  const lives = Math.min(5, g.lives - 1);
  for (let i = 0; i < lives; i++) {
    ctx.save();
    disc(ctx, 12 + 14 * i, 280, 5, GREEN);
    ctx.restore();
  }
  for (let l = Math.max(1, g.level - 6); l <= g.level; l++) {
    ctx.save();
    bonus(ctx, levelSpec(l).bonus.name, 212 - 14 * (g.level - l), 280);
    ctx.restore();
  }
}

const SLOT_X = [96, 112, 128];

/**
 * The drawable rows of a score table: every field is read once into a local and the local is
 * validated (scores.js rules), so a getter that changes its value cannot get a bad string drawn.
 * @param {any} scores
 * @returns {string[]} at most 10 lines
 */
function rowsOf(scores) {
  /** @type {string[]} */
  const rows = [];
  try {
    const n = Array.isArray(scores) ? Math.min(100, scores.length) : 0;
    for (let i = 0; i < n && rows.length < 10; i++) {
      const e = scores[i];
      if (typeof e !== "object" || e === null) continue;
      const initials = e.initials;
      const score = e.score;
      if (
        typeof initials === "string" &&
        /^[A-Z0-9]{3}$/.test(initials) &&
        Number.isSafeInteger(score) &&
        score >= 0 &&
        score <= 9999999
      )
        rows.push(`${rows.length + 1}. ${initials} ${score}`);
    }
  } catch {
    // a hostile table draws the rows read so far
  }
  return rows;
}

/** Everything after the background. @param {Ctx} ctx @param {View} view */
function paint(ctx, view) {
  const g = view.game;
  if (view.screen === "title" || view.screen === "initials") {
    // Desktop also has the QR code under the scores (below), so its notice moves under SOUND.
    if (!view.persistent)
      text(
        ctx,
        "SCORES NOT SAVED",
        112,
        view.screen === "title" && !view.touch ? 281 : 264,
      );
  }
  if (view.screen === "title") {
    // Desktop packs everything above the scores tighter to leave room for the QR code.
    const L = view.touch
      ? { copy: 16, url: 28, how: 56, step: 12, title: 120, go: 164, scores: 184 }
      : { copy: 8, url: 18, how: 30, step: 10, title: 68, go: 90, scores: 102 };
    drawTitleText(ctx, L.title);
    text(ctx, view.touch ? "TAP TO START" : "PRESS ENTER", 112, L.go);
    text(ctx, "\u00a9 2026 GERD SCH\u00c4FFER", 112, L.copy);
    text(ctx, "GITHUB.COM/GERDSCHAEFFER/GERRY-BERRY", 112, L.url);
    // The empty band above the title: how to play on this device.
    (view.touch
      ? ["SWIPE ANYWHERE TO MOVE", "TAP TO PAUSE", "TAP SOUND LINE TO MUTE"]
      : ["ARROWS OR WASD TO MOVE", "P TO PAUSE", "M TO MUTE"]
    ).forEach((line, i) => text(ctx, line, 112, L.how + L.step * i));
    if (view.touch)
      text(ctx, "INVITE OTHERS: TAP HERE FOR QR CODE", 112, 44, "center", 8, GREEN, true);
    rowsOf(view.scores).forEach((row, i) =>
      text(ctx, row, 112, L.scores + 8 * i),
    );
    text(ctx, view.muted ? "SOUND OFF" : "SOUND ON", 112, 272);
    // Under the score list: a phone camera opens the game. Pointless on a phone itself.
    if (!view.touch) {
      text(ctx, "SCAN TO PLAY", 112, 186);
      drawQr(ctx, 194);
    }
    if (view.qr) {
      // The popup: a bigger code to scan from another phone; it covers everything drawn so far.
      box(ctx, 0, 0, W, H, BG);
      text(ctx, "SCAN TO PLAY", 112, 58);
      drawQr(ctx, 74, 4);
      text(ctx, view.touch ? "TAP TO CLOSE" : "PRESS ANY KEY", 112, 232);
    }
    return;
  }
  if (view.screen === "initials") {
    text(ctx, "ENTER YOUR INITIALS", 112, 120);
    if (view.touch) {
      text(ctx, "SWIPE TO PICK", 112, 190);
      text(ctx, "TAP TO CONFIRM", 112, 198);
    }
    const ini = view.initials;
    if (!ini) return;
    const chars = ini.chars ?? [];
    const slot = ini.slot;
    SLOT_X.forEach((x, i) => {
      const c = chars[i];
      if (typeof c === "string" && /^[A-Z0-9]$/.test(c)) text(ctx, c, x, 164);
    });
    const x = Number.isInteger(slot) ? SLOT_X[slot] : undefined;
    if (x !== undefined) box(ctx, x - 4, 171, 8, 1, EDGE);
    return;
  }
  if (!g) return;
  drawMaze(ctx, g);
  if (g.fruit && g.state !== "gameOver")
    bonus(ctx, g.fruit.name, g.fruit.x, g.fruit.y + TOP);
  drawPlayer(ctx, g);
  drawDrones(ctx, g);
  if (g.popup) text(ctx, String(g.popup.points), g.popup.x, g.popup.y + TOP);
  drawHud(ctx, g, view.high);
  const msg = view.paused
    ? "PAUSED"
    : g.state === "ready"
      ? "GET READY"
      : g.state === "gameOver"
        ? "GAME OVER"
        : "";
  if (msg) text(ctx, msg, 112, 164);
}

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {{ resize: (cssW: number, cssH: number, dpr: number) => void, draw: (view: View) => void }}
 */
export function createRenderer(canvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new TypeError("no 2d context");
  let s = 1;
  // The pin wants the background fillRect right after the smoothing write, so the state every
  // draw starts from is set at creation, after each resize (which resets a real context) and
  // after each draw; that also keeps repeated draws identical.
  const reset = () => {
    ctx.fillStyle = BG;
    ctx.strokeStyle = BG;
    ctx.lineWidth = 1;
    ctx.font = "8px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
  };
  reset();
  return {
    resize(cssW, cssH, dpr) {
      s = computeScale(cssW, cssH, dpr);
      canvas.width = W * s;
      canvas.height = H * s;
      // One canvas pixel = one device pixel, so CSS does not stretch the integer scale.
      const d = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
      canvas.style.width = `${(W * s) / d}px`;
      canvas.style.height = `${(H * s) / d}px`;
      reset();
    },
    draw(view) {
      ctx.setTransform(s, 0, 0, s, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.fillRect(0, 0, W, H);
      paint(ctx, view);
      reset();
    },
  };
}
