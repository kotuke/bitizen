import assert from "node:assert/strict";
import test from "node:test";
import { inflateSync } from "node:zlib";

import {
  PALETTE,
  assertAvatarDescriptor,
  createAvatarDescriptor,
  generateAvatarPng,
  generateAvatarSvg,
  renderAvatarSvg,
} from "../src/styles/plain.mjs";

const SECRET = "test-secret-with-at-least-16-characters";
const EYE = "#F4F1E7";

function decodeRgbPng(png) {
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const compressed = [];
  let offset = 8;

  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT") compressed.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }

  const raw = inflateSync(Buffer.concat(compressed));
  const rowLength = width * 3 + 1;
  assert.equal(raw.length, rowLength * height);
  for (let row = 0; row < height; row += 1) {
    assert.equal(raw[row * rowLength], 0);
  }

  return {
    width,
    height,
    pixel(column, row) {
      const pixelOffset = row * rowLength + 1 + column * 3;
      return [...raw.subarray(pixelOffset, pixelOffset + 3)];
    },
  };
}

function hexToRgb(hex) {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

/** Returns connected clusters of pixels of the given color. */
function clustersOf(decoded, color) {
  const matches = new Set();
  for (let row = 0; row < decoded.height; row += 1) {
    for (let column = 0; column < decoded.width; column += 1) {
      const pixel = decoded.pixel(column, row);
      if (pixel[0] === color[0] && pixel[1] === color[1] && pixel[2] === color[2]) {
        matches.add(`${column},${row}`);
      }
    }
  }

  const clusters = [];
  while (matches.size > 0) {
    const [start] = matches;
    matches.delete(start);
    const queue = [start];
    const cluster = [start];

    while (queue.length > 0) {
      const [column, row] = queue.pop().split(",").map(Number);
      for (const [deltaColumn, deltaRow] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const neighbor = `${column + deltaColumn},${row + deltaRow}`;
        if (matches.delete(neighbor)) {
          queue.push(neighbor);
          cluster.push(neighbor);
        }
      }
    }

    clusters.push(cluster.map((pixel) => pixel.split(",").map(Number)));
  }

  return clusters;
}

test("same user and secret always produce the same descriptor", () => {
  const first = createAvatarDescriptor("user-123", { secret: SECRET });
  const second = createAvatarDescriptor("user-123", { secret: SECRET });
  assert.deepEqual(first, second);
});

test("different users produce different fingerprints", () => {
  const fingerprints = new Set();
  for (let index = 0; index < 1000; index += 1) {
    fingerprints.add(createAvatarDescriptor(`user-${index}`, { secret: SECRET }).fingerprint);
  }
  assert.equal(fingerprints.size, 1000);
});

test("a cohort of 10,000 users stays visually diverse", () => {
  const visualSignatures = new Set();
  for (let index = 0; index < 10_000; index += 1) {
    const descriptor = createAvatarDescriptor(`user-${index}`, { secret: SECRET });
    visualSignatures.add(`${descriptor.accent}:${JSON.stringify(descriptor.pixels)}`);
  }
  assert.ok(
    visualSignatures.size >= 9980,
    `expected at least 9980 distinct avatars, got ${visualSignatures.size}`,
  );
});

test("changing the secret changes the avatar without exposing the identifier", () => {
  const first = createAvatarDescriptor("private-user-id", { secret: SECRET });
  const second = createAvatarDescriptor("private-user-id", {
    secret: "a-different-secret-with-at-least-16-characters",
  });
  assert.notEqual(first.fingerprint, second.fingerprint);
  assert.doesNotMatch(JSON.stringify(first), /private-user-id/);
});

test("every bot is one symmetric connected figure with two eyes inside it", () => {
  for (let index = 0; index < 500; index += 1) {
    const descriptor = createAvatarDescriptor(`shape-${index}`, { secret: SECRET });
    assert.equal(assertAvatarDescriptor(descriptor), descriptor);

    const columns = descriptor.pixels.map(([column]) => column);
    assert.equal(Math.min(...columns) + Math.max(...columns), 0);

    const body = new Set(descriptor.pixels.map(([column, row]) => `${column},${row}`));
    assert.equal(descriptor.eyes.length, 2);
    for (const [column, row] of descriptor.eyes) {
      assert.ok(body.has(`${column},${row}`));
    }
  }
});

test("body proportions actually vary between users", () => {
  const heights = new Set();
  const widths = new Set();
  for (let index = 0; index < 500; index += 1) {
    const descriptor = createAvatarDescriptor(`variety-${index}`, { secret: SECRET });
    heights.add(descriptor.rows);
    widths.add(Math.max(...descriptor.pixels.map(([column]) => column)));
  }
  assert.ok(heights.size >= 4, `expected varied heights, got ${heights.size}`);
  assert.ok(widths.size >= 3, `expected varied widths, got ${widths.size}`);
});

test("SVG paints the body in the accent color and the eyes white", () => {
  const descriptor = createAvatarDescriptor("svg-user", { secret: SECRET });
  const svg = renderAvatarSvg(descriptor, { size: 64 });
  assert.match(svg, /width="64" height="64" viewBox="0 0 1254 1254"/);
  assert.match(svg, /<rect width="1254" height="1254" fill="#080A0E"\/>/);
  assert.ok(PALETTE.includes(descriptor.accent));
  assert.match(svg, new RegExp(`<g fill="${descriptor.accent}"`));
  assert.match(svg, new RegExp(`<g fill="${EYE}"`));
  assert.doesNotMatch(svg, /<pattern\b/);
  assert.doesNotMatch(svg, /<defs\b/);
  assert.doesNotMatch(svg, /<(circle|ellipse|image|polygon|polyline)\b/);
  assert.doesNotMatch(svg, /\brx=/);
  assert.doesNotMatch(svg, /svg-user/);
});

test("SVG title is safely escaped", () => {
  const descriptor = createAvatarDescriptor("title-user", { secret: SECRET });
  const svg = renderAvatarSvg(descriptor, { title: `<Robot & "friend">` });
  assert.match(svg, /&lt;Robot &amp; &quot;friend&quot;&gt;/);
  assert.doesNotMatch(svg, /<Robot/);
});

test("render API rejects a forged descriptor before writing XML", () => {
  const descriptor = createAvatarDescriptor("forged-descriptor", { secret: SECRET });
  assert.throws(
    () => renderAvatarSvg({
      ...descriptor,
      fingerprint: `x\"><script>alert(1)</script>`,
    }),
    /fingerprint/,
  );
  assert.throws(
    () => renderAvatarSvg({ ...descriptor, version: "v999" }),
    /version/,
  );
  assert.throws(
    () => renderAvatarSvg({ ...descriptor, eyes: [[0, 0]] }),
    /eyes/,
  );
});

test("PNG is deterministic, opaque RGB and has the requested dimensions", () => {
  const first = generateAvatarPng("png-user", { secret: SECRET, size: 64 });
  const second = generateAvatarPng("png-user", { secret: SECRET, size: 64 });
  assert.deepEqual(first, second);
  assert.deepEqual(first.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  assert.equal(first.readUInt32BE(16), 64);
  assert.equal(first.readUInt32BE(20), 64);
  assert.equal(first[24], 8);
  assert.equal(first[25], 2);
});

test("PNG keeps exactly two white eyes and no other white areas", () => {
  for (const userId of ["eye-user-1", "eye-user-2", "eye-user-3"]) {
    const decoded = decodeRgbPng(generateAvatarPng(userId, { secret: SECRET, size: 256 }));
    const clusters = clustersOf(decoded, hexToRgb(EYE));
    assert.equal(clusters.length, 2, `${userId} must have two eyes`);
    assert.equal(clusters[0].length, clusters[1].length);

    const centerX = clusters.map((cluster) => (
      cluster.reduce((total, [column]) => total + column, 0) / cluster.length
    ));
    const centerY = clusters.map((cluster) => (
      cluster.reduce((total, [, row]) => total + row, 0) / cluster.length
    ));
    assert.equal(centerY[0], centerY[1]);
    assert.ok(
      Math.abs((centerX[0] + centerX[1]) / 2 - (decoded.width - 1) / 2) <= 1,
      `${userId} eyes must stay mirrored around the center`,
    );
  }
});

test("PNG uses only the background, accent and eye colors", () => {
  const descriptor = createAvatarDescriptor("palette-user", { secret: SECRET });
  const decoded = decodeRgbPng(generateAvatarPng("palette-user", { secret: SECRET, size: 128 }));
  const allowed = new Set([
    hexToRgb("#080A0E").join(","),
    hexToRgb(descriptor.accent).join(","),
    hexToRgb(EYE).join(","),
  ]);

  for (let row = 0; row < decoded.height; row += 1) {
    for (let column = 0; column < decoded.width; column += 1) {
      const color = decoded.pixel(column, row).join(",");
      assert.ok(allowed.has(color), `unexpected color ${color}`);
    }
  }
});

test("PNG background is a flat black field with no grid lines", () => {
  const decoded = decodeRgbPng(generateAvatarPng("background-user", { secret: SECRET, size: 128 }));
  const background = hexToRgb("#080A0E");
  for (const column of [0, 1, decoded.width - 1]) {
    for (let row = 0; row < decoded.height; row += 1) {
      assert.deepEqual(decoded.pixel(column, row), background);
    }
  }
  for (const row of [0, 1, decoded.height - 1]) {
    for (let column = 0; column < decoded.width; column += 1) {
      assert.deepEqual(decoded.pixel(column, row), background);
    }
  }
});

test("invalid identifiers, secrets and sizes fail closed", () => {
  assert.throws(() => generateAvatarSvg("", { secret: SECRET }), /userId/);
  assert.throws(() => generateAvatarSvg("user", { secret: "" }), /secret/);
  assert.throws(() => generateAvatarSvg("user", { secret: "too-short" }), /16 characters/);
  assert.throws(() => generateAvatarPng("user", { secret: SECRET, size: 31 }), /size/);
  assert.throws(() => generateAvatarPng("user", { secret: SECRET, size: 2049 }), /size/);
});
