import * as plain from "./styles/plain.mjs";
import * as rich from "./styles/rich.mjs";

const STYLES = Object.freeze({ plain, rich });

export const STYLE_NAMES = Object.freeze(Object.keys(STYLES));
export const DEFAULT_STYLE = "plain";

export const AVATAR_VERSION = plain.AVATAR_VERSION;
export const DEFAULT_SIZE = plain.DEFAULT_SIZE;
export const MIN_SIZE = plain.MIN_SIZE;
export const MAX_SIZE = plain.MAX_SIZE;
export const PALETTE = plain.PALETTE;

export function normalizeStyle(value = DEFAULT_STYLE) {
  if (!Object.hasOwn(STYLES, value)) {
    throw new RangeError(`style must be one of ${STYLE_NAMES.join(", ")}`);
  }
  return value;
}

export function normalizeSize(value) {
  return plain.normalizeSize(value);
}

function implementationFor(style) {
  return STYLES[normalizeStyle(style)];
}

export function createAvatarDescriptor(userId, { secret, style = DEFAULT_STYLE } = {}) {
  const descriptor = implementationFor(style).createAvatarDescriptor(userId, { secret });
  return Object.freeze({ ...descriptor, style: normalizeStyle(style) });
}

export function assertAvatarDescriptor(descriptor) {
  if (!descriptor || typeof descriptor !== "object") {
    throw new TypeError("descriptor must be an object");
  }
  // A descriptor must declare its style: without it there is no renderer to pick.
  if (typeof descriptor.style !== "string") {
    throw new Error("descriptor must declare a style");
  }
  implementationFor(descriptor.style).assertAvatarDescriptor(descriptor);
  return descriptor;
}

export function renderAvatarSvg(descriptor, options = {}) {
  assertAvatarDescriptor(descriptor);
  return implementationFor(descriptor.style).renderAvatarSvg(descriptor, options);
}

export function renderAvatarPng(descriptor, options = {}) {
  assertAvatarDescriptor(descriptor);
  return implementationFor(descriptor.style).renderAvatarPng(descriptor, options);
}

export function generateAvatarSvg(userId, options = {}) {
  return renderAvatarSvg(createAvatarDescriptor(userId, options), options);
}

export function generateAvatarPng(userId, options = {}) {
  return renderAvatarPng(createAvatarDescriptor(userId, options), options);
}

/** The ETag includes the style: one userId in two styles means two different images. */
export function avatarEtag(descriptor, format, size) {
  assertAvatarDescriptor(descriptor);
  if (format !== "svg" && format !== "png") {
    throw new RangeError("format must be svg or png");
  }
  return `"avatar-${descriptor.version}-${descriptor.style}-${descriptor.fingerprint}-${format}-${normalizeSize(size)}"`;
}
