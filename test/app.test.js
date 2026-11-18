import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";

const app = () => createApp({ seed: 1, storage: null });

test("AC1: Q on the title screen opens the QR popup and Q closes it", () => {
  const a = app();
  assert.equal(a.snapshot().qr, false);
  a.step(["q"]);
  assert.equal(a.snapshot().qr, true);
  a.step(["Q"]);
  assert.equal(a.snapshot().qr, false);
});

test("AC2: while the popup is open any key closes it and Enter does not start a game", () => {
  for (const k of ["Enter", "x", "ArrowUp"]) {
    const a = app();
    a.step(["q"]);
    a.step([k]);
    assert.equal(a.snapshot().qr, false, k);
    assert.equal(a.snapshot().screen, "title", k);
  }
});

test("AC2: after closing, Enter starts a game as before", () => {
  const a = app();
  a.step(["q", "Enter"]);
  assert.equal(a.snapshot().screen, "title");
  a.step(["Enter"]);
  assert.equal(a.snapshot().screen, "game");
  assert.equal(a.snapshot().qr, false);
});

test("AC2: a key that closes the popup ends that tick's input, so two taps in one tick do not start a game", () => {
  const a = app();
  a.step(["q"]);
  a.step(["Enter", "Enter"]);
  assert.equal(a.snapshot().screen, "title");
  assert.equal(a.snapshot().qr, false);
  a.step(["q"]);
  a.step(["Enter", "q"]);
  assert.equal(a.snapshot().qr, false);
});
