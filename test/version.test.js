import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const root = new URL("../", import.meta.url);
const html = readFileSync(new URL("index.html", root), "utf8");
const files = readdirSync(new URL("src/", root), { recursive: true })
  .filter((f) => f.endsWith(".js"))
  .map((f) => [`src/${f}`, readFileSync(new URL(`src/${f}`, root), "utf8")]);

const version = html.match(/src="src\/main\.js\?v=([\w.-]+)"/)?.[1];

test("AC1: index.html tags the script and the stylesheet with one version", () => {
  assert.ok(version, "the main.js script tag has ?v=<version>");
  assert.match(html, new RegExp(`href="style\\.css\\?v=${version}"`));
});

test("AC2: every relative import in src carries that same version, so a release is one consistent set", () => {
  let n = 0;
  for (const [name, code] of files)
    for (const [, spec] of code.matchAll(/\bfrom\s+"(\.{1,2}\/[^"]+)"/g)) {
      n++;
      assert.ok(spec.endsWith(`.js?v=${version}`), `${name}: ${spec}`);
    }
  assert.ok(n >= 15, `found ${n} imports`);
});
