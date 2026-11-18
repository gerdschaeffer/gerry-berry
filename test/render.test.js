import test from "node:test";
import assert from "node:assert/strict";
import { createRenderer } from "../src/render.js";

/** Draws a title view on a fake canvas; returns the fillStyle of each fillText and the fillRect sizes. */
function drawTitle(touch) {
  const fills = [];
  const rects = [];
  const ctx = new Proxy(
    { fillStyle: "", textAlign: "", textBaseline: "", font: "" },
    {
      get: (t, k) =>
        k === "fillText"
          ? (s) => fills.push([s, t.fillStyle])
          : k === "fillRect"
            ? (x, y, w, h) => rects.push([w, h, t.fillStyle])
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
    persistent: true,
    scores: [],
    paused: false,
    high: 0,
    game: null,
    initials: null,
    touch,
  });
  return { fills: new Map(fills), rects };
}

const titleFills = (touch) => drawTitle(touch).fills;

test("AC1: the title is drawn in its own colour", () => {
  const fills = titleFills();
  assert.equal(fills.get("GERRY BERRY"), "#FFC93C");
});

test("AC2: the other title-screen lines keep the normal text colour", () => {
  const fills = titleFills();
  assert.equal(fills.get("PRESS ENTER"), "#E8E6F0");
  assert.equal(fills.get("SOUND ON"), "#E8E6F0");
});

const QR_PLATE = (r) => r[0] === 70 && r[1] === 70 && r[2] === "#FFFFFF";

test("AC2: without touch the title screen draws the QR code and its label", () => {
  const { fills, rects } = drawTitle(false);
  assert.equal(rects.filter(QR_PLATE).length, 1);
  assert.ok(rects.some((r) => r[0] === 2 && r[1] === 2 && r[2] === "#07060D"));
  assert.equal(fills.get("SCAN TO PLAY"), "#E8E6F0");
});

test("AC3: on a touch device the QR code and its label are not drawn", () => {
  const { fills, rects } = drawTitle(true);
  assert.equal(rects.filter(QR_PLATE).length, 0);
  assert.equal(rects.filter((r) => r[0] === 2 && r[1] === 2).length, 0);
  assert.equal(fills.has("SCAN TO PLAY"), false);
});
