import test from "node:test";
import assert from "node:assert/strict";
import { createTouch, tapKey } from "../src/touch.js";

const swipe = (t, x0, y0, x1, y1) => {
  t.down(x0, y0, 0);
  return t.move(x1, y1);
};

test("AC2: a swipe past 24 px is the arrow key of its dominant axis", () => {
  assert.equal(swipe(createTouch(), 100, 100, 130, 105), "ArrowRight");
  assert.equal(swipe(createTouch(), 100, 100, 70, 95), "ArrowLeft");
  assert.equal(swipe(createTouch(), 100, 100, 104, 130), "ArrowDown");
  assert.equal(swipe(createTouch(), 100, 100, 96, 70), "ArrowUp");
});

test("AC2: movement under 24 px gives no key", () => {
  assert.equal(swipe(createTouch(), 100, 100, 120, 110), null);
});

test("AC2: after a trigger the anchor moves, so one finger can keep turning", () => {
  const t = createTouch();
  t.down(100, 100, 0);
  assert.equal(t.move(130, 100), "ArrowRight");
  assert.equal(t.move(135, 100), null); // 5 px from the new anchor
  assert.equal(t.move(135, 130), "ArrowDown");
  assert.equal(t.move(135, 100), "ArrowUp");
});

test("AC3: a short, still touch is a tap; a swipe, a long press or a drag is not", () => {
  const quick = createTouch();
  quick.down(50, 50, 1000);
  assert.equal(quick.up(53, 52, 1200), true);

  const slow = createTouch();
  slow.down(50, 50, 1000);
  assert.equal(slow.up(50, 50, 1300), false);

  const drag = createTouch();
  drag.down(50, 50, 1000);
  drag.move(50, 62); // past 10 px, short of 24
  assert.equal(drag.up(50, 62, 1100), false);

  const swiped = createTouch();
  swiped.down(50, 50, 1000);
  swiped.move(90, 50);
  swiped.move(50, 50); // back at the start, but it was a swipe
  assert.equal(swiped.up(50, 50, 1100), false);
});

test("a move or up without a touch down does nothing", () => {
  const t = createTouch();
  assert.equal(t.move(500, 500), null);
  assert.equal(t.up(500, 500, 10), false);
});

test("a touch can follow another, and the second starts clean", () => {
  const t = createTouch();
  t.down(0, 0, 0);
  t.move(40, 0);
  t.up(40, 0, 50);
  t.down(10, 10, 1000);
  assert.equal(t.up(10, 10, 1050), true);
});

test("AC3/AC4/AC5: what a tap means depends on the screen", () => {
  assert.equal(tapKey("game", 0.5), "p");
  assert.equal(tapKey("game", 0.95), "p");
  assert.equal(tapKey("initials", 0.5), "Enter");
  assert.equal(tapKey("initials", 0.95), "Enter");
  assert.equal(tapKey("title", 0.5), "Enter");
  assert.equal(tapKey("title", 0.95), "m"); // the sound line, bottom of the canvas
  assert.equal(tapKey("title", 1.4), "Enter"); // below the canvas
});
