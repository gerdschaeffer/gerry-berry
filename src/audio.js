// WebAudio sounds (spec 001 §8.9): every sound is our own oscillator synthesis, no files.
// Any WebAudio failure leaves audio silent; no method ever throws.

/** @typedef {[number, number | null, number]} Note f0 Hz, sweep end Hz or null, duration s */
/** @typedef {[OscillatorType, Note[]]} Sound notes play back to back */

const PEAK = 0.15;
const HUM_GAIN = 0.03;
/** @param {number} m MIDI note */
const hz = (m) => 440 * 2 ** ((m - 69) / 12);

/** @type {Record<string, Sound>} */
const SHOTS = {
  energizerEaten: ["triangle", [[220, 880, 0.15]]],
  ghostEaten: ["square", [[300, 1500, 0.2]]],
  fruitEaten: [
    "sine",
    [
      [784, null, 0.08],
      [1568, null, 0.08],
    ],
  ],
  extraLife: [
    "sine",
    [
      [1046, null, 0.1],
      [1318, null, 0.1],
      [1568, null, 0.1],
    ],
  ],
  deathAnimStart: ["sawtooth", [[800, 100, 1.2]]],
};
/** @type {Sound[]} */
const DOTS = [
  ["sine", [[1046, null, 0.04]]],
  ["sine", [[1318, null, 0.04]]],
];
/** @type {Sound} */
const FRIGHT_PULSE = ["square", [[160, null, 0.06]]];
/** @type {Sound} */
const EYES_PULSE = ["sine", [[1200, 600, 0.08]]];
/** @type {Sound} our own composition, 3.6 s */
const JINGLE = [
  "square",
  /** @type {[number, number][]} */ ([
    [72, 0.2],
    [79, 0.2],
    [76, 0.2],
    [84, 0.4],
    [81, 0.2],
    [77, 0.2],
    [74, 0.2],
    [79, 0.4],
    [76, 0.2],
    [72, 0.2],
    [74, 0.2],
    [67, 0.2],
    [72, 0.8],
  ]).map(([m, d]) => /** @type {Note} */ ([hz(m), null, d])),
];

/**
 * @param {unknown} AudioContextCtor
 * @returns {{ unlock(): void, setMuted(b: unknown): void, update(view: any, events: unknown): void }}
 */
export function createAudio(AudioContextCtor) {
  /** @type {AudioContext | null} */
  let ctx = null;
  /** @type {GainNode | null} */
  let master = null;
  let tried = false;
  let muted = false;
  let dots = 0;
  /** @type {{ osc: OscillatorNode, dotsEaten: number } | null} */
  let hum = null;

  /** @param {AudioContext} c @param {GainNode} out @param {Sound} sound */
  const play = (c, out, [wave, notes]) => {
    let at = c.currentTime;
    for (const [f0, f1, dur] of notes) {
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = wave;
      osc.frequency.setValueAtTime(f0, at);
      if (f1 !== null) osc.frequency.linearRampToValueAtTime(f1, at + dur);
      g.gain.setValueAtTime(PEAK, at);
      g.gain.linearRampToValueAtTime(0, at + dur);
      osc.connect(g);
      g.connect(out);
      osc.start(at);
      osc.stop(at + dur);
      at += dur;
    }
  };

  return {
    unlock() {
      if (tried) {
        // iOS suspends the context again after a lock or app switch; a later gesture revives it.
        try {
          if (ctx && ctx.state !== "running") ctx.resume().catch(() => {});
        } catch {
          // silent
        }
        return;
      }
      tried = true;
      try {
        const c = new /** @type {typeof AudioContext} */ (AudioContextCtor)();
        const m = c.createGain();
        m.gain.value = muted ? 0 : 1;
        m.connect(c.destination);
        ctx = c;
        master = m;
        const r = /** @type {unknown} */ (c.resume());
        if (r instanceof Promise) r.catch(() => {});
      } catch {
        // silent: no constructor, a throwing one, or a broken context
      }
    },

    setMuted(b) {
      muted = Boolean(b);
      try {
        if (master) master.gain.value = muted ? 0 : 1;
      } catch {
        // silent
      }
    },

    update(view, events) {
      const c = ctx;
      const out = master;
      // iOS "interrupted" (call, lock): scheduled sounds would all play at once on return.
      if (!c || !out || c.state === "interrupted") return;
      try {
        for (const e of Array.isArray(events) ? events : []) {
          const type = e?.type;
          if (type === "dotEaten") play(c, out, DOTS[dots++ % 2]);
          else if (type === "readyStart" && e.first === true)
            play(c, out, JINGLE);
          else if (typeof type === "string" && Object.hasOwn(SHOTS, type))
            play(c, out, SHOTS[type]);
        }

        const g = view?.screen === "game" ? view.game : null;
        const live = Boolean(g) && g.state === "playing" && !view.paused;
        const ghosts = live && Array.isArray(g.ghosts) ? g.ghosts : [];
        const eyes = ghosts.some(
          (/** @type {any} */ x) =>
            x?.state === "eyes" || x?.state === "entering",
        );
        const fright =
          g?.frightTicks > 0 ||
          ghosts.some((/** @type {any} */ x) => x?.frightened);
        if (live && eyes && g.tick % 10 === 0) play(c, out, EYES_PULSE);
        if (live && fright && !eyes && g.tick % 15 === 0)
          play(c, out, FRIGHT_PULSE);

        const t = c.currentTime;
        if (live && !fright && !eyes) {
          if (!hum) {
            const osc = c.createOscillator();
            const hg = c.createGain();
            osc.type = "sine";
            hg.gain.setValueAtTime(HUM_GAIN, t);
            osc.connect(hg);
            hg.connect(out);
            osc.start(t);
            hum = { osc, dotsEaten: NaN };
          }
          if (hum.dotsEaten !== g.dotsEaten) {
            hum.dotsEaten = g.dotsEaten;
            hum.osc.frequency.setValueAtTime(120 + g.dotsEaten / 2, t);
          }
        } else if (hum) {
          hum.osc.stop(t); // if this throws, `hum` stays and the next update retries
          hum = null;
        }
      } catch {
        // silent
      }
    },
  };
}
