// DOM glue only (spec 001 §4.1, §4.3, §8.6): keyboard, rAF loop, resize, visibility.
// No DOM code runs at import when there is no document, so Node tests can import the helpers.
import { createApp, keyToDir } from "./app.js";
import { createRenderer } from "./render.js";
import { createAudio } from "./audio.js";

export { keyToDir, keysToInput } from "./app.js";

const NO_SCROLL = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  " ",
]);

/**
 * Fixed 60 Hz ticks due after `elapsedMs`; `acc` is in units of 1/60 ms (AC-67).
 * @param {number} acc
 * @param {number} elapsedMs
 * @returns {{ acc: number, ticks: number }}
 */
export function ticksDue(acc, elapsedMs) {
  const e = Number.isNaN(elapsedMs) ? 0 : Math.min(250, Math.max(0, elapsedMs));
  acc += Math.round(e * 60);
  const ticks = Math.min(5, Math.floor(acc / 1000));
  acc -= 1000 * ticks;
  if (ticks === 5 && acc >= 1000) acc = 0;
  return { acc, ticks };
}

/** @param {HTMLCanvasElement} canvas */
function start(canvas) {
  const renderer = createRenderer(canvas);
  const storage = {
    getItem: (/** @type {string} */ k) => localStorage.getItem(k),
    setItem: (/** @type {string} */ k, /** @type {string} */ v) =>
      localStorage.setItem(k, v),
  };
  const app = createApp({ seed: 1, storage });
  // Unprefixed since Safari 14.1; the webkit name cannot be typed or reached under lint/sast rules.
  const audio = createAudio(globalThis.AudioContext);
  /** @type {string[]} */
  const queue = [];
  let acc = 0;
  let last = performance.now();
  audio.setMuted(app.snapshot().muted);
  /** One tick: app step, then feed that tick's events and the view after it to audio. */
  const tick = (/** @type {string[]} */ keys) => {
    const events = app.step(keys);
    const view = app.snapshot();
    audio.setMuted(view.muted);
    audio.update(view, events);
    return view;
  };

  const resize = () =>
    renderer.resize(
      window.innerWidth,
      window.innerHeight,
      window.devicePixelRatio,
    );
  resize();
  window.addEventListener("resize", resize);

  document.addEventListener("keydown", (e) => {
    audio.unlock(); // the user gesture that lets WebAudio start
    if (NO_SCROLL.has(e.key)) e.preventDefault();
    if (document.hidden || (e.repeat && !keyToDir(e.key))) return;
    queue.push(e.key);
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      last = performance.now();
      return;
    }
    queue.length = 0; // a queued P would otherwise undo the pause on the next tick
    const v = app.snapshot();
    if (v.screen === "game" && !v.paused && v.game?.state !== "gameOver")
      tick(["p"]);
  });

  /** @param {number} now */
  const frame = (now) => {
    const due = ticksDue(acc, now - last);
    acc = due.acc;
    last = now;
    let view = null;
    for (let i = 0; i < due.ticks; i++) view = tick(queue.splice(0, 16));
    renderer.draw(view ?? app.snapshot());
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

// One canvas only (checkShell); undefined in Node, where nothing runs.
const canvas = globalThis.document?.querySelector("canvas");
if (canvas) start(canvas);
