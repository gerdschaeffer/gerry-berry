import test from "node:test";
import assert from "node:assert/strict";
import { createRenderer } from "../src/render.js";

/** Draws a title view on a fake canvas and returns the fillStyle each fillText was drawn with. */
function titleFills() {
  const fills = [];
  const ctx = new Proxy(
    { fillStyle: "", textAlign: "", textBaseline: "", font: "" },
    {
      get: (t, k) =>
        k === "fillText"
          ? (s) => fills.push([s, t.fillStyle])
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
  });
  return new Map(fills);
}

test("AC1: the title is drawn in its own colour", () => {
  const fills = titleFills();
  assert.equal(fills.get("GERRY BERRY"), "#FFC93C");
});

test("AC2: the other title-screen lines keep the normal text colour", () => {
  const fills = titleFills();
  assert.equal(fills.get("PRESS ENTER"), "#E8E6F0");
  assert.equal(fills.get("SOUND ON"), "#E8E6F0");
});
