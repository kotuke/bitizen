import assert from "node:assert/strict";
import test from "node:test";

import * as browser from "../src/browser.mjs";
import * as node from "../src/index.mjs";

const SECRET = "browser-test-secret-at-least-16-characters";

test("the browser entry point produces byte-identical SVG", () => {
  for (const style of node.STYLE_NAMES) {
    for (let index = 0; index < 50; index += 1) {
      const userId = `browser-${index}`;
      assert.equal(
        browser.generateAvatarSvg(userId, { secret: SECRET, style, size: 128 }),
        node.generateAvatarSvg(userId, { secret: SECRET, style, size: 128 }),
        `${style}/${userId} must match the Node renderer`,
      );
    }
  }
});

test("the browser seed matches the Node HMAC", () => {
  for (const style of node.STYLE_NAMES) {
    const fromBrowser = browser.createAvatarDescriptor("seed-user", { secret: SECRET, style });
    const fromNode = node.createAvatarDescriptor("seed-user", { secret: SECRET, style });
    assert.equal(fromBrowser.fingerprint, fromNode.fingerprint);
    assert.equal(fromBrowser.accent, fromNode.accent);
  }
});

test("the browser entry point validates input the same way", () => {
  assert.throws(() => browser.generateAvatarSvg("", { secret: SECRET }), /userId/);
  assert.throws(() => browser.generateAvatarSvg("user", { secret: "short" }), /16 characters/);
  assert.throws(
    () => browser.createAvatarDescriptor("user", { secret: SECRET, style: "fancy" }),
    /style must be one of/,
  );
});
