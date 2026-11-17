// The shipped maze (spec 001 §7.1). DATA only: imports nothing.

/** @type {{ rows: string[], playerStart: { x: number, y: number }, house: { door: number[][], exit: { x: number, y: number }, centre: { x: number, y: number }, slots: Record<string, { x: number, y: number }> }, fruit: { x: number, y: number, tiles: number[][] }, tunnel: { y: number, left: number, right: number }, noUpTurn: number[][] }} */
export default {
  // An original layout drawn for this project: wide wall slabs on the sides,
  // a dotless ring around the house and long cross corridors in rows 1, 7, 20 and 29.
  rows: [
    "############################",
    "#..........................#",
    "#.#######.########.#######.#",
    "#o#######.########.#######o#",
    "#......##.########.##......#",
    "#.##.#.##.########.##.#.##.#",
    "#.##.#....########....#.##.#",
    "#....#................#....#",
    "######.##.##.##.##.##.######",
    "######.##.##.##.##.##.######",
    "######.##.##.##.##.##.######",
    "######                ######",
    "###### ## ###--### ## ######",
    "###### ## #hhhhhh# ## ######",
    "          #hhhhhh#          ",
    "###### ## #hhhhhh# ## ######",
    "###### ## ######## ## ######",
    "#.....                .....#",
    "#.#######.########.#######.#",
    "#.#######.########.#######.#",
    "#..........................#",
    "#.###.#.####.##.####.#.###.#",
    "#.###.#.####.##.####.#.###.#",
    "#o..#.#.            .#.#..o#",
    "###.#.####.######.####.#.###",
    "###.#.####.######.####.#.###",
    "#.....####........####.....#",
    "#.########.######.########.#",
    "#.########.######.########.#",
    "#..........................#",
    "############################",
  ],
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
  noUpTurn: [
    [12, 11],
    [15, 11],
    [12, 23],
    [15, 23],
  ],
};
