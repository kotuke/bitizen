import assert from "node:assert/strict";
import test from "node:test";

import { createAvatarServer } from "../src/server.mjs";

const SECRET = "server-test-secret-at-least-16-characters";

async function withServer(run) {
  const server = createAvatarServer({ secret: SECRET, maxCacheEntries: 8 });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

test("server returns SVG, PNG, cache headers and conditional 304", async () => {
  await withServer(async (baseUrl) => {
    const svgResponse = await fetch(`${baseUrl}/avatars/v1/user-123.svg?size=64`);
    assert.equal(svgResponse.status, 200);
    assert.match(svgResponse.headers.get("content-type"), /^image\/svg\+xml/);
    assert.match(svgResponse.headers.get("cache-control"), /immutable/);
    const etag = svgResponse.headers.get("etag");
    assert.ok(etag);
    assert.match(await svgResponse.text(), /width="64" height="64"/);

    const cachedResponse = await fetch(`${baseUrl}/avatars/v1/user-123.svg?size=64`, {
      headers: { "If-None-Match": etag },
    });
    assert.equal(cachedResponse.status, 304);
    assert.equal(cachedResponse.headers.get("access-control-allow-origin"), "*");

    const pngResponse = await fetch(`${baseUrl}/avatars/v1/user-123.png?size=128`);
    assert.equal(pngResponse.status, 200);
    assert.equal(pngResponse.headers.get("content-type"), "image/png");
    const png = Buffer.from(await pngResponse.arrayBuffer());
    assert.equal(png.readUInt32BE(16), 128);
    assert.equal(png.readUInt32BE(20), 128);

    const headResponse = await fetch(`${baseUrl}/avatars/v1/user-123.png?size=128`, {
      method: "HEAD",
    });
    assert.equal(headResponse.status, 200);
    assert.equal((await headResponse.arrayBuffer()).byteLength, 0);
  });
});

test("server exposes health and rejects bad input without reflecting an identifier", async () => {
  await withServer(async (baseUrl) => {
    const healthResponse = await fetch(`${baseUrl}/health`);
    assert.equal(healthResponse.status, 200);
    assert.equal((await healthResponse.json()).ok, true);

    const badSizeResponse = await fetch(`${baseUrl}/avatars/v1/private-user.svg?size=1`);
    assert.equal(badSizeResponse.status, 400);
    const body = await badSizeResponse.text();
    assert.doesNotMatch(body, /private-user/);

    const missingResponse = await fetch(`${baseUrl}/unknown`);
    assert.equal(missingResponse.status, 404);
  });
});

test("server serves both styles and keeps their caches apart", async () => {
  await withServer(async (baseUrl) => {
    const plainResponse = await fetch(`${baseUrl}/avatars/v1/user-777.png?size=64`);
    const richResponse = await fetch(`${baseUrl}/avatars/v1/user-777.png?size=64&style=rich`);
    assert.equal(plainResponse.status, 200);
    assert.equal(richResponse.status, 200);
    assert.notEqual(plainResponse.headers.get("etag"), richResponse.headers.get("etag"));

    const plain = Buffer.from(await plainResponse.arrayBuffer());
    const rich = Buffer.from(await richResponse.arrayBuffer());
    assert.notDeepEqual(plain, rich);

    const unknownStyle = await fetch(`${baseUrl}/avatars/v1/user-777.png?style=fancy`);
    assert.equal(unknownStyle.status, 400);
    assert.match(await unknownStyle.text(), /style must be one of/);
  });
});
