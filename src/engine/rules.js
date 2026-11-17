// Game constants, the level table, the speed accumulator and the PRNG (spec 001 §5, §8.1).

export const TICK_HZ = 60,
  TILE = 8,
  EXTRA_LIFE_SCORE = 10000,
  EYES_PCT = 150;

// §5.2, one row per level 1..21: bonus name, points, PM, PF, G, GF, T,
// E1 dots, E1 pct, E2 dots, E2 pct, fright seconds, flashes.
/** @type {[string, ...number[]][]} */
const LEVELS = [
  ["acorn", 100, 80, 90, 75, 50, 40, 20, 80, 10, 85, 6, 5],
  ["mushroom", 300, 90, 95, 85, 55, 45, 30, 90, 15, 95, 5, 5],
  ["carrot", 500, 90, 95, 85, 55, 45, 40, 90, 20, 95, 4, 5],
  ["carrot", 500, 90, 95, 85, 55, 45, 40, 90, 20, 95, 3, 5],
  ["pear", 700, 100, 100, 95, 60, 50, 40, 100, 20, 105, 2, 5],
  ["pear", 700, 100, 100, 95, 60, 50, 50, 100, 25, 105, 5, 5],
  ["melon", 1000, 100, 100, 95, 60, 50, 50, 100, 25, 105, 2, 5],
  ["melon", 1000, 100, 100, 95, 60, 50, 50, 100, 25, 105, 2, 5],
  ["comet", 2000, 100, 100, 95, 60, 50, 60, 100, 30, 105, 1, 3],
  ["comet", 2000, 100, 100, 95, 60, 50, 60, 100, 30, 105, 5, 5],
  ["crown", 3000, 100, 100, 95, 60, 50, 60, 100, 30, 105, 2, 5],
  ["crown", 3000, 100, 100, 95, 60, 50, 80, 100, 40, 105, 1, 3],
  ["gem", 5000, 100, 100, 95, 60, 50, 80, 100, 40, 105, 1, 3],
  ["gem", 5000, 100, 100, 95, 60, 50, 80, 100, 40, 105, 3, 5],
  ["gem", 5000, 100, 100, 95, 60, 50, 100, 100, 50, 105, 1, 3],
  ["gem", 5000, 100, 100, 95, 60, 50, 100, 100, 50, 105, 1, 3],
  ["gem", 5000, 100, 100, 95, 60, 50, 100, 100, 50, 105, 0, 0],
  ["gem", 5000, 100, 100, 95, 60, 50, 100, 100, 50, 105, 1, 3],
  ["gem", 5000, 100, 100, 95, 60, 50, 120, 100, 60, 105, 0, 0],
  ["gem", 5000, 100, 100, 95, 60, 50, 120, 100, 60, 105, 0, 0],
  ["gem", 5000, 90, 90, 95, 60, 50, 120, 100, 60, 105, 0, 0],
];

/**
 * @typedef {{
 *   level: number, bonus: { name: string, points: number },
 *   playerPct: number, playerFrightPct: number, ghostPct: number, ghostFrightPct: number,
 *   tunnelPct: number, elroy1Dots: number, elroy1Pct: number, elroy2Dots: number,
 *   elroy2Pct: number, frightTicks: number, flashes: number, schedule: number[],
 *   houseLimits: { ambusher: number, flanker: number, wanderer: number },
 *   forceExitTicks: number }} LevelSpec
 */

/**
 * The tuning of level n (§5.2-5.4); levels above 21 reuse level 21. A fresh object per call.
 * @param {number} level integer >= 1
 * @returns {LevelSpec}
 */
export function levelSpec(level) {
  if (!Number.isInteger(level) || level < 1)
    throw new RangeError(`level must be an integer >= 1, got ${String(level)}`);
  const [name, ...v] = LEVELS[Math.min(level, 21) - 1];
  const [points, pm, pf, g, gf, t, e1d, e1p, e2d, e2p, fs, fl] = v;
  return {
    level,
    bonus: { name, points },
    playerPct: pm,
    playerFrightPct: pf,
    ghostPct: g,
    ghostFrightPct: gf,
    tunnelPct: t,
    elroy1Dots: e1d,
    elroy1Pct: e1p,
    elroy2Dots: e2d,
    elroy2Pct: e2p,
    frightTicks: fs * TICK_HZ,
    flashes: fl,
    schedule:
      level === 1
        ? [420, 1200, 420, 1200, 300, 1200, 300, Infinity]
        : level <= 4
          ? [420, 1200, 420, 1200, 300, 61980, 1, Infinity]
          : [300, 1200, 300, 1200, 300, 62220, 1, Infinity],
    houseLimits:
      level === 1
        ? { ambusher: 0, flanker: 30, wanderer: 60 }
        : level === 2
          ? { ambusher: 0, flanker: 0, wanderer: 50 }
          : { ambusher: 0, flanker: 0, wanderer: 0 },
    forceExitTicks: level <= 4 ? 240 : 180,
  };
}

/**
 * Speed accumulator of §5.1: whole pixels to move this tick at `pct` % speed.
 * @param {number} acc accumulator, integer in [0, 396)
 * @param {number} pct speed in percent
 * @returns {{ acc: number, px: number }}
 */
export function advance(acc, pct) {
  const sum = acc + 5 * pct;
  const px = Math.floor(sum / 396);
  return { acc: sum - 396 * px, px };
}

/**
 * Seeded PRNG, the normative reference of §8.1.
 * @param {number} seed
 * @returns {() => number} uint32 generator
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
}
