// Maze tile helpers and the validator of spec 001 §7.2.

const W = 28;
const H = 31;

/**
 * True for a tile the player may stand on (`.`, `o`, space).
 * @param {string | undefined} c
 * @returns {boolean}
 */
export const isPath = (c) => c === "." || c === "o" || c === " ";

/** The §7.1 values every shipped maze must carry (not `rows`, not `noUpTurn`). */
const META = {
  playerStart: { x: 112, y: 188 },
  house: {
    door: [
      [13, 12],
      [14, 12],
    ],
    exit: { x: 112, y: 92 },
    centre: { x: 112, y: 116 },
    slots: {
      ambusher: { x: 112, y: 116 },
      flanker: { x: 96, y: 116 },
      wanderer: { x: 128, y: 116 },
    },
  },
  fruit: {
    x: 112,
    y: 140,
    tiles: [
      [13, 17],
      [14, 17],
    ],
  },
  tunnel: { y: 14, left: 5, right: 22 },
};

const HOUSE = ["###--###", "#hhhhhh#", "#hhhhhh#", "#hhhhhh#", "########"];

/**
 * Deep equality of untrusted data `a` against plain data `b`; reads own keys only.
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
function same(a, b) {
  if (b === null || typeof b !== "object") return a === b;
  if (a === null || typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  // Object.keys ignores length, so an array with trailing holes needs its own check.
  if (Array.isArray(a) && a.length !== /** @type {unknown[]} */ (b).length)
    return false;
  const ra = /** @type {Record<string, unknown>} */ (a);
  const rb = /** @type {Record<string, unknown>} */ (b);
  const keys = Object.keys(rb);
  if (Object.keys(ra).length !== keys.length) return false;
  return keys.every((k) => Object.hasOwn(ra, k) && same(ra[k], rb[k]));
}

/**
 * Lists the first few tiles of a failing rule.
 * @param {string} code
 * @param {string} what
 * @param {number[][]} tiles
 * @returns {string}
 */
const report = (code, what, tiles) =>
  `${code}: ${what} at ${tiles
    .slice(0, 5)
    .map(([x, y]) => `(${x},${y})`)
    .join(" ")}${tiles.length > 5 ? ` and ${tiles.length - 5} more` : ""}`;

/**
 * Checks a maze object against every rule of spec §7.2. Never throws.
 * @param {unknown} maze
 * @returns {string[]} errors, each starting with its rule code; [] when valid
 */
export function validateMaze(maze) {
  if (maze === null || typeof maze !== "object" || Array.isArray(maze))
    return ["meta: not an object"];
  const m = /** @type {Record<string, unknown>} */ (maze);
  /** @type {string[]} */
  const errors = [];
  /** @param {string} k @returns {unknown} */
  const own = (k) => (Object.hasOwn(m, k) ? m[k] : undefined);

  for (const [k, want] of Object.entries(META))
    if (!same(own(k), want)) errors.push(`meta: ${k} differs from §7.1`);
  const rows = own("rows");
  if (!Array.isArray(rows)) errors.push("meta: rows is not an array");
  const nut = own("noUpTurn");
  if (!Array.isArray(nut)) errors.push("meta: noUpTurn is not an array");

  /** @type {string[] | null} */
  let g = null;
  if (Array.isArray(rows)) {
    if (
      rows.length === H &&
      // Array.from: `every` skips the holes of a sparse array
      Array.from(rows).every((r) => typeof r === "string" && r.length === W)
    )
      g = rows;
    else errors.push(`size: need ${H} rows of ${W} chars`);
  }
  const grid = g;
  /** @param {number} x @param {number} y @returns {boolean} */
  const walk = (x, y) =>
    grid !== null && y >= 0 && y < H && isPath(grid[y][((x % W) + W) % W]);

  if (grid) {
    /** @type {Record<string, number[][]>} */
    const bad = {
      chars: [],
      border: [],
      tunnel: [],
      symmetry: [],
      deadEnd: [],
    };
    /** @type {number[][]} */
    const energizers = [];
    /** @type {number[][]} */
    const paths = [];
    let dots = 0;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const c = grid[y][x];
        if (!"#.o-h ".includes(c)) bad.chars.push([x, y]);
        if ((y === 0 || y === H - 1 || x === 0 || x === W - 1) && y !== 14)
          if (c !== "#") bad.border.push([x, y]);
        if (y === 14 && (x <= 5 || x >= 22) && c !== " ")
          bad.tunnel.push([x, y]);
        if (c !== grid[y][W - 1 - x]) bad.symmetry.push([x, y]);
        if (c === "." || c === "o") dots++;
        if (c === "o") energizers.push([x, y]);
        if (isPath(c)) {
          paths.push([x, y]);
          const n = [
            walk(x, y - 1),
            walk(x - 1, y),
            walk(x, y + 1),
            walk(x + 1, y),
          ];
          if (n.filter(Boolean).length < 2) bad.deadEnd.push([x, y]);
        }
      }
    for (const [code, tiles] of Object.entries(bad))
      if (tiles.length) errors.push(report(code, "rule broken", tiles));

    if (!HOUSE.every((s, i) => grid[12 + i].slice(10, 18) === s))
      errors.push("house: rows 12-16, columns 10-17 differ from §7.2");
    const fixed = [
      [12, 11, " "],
      [13, 11, " "],
      [14, 11, " "],
      [15, 11, " "],
      [13, 10, "#"],
      [14, 10, "#"],
      [13, 23, " "],
      [14, 23, " "],
      [13, 17, " "],
      [14, 17, " "],
    ].filter(([x, y, c]) => grid[+y][+x] !== c);
    if (fixed.length)
      errors.push(
        report(
          "fixed",
          "wrong cell",
          fixed.map(([x, y]) => [+x, +y]),
        ),
      );
    if (dots !== 244)
      errors.push(`dots: ${dots} dots and energizers, need 244`);
    const quads = new Set(
      energizers
        .filter(([, y]) => y !== 15)
        .map(([x, y]) => `${x < 14}${y < 15}`),
    );
    if (energizers.length !== 4 || quads.size !== 4)
      errors.push("energizers: need exactly 4, one per quadrant");

    // Flood fill from the playerStart tile (14,23).
    const seen = new Set();
    const todo = walk(14, 23) ? [[14, 23]] : [];
    while (todo.length) {
      const [x, y] = /** @type {number[]} */ (todo.pop());
      if (seen.has(y * W + x)) continue;
      seen.add(y * W + x);
      for (const [dx, dy] of [
        [0, -1],
        [-1, 0],
        [0, 1],
        [1, 0],
      ])
        if (walk(x + dx, y + dy)) todo.push([(x + dx + W) % W, y + dy]);
    }
    const lost = paths.filter(([x, y]) => !seen.has(y * W + x));
    if (lost.length) errors.push(report("unreachable", "not reachable", lost));
  }

  if (Array.isArray(nut)) {
    const tiles = nut.filter(
      (t) =>
        Array.isArray(t) &&
        t.length === 2 &&
        t.every((v) => Number.isInteger(v) && v >= 0 && v < W),
    );
    // Shape first (§7.1): four [x, y] pairs; the rule below judges their values.
    if (nut.length !== 4 || tiles.length !== nut.length)
      errors.push("meta: noUpTurn is not four [x, y] tiles");
    const keys = new Set(tiles.map(([x, y]) => `${x},${y}`));
    const ok =
      nut.length === 4 &&
      tiles.length === 4 &&
      keys.size === 4 &&
      keys.has("12,11") &&
      keys.has("15,11") &&
      tiles.every(([x, y]) => keys.has(`${W - 1 - x},${y}`)) &&
      tiles.filter(([, y]) => y === 23).length === 2;
    if (!ok)
      errors.push(
        "noUpTurn: need 4 distinct mirrored tiles: (12,11), (15,11) and a pair in row 23",
      );
    else if (grid) {
      const weak = tiles.filter(
        ([x, y]) =>
          !walk(x, y) ||
          !walk(x, y - 1) ||
          [
            walk(x, y - 1),
            walk(x - 1, y),
            walk(x, y + 1),
            walk(x + 1, y),
          ].filter(Boolean).length < 3,
      );
      if (weak.length)
        errors.push(
          report("noUpTurn", "needs a path above and 3 path neighbours", weak),
        );
    }
  }
  return errors;
}
