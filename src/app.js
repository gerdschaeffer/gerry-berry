// App state machine (spec 001 §8.10, pinned M8b conventions): title, game and initials screens,
// mute and the highscore table. No DOM; storage is injected and any call to it may throw.
import { createGame } from "./engine/game.js?v=1";
import {
  MUTE_KEY,
  loadScores,
  saveScores,
  qualifies,
  insertScore,
} from "./scores.js?v=1";

const DIR_KEYS = new Map([
  ["ArrowUp", "up"],
  ["w", "up"],
  ["W", "up"],
  ["ArrowLeft", "left"],
  ["a", "left"],
  ["A", "left"],
  ["ArrowDown", "down"],
  ["s", "down"],
  ["S", "down"],
  ["ArrowRight", "right"],
  ["d", "right"],
  ["D", "right"],
]);
const CYCLE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const CHAR = /^[A-Za-z0-9]$/;

/**
 * @param {unknown} key a KeyboardEvent.key
 * @returns {string | null} the direction, or null
 */
export function keyToDir(key) {
  return (typeof key === "string" && DIR_KEYS.get(key)) || null;
}

/**
 * One tick's game input from the queued keys.
 * @param {string[]} keys
 * @returns {{ dir: string | undefined, pause: boolean }}
 */
export function keysToInput(keys) {
  /** @type {string | undefined} */
  let dir;
  for (const k of keys) dir = keyToDir(k) ?? dir;
  return { dir, pause: keys.some((k) => k === "p" || k === "P") };
}

/** @typedef {{ type: string, [k: string]: unknown }} Event */

/**
 * @param {{ seed: number, storage?: any, gameOptions?: any }} opts
 * @returns {{ step: (keys: unknown) => Event[], snapshot: () => any }}
 */
export function createApp(opts) {
  if (
    typeof opts !== "object" ||
    opts === null ||
    Object.getPrototypeOf(opts) !== Object.prototype
  )
    throw new TypeError("opts must be a plain object");
  const { seed, gameOptions } = opts;
  const storage = opts.storage ?? null;
  createGame(seed, gameOptions); // a bad seed or option fails here, not later in step
  let { scores, persistent } = loadScores(storage);
  const loaded = persistent; // a table that could not be read is never overwritten
  let muted = false;
  try {
    muted = storage.getItem(MUTE_KEY) === "1";
  } catch {
    // no storage or a failing read: not muted
  }
  let screen = "title";
  let qr = false; // the QR popup on the title screen
  /** @type {ReturnType<typeof createGame> | null} */
  let game = null;
  let score = 0; // the score being entered on the initials screen
  let chars = ["A", "A", "A"];
  let slot = 0;

  const toggleMute = () => {
    muted = !muted;
    try {
      storage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch {
      // a failed write changes nothing else
    }
    return { type: "muteChanged", muted };
  };

  /** @param {string[]} keys @returns {Event[]} */
  const title = (keys) => {
    /** @type {Event[]} */
    const ev = [];
    for (const k of keys) {
      if (qr) {
        qr = false; // any key closes the popup and does nothing else, nor do the rest of this tick's keys
        break;
      }
      if (k === "q" || k === "Q") qr = true;
      else if (k === "m" || k === "M") ev.push(toggleMute());
      else if (k === "Enter") {
        game = createGame(seed, gameOptions);
        screen = "game";
        break;
      }
    }
    return ev;
  };

  /** @param {string[]} keys @returns {Event[]} */
  const play = (keys) => {
    const g = /** @type {ReturnType<typeof createGame>} */ (game);
    const mutes = keys
      .filter((k) => k === "m" || k === "M")
      .map(() => toggleMute());
    const ev = g.step(keysToInput(keys)).concat(mutes);
    const s = /** @type {any} */ (g.snapshot());
    if (s.done) {
      game = null;
      if (qualifies(scores, s.score)) {
        screen = "initials";
        score = s.score;
        chars = ["A", "A", "A"];
        slot = 0;
      } else screen = "title";
    }
    return ev;
  };

  /** @param {string[]} keys @returns {Event[]} */
  const enter = (keys) => {
    for (const k of keys) {
      if (CHAR.test(k)) {
        chars[slot] = k.toUpperCase();
        slot = Math.min(2, slot + 1);
      } else if (k === "ArrowUp" || k === "ArrowDown") {
        const i = CYCLE.indexOf(chars[slot]) + (k === "ArrowUp" ? 1 : 35);
        chars[slot] = CYCLE[i % 36];
      } else if (k === "ArrowLeft" || k === "Backspace")
        slot = Math.max(0, slot - 1);
      else if (k === "ArrowRight") slot = Math.min(2, slot + 1);
      else if (k === "Enter") {
        if (slot < 2) slot += 1;
        else {
          scores = insertScore(scores, {
            initials: chars.join(""),
            score,
          }).scores;
          persistent = loaded && saveScores(storage, scores);
          screen = "title";
          break;
        }
      }
    }
    return [];
  };

  return {
    step(keys) {
      // Plain index reads only: a subclass, Proxy or getter must not run our code paths or throw out of step.
      /** @type {string[]} */
      const ks = [];
      try {
        const list = /** @type {unknown[]} */ (keys);
        const n = Array.isArray(list) ? Math.min(16, list.length) : 0;
        for (let i = 0; i < n; i++) {
          const k = list[i];
          if (typeof k === "string") ks.push(k);
        }
      } catch {
        ks.length = 0;
      }
      if (screen === "title") return title(ks);
      if (screen === "game") return play(ks);
      return enter(ks);
    },
    snapshot() {
      const best = scores.length ? scores[0].score : 0;
      const g = game && /** @type {any} */ (game.snapshot());
      return {
        screen,
        muted,
        qr,
        persistent,
        scores: scores.map((x) => ({ initials: x.initials, score: x.score })),
        high: Math.max(
          best,
          g ? g.score : 0,
          screen === "initials" ? score : 0,
        ),
        paused: g ? g.paused : false,
        game: g,
        initials: screen === "initials" ? { chars: chars.slice(), slot } : null,
      };
    },
  };
}
