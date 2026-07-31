import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

import {
  AVATAR_VERSION,
  DEFAULT_STYLE,
  avatarEtag,
  createAvatarDescriptor,
  normalizeSize,
  normalizeStyle,
  renderAvatarPng,
  renderAvatarSvg,
} from "./index.mjs";

function createLru(maxEntries) {
  const entries = new Map();

  return {
    get(key) {
      const value = entries.get(key);
      if (value === undefined) return undefined;
      entries.delete(key);
      entries.set(key, value);
      return value;
    },
    set(key, value) {
      if (entries.has(key)) entries.delete(key);
      entries.set(key, value);
      if (entries.size > maxEntries) {
        entries.delete(entries.keys().next().value);
      }
    },
    get size() {
      return entries.size;
    },
  };
}

function sendJson(response, statusCode, body) {
  const payload = Buffer.from(JSON.stringify(body));
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": payload.length,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(payload);
}

function avatarHeaders({ contentType, contentLength, etag }) {
  return {
    "Content-Type": contentType,
    "Content-Length": contentLength,
    "Cache-Control": "public, max-age=31536000, immutable",
    ETag: etag,
    "Access-Control-Allow-Origin": "*",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "X-Content-Type-Options": "nosniff",
  };
}

function parseAvatarRequest(requestUrl) {
  const url = new URL(requestUrl, "http://avatar.local");
  const match = url.pathname.match(/^\/avatars\/([^/]+)\/(.+)\.(svg|png)$/);
  if (!match) return null;

  const [, version, encodedId, format] = match;
  if (version !== AVATAR_VERSION) {
    const error = new Error("unsupported avatar version");
    error.statusCode = 404;
    throw error;
  }

  let userId;
  try {
    userId = decodeURIComponent(encodedId);
  } catch {
    const error = new Error("userId is not valid URL encoding");
    error.statusCode = 400;
    throw error;
  }

  const size = normalizeSize(url.searchParams.get("size") ?? undefined);
  const style = normalizeStyle(url.searchParams.get("style") ?? DEFAULT_STYLE);
  return { userId, format, size, style };
}

export function createAvatarServer({ secret, maxCacheEntries = 512 } = {}) {
  if (typeof secret !== "string" || secret.length < 16) {
    throw new Error("secret must contain at least 16 characters");
  }
  if (!Number.isInteger(maxCacheEntries) || maxCacheEntries < 1) {
    throw new RangeError("maxCacheEntries must be a positive integer");
  }

  const cache = createLru(maxCacheEntries);

  const server = createServer((request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.setHeader("Allow", "GET, HEAD");
      sendJson(response, 405, { error: "method_not_allowed" });
      return;
    }

    if (request.url === "/health") {
      sendJson(response, 200, {
        ok: true,
        version: AVATAR_VERSION,
        cacheEntries: cache.size,
      });
      return;
    }

    try {
      const parsed = parseAvatarRequest(request.url);
      if (!parsed) {
        sendJson(response, 404, { error: "not_found" });
        return;
      }

      const descriptor = createAvatarDescriptor(parsed.userId, { secret, style: parsed.style });
      const etag = avatarEtag(descriptor, parsed.format, parsed.size);
      if (request.headers["if-none-match"] === etag) {
        response.writeHead(304, {
          ETag: etag,
          "Cache-Control": "public, max-age=31536000, immutable",
          "Access-Control-Allow-Origin": "*",
          "Cross-Origin-Resource-Policy": "cross-origin",
          "X-Content-Type-Options": "nosniff",
        });
        response.end();
        return;
      }

      const cacheKey = `${parsed.style}:${parsed.format}:${parsed.size}:${descriptor.fingerprint}`;
      let payload = cache.get(cacheKey);
      if (payload === undefined) {
        payload = parsed.format === "svg"
          ? Buffer.from(renderAvatarSvg(descriptor, { size: parsed.size }))
          : renderAvatarPng(descriptor, { size: parsed.size });
        cache.set(cacheKey, payload);
      }

      const headers = avatarHeaders({
        contentType: parsed.format === "svg"
          ? "image/svg+xml; charset=utf-8"
          : "image/png",
        contentLength: payload.length,
        etag,
      });
      response.writeHead(200, headers);
      response.end(request.method === "HEAD" ? undefined : payload);
    } catch (error) {
      const isClientError = Number.isInteger(error.statusCode)
        || error instanceof RangeError
        || error instanceof TypeError;
      const statusCode = Number.isInteger(error.statusCode)
        ? error.statusCode
        : isClientError ? 400 : 500;
      if (statusCode === 500) {
        console.error("avatar generation failed", error);
      }
      sendJson(response, statusCode, {
        error: statusCode === 404
          ? "not_found"
          : statusCode === 500 ? "internal_error" : "invalid_request",
        ...(statusCode === 500 ? {} : { message: error.message }),
      });
    }
  });

  return server;
}

function isMainModule() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMainModule()) {
  const secret = process.env.AVATAR_SECRET;
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "127.0.0.1";

  if (!secret) {
    console.error("AVATAR_SECRET is required");
    process.exitCode = 1;
  } else if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error("PORT must be an integer from 1 to 65535");
    process.exitCode = 1;
  } else {
    const server = createAvatarServer({ secret });
    server.listen(port, host, () => {
      console.log(`Bitizen server: http://${host}:${port}`);
      console.log(`Example: http://${host}:${port}/avatars/${AVATAR_VERSION}/user-123.png?style=rich`);
    });
  }
}
