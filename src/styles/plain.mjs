import { createHmac } from "node:crypto";
import { deflateSync } from "node:zlib";

import {
  AVATAR_VERSION,
  BACKGROUND,
  BACKGROUND_GRID,
  CANVAS,
  CENTER_X,
  DEFAULT_SIZE,
  EYE,
  GRID,
  MAX_SIZE,
  MIN_SIZE,
  MODULE_SIZE,
  MODULE_STEP,
  PALETTE,
  assertAvatarDescriptor,
  descriptorFromSeed,
  normalizeSize,
  originYFor,
  position,
  renderAvatarSvg,
  requireNonEmptyString,
} from "../core/plain.mjs";

export {
  AVATAR_VERSION,
  DEFAULT_SIZE,
  MAX_SIZE,
  MIN_SIZE,
  PALETTE,
  assertAvatarDescriptor,
  descriptorFromSeed,
  normalizeSize,
  renderAvatarSvg,
};

function seedFor(userId, secret) {
  requireNonEmptyString(userId, "userId");
  requireNonEmptyString(secret, "secret");

  if (userId.length > 256) {
    throw new RangeError("userId must be at most 256 characters");
  }
  if (secret.length < 16) {
    throw new RangeError("secret must contain at least 16 characters");
  }

  return createHmac("sha256", secret)
    .update(AVATAR_VERSION)
    .update("\0")
    .update(userId)
    .digest();
}


export function createAvatarDescriptor(userId, { secret } = {}) {
  return descriptorFromSeed(seedFor(userId, secret));
}

export function generateAvatarSvg(userId, options = {}) {
  const descriptor = createAvatarDescriptor(userId, options);
  return renderAvatarSvg(descriptor, options);
}

function hexToRgb(hex) {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function fill(buffer, color) {
  const [red, green, blue] = color;
  for (let offset = 0; offset < buffer.length; offset += 3) {
    buffer[offset] = red;
    buffer[offset + 1] = green;
    buffer[offset + 2] = blue;
  }
}

function blendRgb(background, foreground, amount) {
  return background.map((channel, index) => Math.round(
    channel + (foreground[index] - channel) * amount,
  ));
}

function fillTargetRect(buffer, size, left, top, width, height, color) {
  const right = Math.min(size, left + width);
  const bottom = Math.min(size, top + height);
  const [red, green, blue] = color;

  for (let row = Math.max(0, top); row < bottom; row += 1) {
    for (let column = Math.max(0, left); column < right; column += 1) {
      const offset = (row * size + column) * 3;
      buffer[offset] = red;
      buffer[offset + 1] = green;
      buffer[offset + 2] = blue;
    }
  }
}

function fillRect(buffer, size, x, y, width, height, color) {
  const scale = size / CANVAS;
  const left = Math.max(0, Math.floor(x * scale));
  const top = Math.max(0, Math.floor(y * scale));
  const right = Math.min(size, Math.max(left + 1, Math.ceil((x + width) * scale)));
  const bottom = Math.min(size, Math.max(top + 1, Math.ceil((y + height) * scale)));
  const [red, green, blue] = color;

  for (let row = top; row < bottom; row += 1) {
    for (let column = left; column < right; column += 1) {
      const offset = (row * size + column) * 3;
      buffer[offset] = red;
      buffer[offset + 1] = green;
      buffer[offset + 2] = blue;
    }
  }
}

function drawModules(buffer, size, pixels, originY, color) {
  for (const [column, row] of pixels) {
    const [x, y] = position(column, row, originY);
    fillRect(buffer, size, x, y, MODULE_SIZE, MODULE_SIZE, color);
  }
}

/** Eyes are drawn from the module center so the pair stays mirrored even at 32×32. */
function drawEyes(buffer, size, eyes, originY, color) {
  const scale = size / CANVAS;
  const targetSize = Math.max(1, Math.round(MODULE_SIZE * scale));
  for (const [column, row] of eyes) {
    const centerX = Math.round((CENTER_X + column * MODULE_STEP) * scale - 0.5);
    const centerY = Math.round((originY + row * MODULE_STEP) * scale - 0.5);
    fillTargetRect(
      buffer,
      size,
      centerX - Math.floor(targetSize / 2),
      centerY - Math.floor(targetSize / 2),
      targetSize,
      targetSize,
      color,
    );
  }
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xEDB88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xFFFFFFFF;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.allocUnsafe(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.allocUnsafe(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function encodePng(rgb, size) {
  const rowLength = size * 3;
  const raw = Buffer.allocUnsafe((rowLength + 1) * size);

  for (let row = 0; row < size; row += 1) {
    const rawOffset = row * (rowLength + 1);
    raw[rawOffset] = 0;
    rgb.copy(raw, rawOffset + 1, row * rowLength, (row + 1) * rowLength);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 2;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw, { level: 6 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

export function renderAvatarPng(descriptor, { size = DEFAULT_SIZE } = {}) {
  assertAvatarDescriptor(descriptor);
  size = normalizeSize(size);
  const rgb = Buffer.allocUnsafe(size * size * 3);
  const backgroundColor = hexToRgb(BACKGROUND);
  fill(rgb, backgroundColor);

  const scale = size / CANVAS;
  const gridWidth = Math.max(1, Math.round(2 * scale));
  const gridCoverage = Math.min(1, (2 * scale) / gridWidth);
  const gridColor = blendRgb(backgroundColor, hexToRgb(GRID), gridCoverage);
  for (let coordinate = 0; coordinate < CANVAS; coordinate += BACKGROUND_GRID) {
    const target = Math.round(coordinate * scale);
    fillTargetRect(rgb, size, target, 0, gridWidth, size, gridColor);
    fillTargetRect(rgb, size, 0, target, size, gridWidth, gridColor);
  }

  const originY = originYFor(descriptor.rows);
  drawModules(rgb, size, descriptor.pixels, originY, hexToRgb(descriptor.accent));
  drawEyes(rgb, size, descriptor.eyes, originY, hexToRgb(EYE));

  return encodePng(rgb, size);
}

export function generateAvatarPng(userId, options = {}) {
  const descriptor = createAvatarDescriptor(userId, options);
  return renderAvatarPng(descriptor, options);
}

export function avatarEtag(descriptor, format, size) {
  assertAvatarDescriptor(descriptor);
  if (format !== "svg" && format !== "png") {
    throw new RangeError("format must be svg or png");
  }
  return `"avatar-${descriptor.version}-${descriptor.fingerprint}-${format}-${normalizeSize(size)}"`;
}
