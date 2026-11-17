import test from "node:test";
import assert from "node:assert/strict";
import { createAudio } from "../src/audio.js";

/** A context that records resume() calls and oscillators; `resume` is swappable per test. */
function fakeContext(state, resume) {
  const made = { resumes: 0, oscillators: 0 };
  const param = () => ({
    value: 1,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
  });
  class Ctx {
    state = state;
    currentTime = 0;
    destination = {};
    createGain() {
      return { gain: param(), connect() {} };
    }
    createOscillator() {
      made.oscillators++;
      return { frequency: param(), connect() {}, start() {}, stop() {} };
    }
    resume() {
      made.resumes++;
      return resume ? resume() : Promise.resolve();
    }
  }
  return { Ctx, made };
}

const dot = [{ type: "dotEaten" }];

test("a later unlock resumes a context that is not running", () => {
  const { Ctx, made } = fakeContext("suspended");
  const audio = createAudio(Ctx);
  audio.unlock(); // creates the context and resumes it once
  assert.equal(made.resumes, 1);
  audio.unlock();
  assert.equal(made.resumes, 2);
});

test("a running context is not resumed again", () => {
  const { Ctx, made } = fakeContext("running");
  const audio = createAudio(Ctx);
  audio.unlock();
  audio.unlock();
  assert.equal(made.resumes, 1);
});

test("a rejecting or throwing resume() never escapes unlock()", () => {
  for (const resume of [
    () => Promise.reject(new Error("no")),
    () => {
      throw new Error("closed");
    },
  ]) {
    let first = true;
    const { Ctx } = fakeContext("suspended", () => {
      if (first) {
        first = false;
        return Promise.resolve();
      }
      return resume();
    });
    const audio = createAudio(Ctx);
    audio.unlock();
    assert.doesNotThrow(() => audio.unlock());
  }
});

test("an interrupted context plays nothing; a running one does", () => {
  const running = fakeContext("running");
  const a = createAudio(running.Ctx);
  a.unlock();
  a.update({ screen: "title" }, dot);
  assert.ok(running.made.oscillators > 0);

  const cut = fakeContext("interrupted");
  const b = createAudio(cut.Ctx);
  b.unlock();
  b.update({ screen: "title" }, dot);
  assert.equal(cut.made.oscillators, 0);
});
