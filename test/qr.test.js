import test from "node:test";
import assert from "node:assert/strict";
import { QR, QR_URL } from "../src/qr.js";

const at = (x, y) => QR[y][x] === "#";

test("AC1: the matrix is a 29 x 29 grid of # and .", () => {
  assert.equal(QR.length, 29);
  for (const row of QR) assert.match(row, /^[#.]{29}$/);
});

test("AC1: the three finder patterns sit in the corners", () => {
  for (const [ox, oy] of [
    [0, 0],
    [22, 0],
    [0, 22],
  ])
    for (let y = 0; y < 7; y++)
      for (let x = 0; x < 7; x++) {
        const ring = x === 0 || x === 6 || y === 0 || y === 6;
        const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
        assert.equal(at(ox + x, oy + y), ring || core, `${ox + x},${oy + y}`);
      }
});

test("AC1: the timing patterns alternate between the finders", () => {
  for (let i = 8; i <= 20; i++) {
    assert.equal(at(i, 6), i % 2 === 0, `row 6, col ${i}`);
    assert.equal(at(6, i), i % 2 === 0, `col 6, row ${i}`);
  }
});

test("the code points at the page the game is served from", () => {
  assert.equal(QR_URL, "https://gerdschaeffer.github.io/gerry-berry/");
});
