// Highscore table (spec 001 §7.4, §8.10, pinned M8a conventions): parse, load, save, rank.
// Stored data is untrusted: every function reads entries only through tableOf and never throws.

/** @typedef {{ initials: string, score: number }} Entry */

export const SCORES_KEY = "maze-muncher.scores";
export const MUTE_KEY = "maze-muncher.muted";

const MAX_CHARS = 4096;
const MAX_ENTRIES = 10;
const INITIALS = /^[A-Z0-9]{3}$/;

/** @param {unknown} s */
const validScore = (s) =>
  Number.isSafeInteger(s) &&
  0 <= /** @type {number} */ (s) &&
  /** @type {number} */ (s) <= 9999999;

/** @param {unknown} o */
const isPlain = (o) =>
  typeof o === "object" &&
  o !== null &&
  Object.getPrototypeOf(o) === Object.prototype;

/**
 * Valid entries of `arr` rebuilt as new literals, stably sorted by score descending, capped at 10.
 * @param {unknown} arr
 * @returns {Entry[]}
 */
function tableOf(arr) {
  /** @type {Entry[]} */
  const out = [];
  try {
    if (!Array.isArray(arr)) return [];
    const n = Math.min(arr.length, MAX_CHARS);
    for (let i = 0; i < n; i++) {
      try {
        if (!Object.hasOwn(arr, i)) continue;
        const e = arr[i];
        if (
          !isPlain(e) ||
          !Object.hasOwn(e, "initials") ||
          !Object.hasOwn(e, "score")
        )
          continue;
        const initials = e.initials;
        const score = e.score;
        if (
          typeof initials === "string" &&
          INITIALS.test(initials) &&
          validScore(score)
        ) {
          out.push({ initials, score });
        }
      } catch {
        // an element whose reads throw is dropped
      }
    }
  } catch {
    return [];
  }
  return out.sort((a, b) => b.score - a.score).slice(0, MAX_ENTRIES);
}

/** @param {unknown} raw @returns {Entry[]} */
export function parseScores(raw) {
  if (typeof raw !== "string" || raw.length > MAX_CHARS) return [];
  let top;
  try {
    top = JSON.parse(raw);
  } catch {
    return [];
  }
  if (
    !isPlain(top) ||
    !Object.hasOwn(top, "v") ||
    top.v !== 1 ||
    !Object.hasOwn(top, "scores")
  ) {
    return [];
  }
  return tableOf(top.scores);
}

/** @param {any} storage @returns {{ scores: Entry[], persistent: boolean }} */
export function loadScores(storage) {
  let raw;
  try {
    if (typeof storage !== "object" || storage === null)
      throw new Error("no storage");
    raw = storage.getItem(SCORES_KEY);
  } catch {
    return { scores: [], persistent: false };
  }
  return { scores: raw === null ? [] : parseScores(raw), persistent: true };
}

/** @param {any} storage @param {unknown} scores @returns {boolean} */
export function saveScores(storage, scores) {
  try {
    if (typeof storage !== "object" || storage === null) return false;
    storage.setItem(
      SCORES_KEY,
      JSON.stringify({ v: 1, scores: tableOf(scores) }),
    );
    return true;
  } catch {
    return false;
  }
}

/** @param {unknown} scores @param {unknown} s @returns {boolean} */
export function qualifies(scores, s) {
  if (!validScore(s) || s === 0) return false;
  const t = tableOf(scores);
  return (
    t.length < MAX_ENTRIES ||
    /** @type {number} */ (s) > t[MAX_ENTRIES - 1].score
  );
}

/** @param {unknown} scores @param {unknown} entry @returns {{ scores: Entry[], rank: number }} */
export function insertScore(scores, entry) {
  const t = tableOf(scores);
  const [e] = tableOf([entry]);
  if (!e) return { scores: t, rank: -1 };
  let rank = t.findIndex((x) => x.score < e.score);
  if (rank < 0) rank = t.length;
  if (rank >= MAX_ENTRIES) return { scores: t, rank: -1 };
  t.splice(rank, 0, e);
  return { scores: t.slice(0, MAX_ENTRIES), rank };
}
