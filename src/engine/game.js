// The game engine (spec 001 §8.2): the state machine (ready, playing, dying, levelComplete,
// gameOver), player movement and eating, four ghosts, the scatter/chase schedule, forced
// reversals, ghost speeds, the ghost house, Elroy, fright, eaten ghosts, fruit, lives and pause.

import shippedMaze from "../maze.js";
import {
  EXTRA_LIFE_SCORE,
  EYES_PCT,
  advance,
  levelSpec,
  mulberry32,
} from "./rules.js";
import {
  DIRS,
  REVERSE,
  chooseDir,
  frightDir,
  playerStep,
  targetTile,
} from "./actors.js";
import { newHouse, releaseStep, restartHouse } from "./house.js";

const MAX_SCORE = 9999999;
const ROLES = ["chaser", "ambusher", "flanker", "wanderer"];
/** @type {Record<string, string>} */
const BOB = { ambusher: "down", flanker: "up", wanderer: "up" };

/**
 * @typedef {{ type: string, [key: string]: unknown }} Event
 * @typedef {{ x: number, y: number }} Pt
 * @typedef {{ rows: string[], playerStart: { x: number, y: number },
 *   house: { door: number[][], exit: Pt, centre: Pt, slots: Record<string, Pt> }, tunnel: { y: number, left: number, right: number },
 *   fruit: { x: number, y: number, tiles: number[][] }, noUpTurn?: number[][] }} Maze
 * @typedef {{ role: string, x: number, y: number, dir: string, nextDir: string, acc: number,
 *   state: string, frightened: boolean, reversePending: boolean, exitRight: boolean, bobDir: string,
 *   elroy: number }} Ghost
 */

/**
 * Creates a deterministic game.
 * @param {number} seed
 * @param {{ maze?: Maze, startLevel?: number, ghosts?: string[], rng?: (seed: number) => () => number }} [options]
 * @returns {{ step: (input?: { dir?: unknown, pause?: unknown }) => Event[], snapshot: () => Record<string, unknown> }}
 */
export function createGame(seed, options) {
  const proto =
    typeof options === "object" && options !== null
      ? Object.getPrototypeOf(options)
      : undefined;
  if (options !== undefined && proto !== Object.prototype && proto !== null)
    throw new TypeError("options must be a plain object");
  const o = options ?? {};
  if (o.rng !== undefined && typeof o.rng !== "function")
    throw new TypeError("rng must be a function");
  if (!Number.isInteger(seed) || seed < 0 || seed >= 2 ** 32)
    throw new TypeError("seed must be an integer in [0, 2^32)");
  if (
    o.startLevel !== undefined &&
    !(Number.isInteger(o.startLevel) && o.startLevel >= 1)
  )
    throw new RangeError("startLevel must be an integer >= 1");
  // Copy the indexed elements: an array subclass may override its iterator, and holes (also inherited indices) must show up.
  const given = o.ghosts;
  const wanted = Array.isArray(given)
    ? Array.from({ length: given.length }, (_, i) =>
        Object.hasOwn(given, i) ? given[i] : undefined,
      )
    : given === undefined
      ? ROLES
      : null;
  if (
    !wanted ||
    new Set(wanted).size !== wanted.length ||
    !wanted.every((r) => ROLES.includes(/** @type {string} */ (r)))
  )
    throw new TypeError("ghosts must be distinct role names");
  const maze = o.maze ?? shippedMaze;
  const makeRng = o.rng ?? mulberry32;
  let level = o.startLevel ?? 1;
  let spec = levelSpec(level);

  /** @returns {Ghost[]} */
  const makeGhosts = () =>
    ROLES.filter((r) => wanted.includes(r)).map((role) => {
      const chaser = role === "chaser";
      const at = chaser ? maze.house.exit : maze.house.slots[role];
      const dir = chaser ? "left" : BOB[role];
      return {
        role,
        x: at.x,
        y: at.y,
        dir,
        nextDir: dir,
        acc: 0,
        state: chaser ? "active" : "waiting",
        frightened: false,
        reversePending: false,
        exitRight: false,
        bobDir: dir,
        elroy: 0,
      };
    });

  /** The actor reset shared by game start, life restart and new level (§8.2 M5 pin). */
  const actors = () => ({
    player: {
      x: maze.playerStart.x,
      y: maze.playerStart.y,
      dir: "left",
      moving: true,
    },
    /** @type {string | null} */
    want: null,
    acc: 0,
    pause: 0,
    mode: "scatter",
    modeIndex: 0,
    modeTicks: 0,
    frightTicks: 0,
    chain: 200,
    eatFreeze: 0,
    /** @type {{ x: number, y: number, points: number, ticksLeft: number } | null} */
    popup: null,
    /** @type {{ x: number, y: number, name: string, points: number, ticksLeft: number } | null} */
    fruit: null,
    eaten: "",
    ghosts: makeGhosts(),
    rng: makeRng(seed),
  });

  const s = {
    ...actors(),
    tick: 0,
    state: "ready",
    stateTicks: 0,
    done: false,
    paused: false,
    firstReady: true,
    newLevel: true,
    score: 0,
    lives: 3,
    extraGiven: false,
    dotsEaten: 0,
    rows: Array.from(maze.rows),
    house: newHouse(),
    elroySuspended: false,
  };
  const W = s.rows[0].length;
  const H = s.rows.length;
  const countDots = () => s.rows.join("").replace(/[^.o]/g, "").length;
  let dotsRemaining = countDots();

  /** Every score change goes through here: cap, then the one extra life (AC-56). @param {number} points @param {Event[]} ev */
  function addScore(points, ev) {
    s.score = Math.min(MAX_SCORE, s.score + points);
    if (s.extraGiven || s.score < EXTRA_LIFE_SCORE) return;
    s.extraGiven = true;
    s.lives += 1;
    ev.push({ type: "extraLife", lives: s.lives });
  }

  /** @param {Event[]} ev */
  function movePlayer(ev) {
    if (s.pause > 0) {
      s.pause -= 1;
      return;
    }
    const a = advance(
      s.acc,
      s.frightTicks > 0 ? spec.playerFrightPct : spec.playerPct,
    );
    s.acc = a.acc;
    for (let i = 0; i < a.px; i++) {
      s.player = playerStep(maze, s.player, s.want);
      const tx = Math.floor(s.player.x / 8);
      const ty = Math.floor(s.player.y / 8);
      const f = s.fruit;
      if (f && maze.fruit.tiles.some(([x, y]) => x === tx && y === ty)) {
        ev.push({ type: "fruitEaten", name: f.name, points: f.points });
        addScore(f.points, ev);
        s.popup = { x: f.x, y: f.y, points: f.points, ticksLeft: 120 };
        s.fruit = null;
      }
      const c = s.rows[ty][tx];
      if (c === "." || c === "o") {
        s.rows[ty] = s.rows[ty].slice(0, tx) + " " + s.rows[ty].slice(tx + 1);
        const dot = c === ".";
        s.dotsEaten += 1;
        dotsRemaining -= 1;
        s.pause = dot ? 1 : 3;
        ev.push({
          type: dot ? "dotEaten" : "energizerEaten",
          tx,
          ty,
          dotsRemaining,
        });
        addScore(dot ? 10 : 50, ev);
        if (s.dotsEaten === 70 || s.dotsEaten === 170) {
          const { name, points } = spec.bonus;
          const { x, y } = maze.fruit;
          s.fruit = { x, y, name, points, ticksLeft: 540 + (s.rng() % 61) };
          ev.push({ type: "fruitSpawned", name, points });
        }
        if (dotsRemaining === 0) {
          ev.push({ type: "levelComplete", level });
          s.state = "levelComplete";
          s.stateTicks = 0;
        }
        return; // the rest of this tick's pixel steps are dropped
      }
    }
  }

  /** @param {Event[]} ev */
  function scheduleStep(ev) {
    s.modeTicks += 1;
    if (s.modeTicks !== spec.schedule[s.modeIndex]) return;
    s.modeIndex += 1;
    s.modeTicks = 0;
    s.mode = s.mode === "scatter" ? "chase" : "scatter";
    for (const g of s.ghosts) {
      if (g.state === "active") g.reversePending = true;
      else if (g.state === "waiting" || g.state === "leaving")
        g.exitRight = true;
    }
    ev.push({ type: "modeChange", mode: s.mode });
  }

  /**
   * Decides `nextDir` for the tile ahead of `g` (§8.4).
   * @param {Ghost} g
   * @param {number} tx the ghost's tile
   * @param {number} ty
   */
  function decide(g, tx, ty) {
    const [dx, dy] = DIRS[g.dir];
    const nx = (((tx + dx) % W) + W) % W;
    const ny = ty + dy;
    if (g.frightened) {
      g.nextDir = frightDir(maze, nx, ny, g.dir, s.rng());
      return;
    }
    if (g.state === "eyes") {
      const [x, y] = maze.house.door[0];
      g.nextDir = chooseDir(maze, nx, ny, g.dir, { x, y: y - 1 }, false);
      return;
    }
    const p = s.player;
    const c = s.ghosts.find((x) => x.role === "chaser");
    const target = targetTile(g.role, {
      player: { tx: Math.floor(p.x / 8), ty: Math.floor(p.y / 8), dir: p.dir },
      chaser: c
        ? { tx: Math.floor(c.x / 8), ty: Math.floor(c.y / 8) }
        : { tx, ty },
      self: { tx, ty },
      mode: s.mode,
      elroy: c ? c.elroy : 0,
      width: W,
      height: H,
    });
    g.nextDir = chooseDir(maze, nx, ny, g.dir, target, true);
  }

  /** @param {Ghost} g @param {Event[]} ev */
  function moveGhost(g, ev) {
    const t = maze.tunnel;
    const tx0 = Math.floor(g.x / 8);
    const ty0 = Math.floor(g.y / 8);
    const inTunnel = ty0 === t.y && (tx0 <= t.left || tx0 >= t.right);
    const pct =
      g.state === "eyes" || g.state === "entering"
        ? EYES_PCT
        : g.state !== "active"
          ? g.frightened
            ? spec.ghostFrightPct
            : spec.ghostPct
          : inTunnel
            ? spec.tunnelPct
            : g.frightened
              ? spec.ghostFrightPct
              : g.elroy === 2
                ? spec.elroy2Pct
                : g.elroy === 1
                  ? spec.elroy1Pct
                  : spec.ghostPct;
    const a = advance(g.acc, pct);
    g.acc = a.acc;
    const { centre, exit, slots } = maze.house;
    for (let i = 0; i < a.px; i++) {
      if (g.state === "waiting") {
        g.y += DIRS[g.bobDir][1];
        const slot = slots[g.role];
        if (g.y === slot.y + 4) g.bobDir = "up";
        else if (g.y === slot.y - 4) g.bobDir = "down";
        continue;
      }
      if (g.state === "leaving") {
        // dir was set toward centre.y at release; at centre.y go across, then up
        if (g.y === centre.y)
          g.dir = g.x === centre.x ? "up" : g.x < centre.x ? "right" : "left";
        g.x += DIRS[g.dir][0];
        g.y += DIRS[g.dir][1];
        if (g.y === exit.y) {
          g.state = "active";
          g.dir = g.nextDir = g.exitRight ? "right" : "left";
          g.exitRight = false;
        }
        continue;
      }
      if (g.state === "entering") {
        const slot = g.role === "chaser" ? centre : slots[g.role];
        g.dir =
          g.y !== centre.y
            ? g.y < centre.y
              ? "down"
              : "up"
            : g.x < slot.x
              ? "right"
              : "left";
        g.x += DIRS[g.dir][0];
        g.y += DIRS[g.dir][1];
        if (g.y === centre.y && g.x === slot.x) {
          g.state = "leaving";
          g.frightened = false;
          ev.push({ type: "ghostRevived", role: g.role });
        }
        continue;
      }
      const before = Math.floor(g.x / 8);
      const beforeY = Math.floor(g.y / 8);
      const [dx, dy] = DIRS[g.dir];
      g.x = (((g.x + dx) % (W * 8)) + W * 8) % (W * 8);
      g.y += dy;
      if (g.state === "eyes" && g.x === exit.x && g.y === exit.y) {
        g.state = "entering";
        continue;
      }
      const tx = Math.floor(g.x / 8);
      const ty = Math.floor(g.y / 8);
      if (g.reversePending && (tx !== before || ty !== beforeY)) {
        g.reversePending = false;
        g.dir = REVERSE[g.dir];
        decide(g, tx, ty);
      } else if (g.x % 8 === 4 && g.y % 8 === 4) {
        g.dir = g.nextDir;
        decide(g, tx, ty);
      }
    }
  }

  /**
   * Collision check (AC-52): death by any non-frightened ghost on the player tile, else the first
   * frightened one in role order is eaten. Returns true when the tick ends.
   * @param {Event[]} ev
   */
  function collide(ev) {
    const tx = Math.floor(s.player.x / 8);
    const ty = Math.floor(s.player.y / 8);
    const hits = s.ghosts.filter(
      (g) =>
        g.state !== "eyes" &&
        g.state !== "entering" &&
        Math.floor(g.x / 8) === tx &&
        Math.floor(g.y / 8) === ty,
    );
    if (hits.length === 0) return false;
    const killer = hits.find((g) => !g.frightened);
    if (killer) {
      ev.push({ type: "playerCaught", role: killer.role });
      s.state = "dying";
      s.stateTicks = 0;
      return true;
    }
    const g = hits[0];
    const points = s.chain;
    s.chain *= 2;
    ev.push({ type: "ghostEaten", role: g.role, points });
    addScore(points, ev);
    s.popup = { x: g.x, y: g.y, points, ticksLeft: 60 };
    s.eatFreeze = 60;
    s.eaten = g.role;
    // eaten in the house: the eyes routing cannot leave it, so go back to the slot
    g.state =
      g.state === "waiting" || g.state === "leaving" ? "entering" : "eyes";
    g.frightened = false;
    g.reversePending = false;
    return true;
  }

  /** Fright effects of an energizer, applied at the end of its tick (§8.2 M4b). @param {Event[]} ev */
  function energize(ev) {
    for (const g of s.ghosts) {
      if (g.state === "active") g.reversePending = true;
      if (spec.frightTicks > 0 && g.state !== "eyes" && g.state !== "entering")
        g.frightened = true;
    }
    if (spec.frightTicks === 0) return;
    s.frightTicks = spec.frightTicks;
    s.chain = 200;
    ev.push({ type: "frightStart", ticks: spec.frightTicks });
  }

  /** Steps (2) to (9) of a playing tick that is not frozen. @param {string | null} dir @param {Event[]} ev */
  function playTick(dir, ev) {
    if (dir) s.want = dir;
    if (s.frightTicks > 0) {
      s.frightTicks -= 1;
      if (s.frightTicks === 0) {
        for (const g of s.ghosts) g.frightened = false;
        ev.push({ type: "frightEnd" });
      }
    } else scheduleStep(ev);
    movePlayer(ev);
    if (s.state !== "playing") return; // level complete ends the tick
    for (const g of s.ghosts) {
      const left = dotsRemaining;
      g.elroy =
        g.role !== "chaser" || g.state !== "active" || s.elroySuspended
          ? 0
          : left <= spec.elroy2Dots
            ? 2
            : left <= spec.elroy1Dots
              ? 1
              : 0;
    }
    if (collide(ev)) return;
    /** @type {Record<string, boolean>} */
    const waiting = {};
    for (const g of s.ghosts) waiting[g.role] = g.state === "waiting";
    const r = releaseStep(s.house, {
      dotEaten: ev.some(
        (e) => e.type === "dotEaten" || e.type === "energizerEaten",
      ),
      level,
      waiting,
    });
    s.house = r.h;
    const out = s.ghosts.find((g) => g.role === r.release);
    if (out) {
      out.state = "leaving";
      out.dir = out.y < maze.house.centre.y ? "down" : "up";
    }
    const w = s.ghosts.find((g) => g.role === "wanderer");
    if (w && (w.state === "leaving" || w.state === "active"))
      s.elroySuspended = false;
    for (const g of s.ghosts) moveGhost(g, ev);
    if (collide(ev)) return;
    // step (9): never in the tick that created the fruit or the popup
    const types = ev.map((e) => e.type);
    if (s.fruit && !types.includes("fruitSpawned")) {
      s.fruit.ticksLeft -= 1;
      if (s.fruit.ticksLeft === 0) {
        s.fruit = null;
        ev.push({ type: "fruitExpired" });
      }
    }
    if (s.popup && !types.includes("fruitEaten")) countPopup();
  }

  function countPopup() {
    if (s.popup && --s.popup.ticksLeft === 0) s.popup = null;
  }

  /** Life restart (`life` true) or next level (§8.2 M5 pin). @param {boolean} life */
  function restart(life) {
    Object.assign(s, actors(), { state: "ready", stateTicks: 0 });
    if (life) {
      s.house = restartHouse(s.house);
      s.elroySuspended = s.ghosts.some((g) => g.role === "wanderer");
      return;
    }
    level += 1;
    spec = levelSpec(level);
    s.rows = Array.from(maze.rows);
    s.dotsEaten = 0;
    dotsRemaining = countDots();
    s.house = newHouse();
    s.elroySuspended = false;
    s.newLevel = true;
  }

  return {
    step(input) {
      /** @type {Event[]} */
      const ev = [];
      if (s.done) return ev;
      /** @param {string} k */
      const own = (k) =>
        typeof input === "object" && input !== null && Object.hasOwn(input, k)
          ? /** @type {Record<string, unknown>} */ (input)[k]
          : undefined;
      if (s.state !== "gameOver" && own("pause") === true) {
        s.paused = !s.paused;
        return ev;
      }
      if (s.paused) return ev;
      const d = own("dir");
      const dir = typeof d === "string" && Object.hasOwn(DIRS, d) ? d : null;
      s.stateTicks += 1;
      if (s.state === "ready") {
        if (s.stateTicks === 1) {
          if (s.newLevel) ev.push({ type: "levelStart", level });
          ev.push({ type: "readyStart", first: s.firstReady });
          s.newLevel = false;
        }
        if (dir) s.want = dir;
        if (s.stateTicks === (s.firstReady ? 270 : 120)) {
          s.state = "playing";
          s.stateTicks = 0;
          s.firstReady = false;
          ev.push({ type: "playStart" });
        }
      } else if (s.state === "dying") {
        if (s.stateTicks === 60) ev.push({ type: "deathAnimStart" });
        if (s.stateTicks === 150) {
          s.lives -= 1;
          ev.push({ type: "lifeLost", lives: s.lives });
          if (s.lives > 0) restart(true);
          else {
            ev.push({ type: "gameOver", score: s.score });
            s.state = "gameOver";
            s.stateTicks = 0;
          }
        }
      } else if (s.state === "levelComplete") {
        if (s.stateTicks === 180) restart(false);
      } else if (s.state === "gameOver") {
        if (s.stateTicks === 180) s.done = true;
      } else if (s.eatFreeze > 0) {
        s.eatFreeze -= 1;
        countPopup();
        for (const g of s.ghosts)
          if (
            (g.state === "eyes" || g.state === "entering") &&
            g.role !== s.eaten
          )
            moveGhost(g, ev);
      } else {
        playTick(dir, ev);
        if (
          s.state === "playing" &&
          ev.some((e) => e.type === "energizerEaten")
        )
          energize(ev);
      }
      s.tick += 1;
      return ev;
    },
    snapshot() {
      const k = spec.flashes * 20 - s.frightTicks;
      return {
        tick: s.tick,
        state: s.state,
        stateTicks: s.stateTicks,
        done: s.done,
        paused: s.paused,
        level,
        score: s.score,
        lives: s.lives,
        dotsEaten: s.dotsEaten,
        dotsRemaining,
        maze: Array.from(s.rows),
        mode: s.mode,
        frightTicks: s.frightTicks,
        eatFreeze: s.eatFreeze,
        player: { ...s.player },
        ghosts: s.ghosts.map((g) => ({
          role: g.role,
          x: g.x,
          y: g.y,
          dir: g.dir,
          state: g.state,
          frightened: g.frightened,
          flashLight: g.frightened && k >= 0 && Math.floor(k / 10) % 2 === 0,
          elroy: g.elroy,
        })),
        fruit: s.fruit && { ...s.fruit },
        popup: s.popup && { ...s.popup },
      };
    },
  };
}
