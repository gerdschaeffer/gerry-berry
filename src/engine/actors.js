// Player movement (spec 001 §8.3) and ghost decisions (§8.4): targets, chooseDir, frightDir.

import { isPath } from "./maze-tools.js?v=1";

/** @type {Record<string, [number, number]>} */
export const DIRS = {
  up: [0, -1],
  left: [-1, 0],
  down: [0, 1],
  right: [1, 0],
};

/** @type {Record<string, string>} */
export const REVERSE = { up: "down", left: "right", down: "up", right: "left" };

/**
 * True when tile (tx, ty) is walkable for the player and for ghost tile logic; x wraps, rows outside the grid are walls.
 * @param {string[]} rows
 * @param {number} tx
 * @param {number} ty
 * @returns {boolean}
 */
function walkable(rows, tx, ty) {
  const row = rows[ty];
  if (row === undefined) return false;
  return isPath(row[((tx % row.length) + row.length) % row.length]);
}

/**
 * One pixel step of the player, rules 1-3 of §8.3. Pure.
 * @param {{ rows: string[] }} maze
 * @param {{ x: number, y: number, dir: string, moving: boolean }} player
 * @param {string | null | undefined} want
 * @returns {{ x: number, y: number, dir: string, moving: boolean }}
 */
export function playerStep(maze, player, want) {
  const { rows } = maze;
  const { x, y } = player;
  const tx = Math.floor(x / 8);
  const ty = Math.floor(y / 8);
  const cx = tx * 8 + 4;
  const cy = ty * 8 + 4;
  let dir = player.dir;
  if (want && want !== dir && Object.hasOwn(DIRS, want)) {
    const [wx, wy] = DIRS[want];
    if (want === REVERSE[dir] || walkable(rows, tx + wx, ty + wy)) dir = want;
  }
  const [dx, dy] = DIRS[dir];
  let nx = x + dx;
  let ny = y + dy;
  if (dx !== 0) ny += Math.sign(cy - y);
  else nx += Math.sign(cx - x);
  // "Passes the centre": the forward coordinate ends beyond cx/cy in `dir`.
  const passes = dx !== 0 ? (nx - cx) * dx > 0 : (ny - cy) * dy > 0;
  if (passes && !walkable(rows, tx + dx, ty + dy))
    return { x, y, dir, moving: false };
  const w8 = rows[0].length * 8;
  return { x: ((nx % w8) + w8) % w8, y: ny, dir, moving: true };
}

/**
 * Target tile of a ghost role (§8.4, AC-30..AC-34); may lie off the grid.
 * @param {string} role chaser, ambusher, flanker or wanderer
 * @param {{ player: { tx: number, ty: number, dir: string }, chaser: { tx: number, ty: number },
 *   self: { tx: number, ty: number }, mode: string, elroy: number, width: number, height: number }} ctx
 * @returns {{ x: number, y: number }}
 */
export function targetTile(role, ctx) {
  const { player: p, width: w, height: h } = ctx;
  /** @type {Record<string, { x: number, y: number }>} */
  const corners = {
    chaser: { x: w - 3, y: -3 },
    ambusher: { x: 2, y: -3 },
    flanker: { x: w - 1, y: h + 1 },
    wanderer: { x: 0, y: h + 1 },
  };
  const home = { x: p.tx, y: p.ty };
  if (ctx.mode === "scatter" && !(role === "chaser" && ctx.elroy > 0))
    return corners[role];
  /** @param {number} n @returns {{ x: number, y: number }} */
  const ahead = (n) => {
    const [dx, dy] = DIRS[p.dir];
    // the overflow quirk: facing up also shifts left by n
    return { x: p.tx + n * dx - (p.dir === "up" ? n : 0), y: p.ty + n * dy };
  };
  if (role === "ambusher") return ahead(4);
  if (role === "flanker") {
    const v = ahead(2);
    return { x: 2 * v.x - ctx.chaser.tx, y: 2 * v.y - ctx.chaser.ty };
  }
  if (role === "wanderer") {
    const dx = ctx.self.tx - p.tx;
    const dy = ctx.self.ty - p.ty;
    return dx * dx + dy * dy >= 64 ? home : corners.wanderer;
  }
  return home;
}

/**
 * Direction a ghost takes out of tile (tx, ty) toward `target` (§8.4, AC-35).
 * @param {{ rows: string[], noUpTurn?: number[][] }} maze
 * @param {number} tx
 * @param {number} ty
 * @param {string} heading
 * @param {{ x: number, y: number }} target
 * @param {boolean} normalMode
 * @returns {string}
 */
export function chooseDir(maze, tx, ty, heading, target, normalMode) {
  const noUp =
    normalMode && (maze.noUpTurn ?? []).some(([x, y]) => x === tx && y === ty);
  let best = REVERSE[heading];
  let bestD = Infinity;
  for (const [dir, [dx, dy]] of Object.entries(DIRS)) {
    if (dir === REVERSE[heading] || (dir === "up" && noUp)) continue;
    if (!walkable(maze.rows, tx + dx, ty + dy)) continue;
    const d = (tx + dx - target.x) ** 2 + (ty + dy - target.y) ** 2;
    if (d < bestD) {
      best = dir;
      bestD = d;
    }
  }
  return best;
}

/**
 * Direction a frightened ghost takes out of tile (tx, ty) (§8.4, AC-48): the first walkable exit,
 * reverse excluded, cyclic from index r % 4 of [up, left, down, right]; none: the reverse. No noUpTurn rule.
 * @param {{ rows: string[] }} maze
 * @param {number} tx
 * @param {number} ty
 * @param {string} heading
 * @param {number} r a uint32 from the game's rng
 * @returns {string}
 */
export function frightDir(maze, tx, ty, heading, r) {
  const order = Object.keys(DIRS);
  for (let i = 0; i < 4; i++) {
    const dir = order[(r + i) % 4];
    const [dx, dy] = DIRS[dir];
    if (dir !== REVERSE[heading] && walkable(maze.rows, tx + dx, ty + dy))
      return dir;
  }
  return REVERSE[heading];
}
