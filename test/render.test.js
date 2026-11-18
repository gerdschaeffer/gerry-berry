import test from "node:test";
import assert from "node:assert/strict";
import { createRenderer } from "../src/render.js";

const TEN = Array.from({ length: 10 }, (_, i) => ({
  initials: "WWW",
  score: 9999999 - i,
}));

/** Draws a title view on a fake canvas; returns every fillText [s, style, y] and fillRect [w, h, style, x, y]. */
function drawTitle({ touch, persistent = true, scores = [] } = {}) {
  const texts = [];
  const rects = [];
  const ctx = new Proxy(
    { fillStyle: "", textAlign: "", textBaseline: "", font: "" },
    {
      get: (t, k) =>
        k === "fillText"
          ? (s, x, y) => texts.push([s, t.fillStyle, y])
          : k === "fillRect"
            ? (x, y, w, h) => rects.push([w, h, t.fillStyle, x, y])
            : k in t
              ? t[k]
              : () => {},
      set: (t, k, v) => ((t[k] = v), true),
    },
  );
  const canvas = { getContext: () => ctx, style: {} };
  createRenderer(canvas).draw({
    screen: "title",
    muted: false,
    persistent,
    scores,
    paused: false,
    high: 0,
    game: null,
    initials: null,
    touch,
  });
  const at = (s) => texts.find((t) => t[0] === s);
  return { texts, rects, at, fills: new Map(texts.map((t) => [t[0], t[1]])) };
}

test("AC1: the title is drawn in its own colour", () => {
  assert.equal(drawTitle().fills.get("GERRY BERRY"), "#FFC93C");
});

test("AC2: the other title-screen lines keep the normal text colour", () => {
  const { fills } = drawTitle();
  assert.equal(fills.get("PRESS ENTER"), "#E8E6F0");
  assert.equal(fills.get("SOUND ON"), "#E8E6F0");
});

const QR_PLATE = (r) => r[0] === 70 && r[1] === 70 && r[2] === "#FFFFFF";

test("AC2: without touch the title screen draws the QR code and its label", () => {
  const { fills, rects } = drawTitle({ touch: false });
  assert.equal(rects.filter(QR_PLATE).length, 1);
  assert.ok(rects.some((r) => r[0] === 2 && r[1] === 2 && r[2] === "#07060D"));
  assert.equal(fills.get("SCAN TO PLAY"), "#E8E6F0");
});

test("AC3: on a touch device the QR code and its label are not drawn", () => {
  const { fills, rects } = drawTitle({ touch: true });
  assert.equal(rects.filter(QR_PLATE).length, 0);
  assert.equal(rects.filter((r) => r[0] === 2 && r[1] === 2).length, 0);
  assert.equal(fills.has("SCAN TO PLAY"), false);
});

test("the QR code is centred, below ten scores, above the sound line and on the canvas", () => {
  const { rects, at } = drawTitle({ touch: false, scores: TEN });
  const [, , , x, y] = rects.find(QR_PLATE);
  assert.equal(x * 2 + 70, 224); // centred
  assert.ok(y + 70 <= 288);
  const lastRow = at("10. WWW 9999990")[2];
  const label = at("SCAN TO PLAY")[2];
  assert.ok(lastRow + 4 <= label - 4, "label clear of the last score row");
  assert.ok(label + 4 <= y, "plate below its label");
  assert.ok(y + 70 + 4 <= at("SOUND ON")[2] - 4, "plate clear of the sound line");
});

test("the SCORES NOT SAVED notice stays clear of the QR code", () => {
  const { rects, at } = drawTitle({ touch: false, persistent: false });
  const [, , , , y] = rects.find(QR_PLATE);
  const note = at("SCORES NOT SAVED")[2];
  assert.ok(note - 4 >= y + 70 || note + 4 <= y);
  assert.ok(note + 4 <= 288);
  assert.ok(note - 4 >= at("SOUND ON")[2] + 4, "notice clear of the sound line");
});

test("on a touch device the title layout is unchanged", () => {
  const { at } = drawTitle({ touch: true, persistent: false });
  assert.equal(at("GERRY BERRY")[2], 120);
  assert.equal(at("TAP TO START")[2], 164);
  assert.equal(at("SCORES NOT SAVED")[2], 264);
  assert.equal(at("SOUND ON")[2], 272);
});
