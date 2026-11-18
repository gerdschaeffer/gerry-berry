import test from "node:test";
import assert from "node:assert/strict";
import { createRenderer } from "../src/render.js";

const TEN = Array.from({ length: 10 }, (_, i) => ({
  initials: "WWW",
  score: 9999999 - i,
}));

/** Draws a title view on a fake canvas; returns every fillText [s, style, y, x, font] and fillRect [w, h, style, x, y]. */
function drawTitle({ touch, persistent = true, scores = [], qr = false } = {}) {
  const texts = [];
  const rects = [];
  const ctx = new Proxy(
    { fillStyle: "", textAlign: "", textBaseline: "", font: "" },
    {
      get: (t, k) =>
        k === "fillText"
          ? (s, x, y) => texts.push([s, t.fillStyle, y, x, t.font])
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
    qr,
  });
  const at = (s) => texts.find((t) => t[0] === s);
  return { texts, rects, at, fills: new Map(texts.map((t) => [t[0], t[1]])) };
}

const letters = (d, y) => d.texts.filter((t) => t[0].length === 1 && t[2] === y);

test("AC1: the title is drawn letter by letter in a rainbow, centred", () => {
  const d = drawTitle();
  const l = letters(d, 68);
  assert.equal(l.map((t) => t[0]).join(""), "GERRYBERRY");
  assert.equal(new Set(l.map((t) => t[1])).size >= 8, true, "at least 8 distinct colours");
  assert.equal(l.some((t) => t[1] === "#E8E6F0"), false, "none in the plain text colour");
  assert.ok(l.every((t) => t[4].startsWith("24px")), "still 24 px");
  // the span of the letters is centred on 112 and the gap between words is kept
  assert.ok(Math.abs((l[0][3] + l[l.length - 1][3]) / 2 - 112) < 0.01);
  const xs = l.map((t) => t[3]);
  assert.ok(xs[5] - xs[4] > xs[4] - xs[3], "the space leaves a wider gap");
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
  assert.equal(letters(drawTitle({ touch: true }), 120).length, 10);
  assert.equal(at("TAP TO START")[2], 164);
  assert.equal(at("SCORES NOT SAVED")[2], 264);
  assert.equal(at("SOUND ON")[2], 272);
});

const POPUP_PLATE = (r) => r[0] === 140 && r[1] === 140 && r[2] === "#FFFFFF";

test("AC4: on a touch device the title shows the QR line and no QR code", () => {
  const { rects, at } = drawTitle({ touch: true });
  const line = at("INVITE OTHERS: TAP HERE FOR QR CODE");
  assert.equal(line[1], "#3DDC97", "coloured");
  assert.ok(line[4].startsWith("bold "), "bold");
  assert.equal(line[2], 44);
  assert.equal(rects.filter(QR_PLATE).length, 0);
  assert.equal(rects.filter(POPUP_PLATE).length, 0);
  assert.equal(drawTitle({ touch: false }).fills.has("INVITE OTHERS: TAP HERE FOR QR CODE"), false);
});

test("AC5: with the popup open a large, centred QR code is drawn with a close hint", () => {
  const { rects, fills, at } = drawTitle({ touch: true, qr: true });
  const plate = rects.find(POPUP_PLATE);
  assert.ok(plate, "140 px plate");
  assert.equal(plate[3] * 2 + 140, 224); // centred
  assert.ok(plate[4] >= 0 && plate[4] + 140 <= 288);
  assert.ok(rects.some((r) => r[0] === 4 && r[1] === 4 && r[2] === "#07060D"));
  assert.equal(fills.get("TAP TO CLOSE"), "#E8E6F0");
  assert.equal(at("SCAN TO PLAY")[2] + 4 <= plate[4], true);
  assert.equal(at("TAP TO CLOSE")[2] - 4 >= plate[4] + 140, true);
});
