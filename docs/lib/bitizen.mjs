/**
 * Browser entry point: the same figure builders and SVG renderer as in Node,
 * with the HMAC seed computed by the bundled SHA-256 instead of `node:crypto`.
 * PNG output stays Node-only — it needs zlib.
 */
import { hmacSha256, utf8Bytes } from "./sha256.mjs";
import * as plain from "./plain.mjs";
import * as rich from "./rich.mjs";

const STYLES = Object.freeze({ plain, rich });

export const STYLE_NAMES = Object.freeze(Object.keys(STYLES));
export const DEFAULT_STYLE = "plain";
export const AVATAR_VERSION = plain.AVATAR_VERSION;
export const PALETTE = plain.PALETTE;

export function normalizeStyle(value = DEFAULT_STYLE) {
  if (!Object.hasOwn(STYLES, value)) {
    throw new RangeError(`style must be one of ${STYLE_NAMES.join(", ")}`);
  }
  return value;
}

function seedFor(userId, secret) {
  if (typeof userId !== "string" || userId.length === 0) {
    throw new TypeError("userId must be a non-empty string");
  }
  if (typeof secret !== "string" || secret.length < 16) {
    throw new RangeError("secret must contain at least 16 characters");
  }

  const message = new Uint8Array([
    ...utf8Bytes(AVATAR_VERSION),
    0,
    ...utf8Bytes(userId),
  ]);
  return hmacSha256(utf8Bytes(secret), message);
}

export function createAvatarDescriptor(userId, { secret, style = DEFAULT_STYLE } = {}) {
  const normalized = normalizeStyle(style);
  const descriptor = STYLES[normalized].descriptorFromSeed(seedFor(userId, secret));
  return Object.freeze({ ...descriptor, style: normalized });
}

export function renderAvatarSvg(descriptor, options = {}) {
  return STYLES[normalizeStyle(descriptor?.style)].renderAvatarSvg(descriptor, options);
}

export function generateAvatarSvg(userId, options = {}) {
  return renderAvatarSvg(createAvatarDescriptor(userId, options), options);
}
