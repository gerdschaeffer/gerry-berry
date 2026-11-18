// Ghost house release counters (spec 001 §5.4, §8.5). Pure: new objects, arguments never mutated.

import { levelSpec } from "./rules.js?v=1";

const WAITERS = ["ambusher", "flanker", "wanderer"];
/** @type {Record<string, number>} */
const GLOBAL_LIMITS = { ambusher: 7, flanker: 17, wanderer: 32 };

/**
 * @typedef {{ personal: { ambusher: number, flanker: number, wanderer: number },
 *   globalActive: boolean, globalCount: number, sinceDot: number }} House
 */

/** Level-start state. @returns {House} */
export function newHouse() {
  return {
    personal: { ambusher: 0, flanker: 0, wanderer: 0 },
    globalActive: false,
    globalCount: 0,
    sinceDot: 0,
  };
}

/** Life-restart state: personal counts kept, global counter on from 0. @param {House} h @returns {House} */
export function restartHouse(h) {
  return {
    personal: { ...h.personal },
    globalActive: true,
    globalCount: 0,
    sinceDot: 0,
  };
}

/**
 * One playing tick of the house (§8.5 pseudocode).
 * @param {House} h
 * @param {{ dotEaten: boolean, level: number, waiting: Record<string, boolean> }} input
 * @returns {{ h: House, release: string | null }}
 */
export function releaseStep(h, { dotEaten, level, waiting }) {
  const spec = levelSpec(level);
  /** @type {House} */
  const n = { ...h, personal: { ...h.personal } };
  /** @type {Record<string, number>} */
  const personal = n.personal;
  const preferred = WAITERS.find((r) => waiting[r]) ?? null;
  if (dotEaten) {
    n.sinceDot = 0;
    if (n.globalActive) n.globalCount += 1;
    else if (preferred) personal[preferred] += 1;
  } else n.sinceDot += 1;
  /** @type {Record<string, number>} */
  const limits = spec.houseLimits;
  let release = null;
  if (
    n.globalActive &&
    preferred &&
    n.globalCount >= GLOBAL_LIMITS[preferred]
  ) {
    release = preferred;
    if (preferred === "wanderer") n.globalActive = false;
  } else if (
    !n.globalActive &&
    preferred &&
    personal[preferred] >= limits[preferred]
  )
    release = preferred;
  if (release === null && preferred && n.sinceDot >= spec.forceExitTicks) {
    release = preferred;
    n.sinceDot = 0;
  }
  return { h: n, release };
}
