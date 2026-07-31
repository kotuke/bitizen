import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_STYLE,
  STYLE_NAMES,
  assertAvatarDescriptor,
  avatarEtag,
  createAvatarDescriptor,
  generateAvatarPng,
  generateAvatarSvg,
  normalizeStyle,
  renderAvatarPng,
  renderAvatarSvg,
} from "../src/index.mjs";

const SECRET = "api-test-secret-with-at-least-16-characters";

test("both styles are exposed and plain is the default", () => {
  assert.deepEqual([...STYLE_NAMES].sort(), ["plain", "rich"]);
  assert.equal(DEFAULT_STYLE, "plain");
  assert.equal(createAvatarDescriptor("user-1", { secret: SECRET }).style, "plain");
});

test("each style keeps its own shape of descriptor", () => {
  const plain = createAvatarDescriptor("user-1", { secret: SECRET, style: "plain" });
  const rich = createAvatarDescriptor("user-1", { secret: SECRET, style: "rich" });

  assert.ok(Array.isArray(plain.pixels));
  assert.equal(plain.layers, undefined);
  assert.ok(Array.isArray(rich.layers));
  assert.equal(rich.pixels, undefined);
  assert.equal(plain.fingerprint, rich.fingerprint, "seed does not depend on the style");
});

test("the same user looks different in the two styles", () => {
  const plain = generateAvatarPng("user-1", { secret: SECRET, style: "plain", size: 64 });
  const rich = generateAvatarPng("user-1", { secret: SECRET, style: "rich", size: 64 });
  assert.notDeepEqual(plain, rich);
});

test("rendering is deterministic through the facade", () => {
  for (const style of STYLE_NAMES) {
    const descriptor = createAvatarDescriptor("user-2", { secret: SECRET, style });
    assert.deepEqual(
      renderAvatarPng(descriptor, { size: 64 }),
      generateAvatarPng("user-2", { secret: SECRET, style, size: 64 }),
    );
    assert.equal(
      renderAvatarSvg(descriptor, { size: 64 }),
      generateAvatarSvg("user-2", { secret: SECRET, style, size: 64 }),
    );
  }
});

test("ETag separates the styles", () => {
  const plain = createAvatarDescriptor("user-3", { secret: SECRET, style: "plain" });
  const rich = createAvatarDescriptor("user-3", { secret: SECRET, style: "rich" });
  assert.notEqual(avatarEtag(plain, "png", 256), avatarEtag(rich, "png", 256));
  assert.match(avatarEtag(rich, "png", 256), /-rich-/);
});

test("an unknown style fails closed everywhere", () => {
  assert.throws(() => normalizeStyle("fancy"), /style must be one of/);
  assert.throws(
    () => createAvatarDescriptor("user-4", { secret: SECRET, style: "fancy" }),
    /style must be one of/,
  );
  const descriptor = createAvatarDescriptor("user-4", { secret: SECRET });
  assert.throws(() => renderAvatarSvg({ ...descriptor, style: "fancy" }), /style must be one of/);
  assert.throws(() => assertAvatarDescriptor({ ...descriptor, style: undefined }), /style/);
});

test("a descriptor forged across styles is rejected", () => {
  const plain = createAvatarDescriptor("user-5", { secret: SECRET, style: "plain" });
  assert.throws(() => renderAvatarPng({ ...plain, style: "rich" }), /layer/);
});
