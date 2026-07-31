import { toHex } from "../internal/sha256.mjs";

export const AVATAR_VERSION = "v1";
export const DEFAULT_SIZE = 256;
export const MIN_SIZE = 32;
export const MAX_SIZE = 2048;

export const PALETTE = Object.freeze([
  "#FF9B3D",
  "#43C7E8",
  "#9B7BFF",
  "#FFD34E",
  "#49D17D",
  "#FF6B57",
  "#5B8CFF",
  "#2EC4B6",
  "#70D98B",
  "#E85D75",
  "#F15BB5",
  "#4CC9F0",
]);

const CANVAS = 1254;
const BACKGROUND_GRID = 114;
const MODULE_STEP = 57;
const MODULE_SIZE = 46;
const HALF_MODULE = MODULE_SIZE / 2;
const CENTER_X = CANVAS / 2;

const BACKGROUND = "#080A0E";
const GRID = "#20242B";
const EYE = "#F4F1E7";

const MAX_ROWS = 20;
const MAX_COLUMN = 10;
const MIN_BODY_PIXELS = 30;

function requireNonEmptyString(value, name) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
}

export function normalizeSize(value = DEFAULT_SIZE) {
  const size = Number(value);
  if (!Number.isInteger(size) || size < MIN_SIZE || size > MAX_SIZE) {
    throw new RangeError(`size must be an integer from ${MIN_SIZE} to ${MAX_SIZE}`);
  }
  return size;
}

function pixelKey(column, row) {
  return `${column},${row}`;
}

function addPixel(pixels, column, row) {
  pixels.add(pixelKey(column, row));
}

/** Adds a pixel together with its mirror: the figure is symmetric by construction. */
function addMirrored(pixels, column, row) {
  addPixel(pixels, column, row);
  addPixel(pixels, -column, row);
}

function addRow(pixels, half, row) {
  for (let column = -half; column <= half; column += 1) {
    addPixel(pixels, column, row);
  }
}

function addColumn(pixels, column, fromRow, toRow) {
  for (let row = fromRow; row <= toRow; row += 1) {
    addMirrored(pixels, column, row);
  }
}

function decodePixels(pixels) {
  return [...pixels]
    .map((pixel) => pixel.split(",").map(Number))
    .sort(([columnA, rowA], [columnB, rowB]) => rowA - rowB || columnA - columnB);
}

/**
 * Assembles a citizen from the seed: head, antenna, neck, torso, arms and
 * legs. Every part touches the previous one, so the figure stays a single
 * connected shape, and mirrored insertion keeps it symmetric.
 */
function generateBotParts(seed) {
  const pick = (index, values) => values[seed[index] % values.length];

  const headHalf = pick(1, [2, 3, 4]);
  const headHeight = pick(2, [3, 4, 5]);
  const headStyle = seed[3] % 4;
  const antennaStyle = seed[4] % 4;
  const antennaLength = 1 + (seed[5] % 2);
  const neckHeight = seed[6] % 3;
  const neckHalf = seed[7] % 2;
  const torsoHalf = Math.max(headHalf - 1, pick(8, [2, 3, 4]));
  const torsoHeight = pick(9, [3, 4, 5]);
  const torsoShape = seed[10] % 3;
  const armStyle = seed[11] % 4;
  const armLength = 2 + (seed[12] % 3);
  const shoulderDrop = seed[13] % 2;
  const legHeight = 2 + (seed[14] % 3);
  const legWidthRaw = 1 + (seed[15] % 2);
  const legGapRaw = seed[16] % 2;
  const hasFeet = seed[17] % 2 === 1;
  const hasEars = seed[18] % 2 === 1;
  const eyeInset = 1 + (seed[19] % 2);
  const hasShoulders = seed[20] % 2 === 1;

  const body = new Set();
  const eyeRow = headHeight >= 5 ? 2 : 1;

  // Head.
  for (let row = 0; row < headHeight; row += 1) {
    addRow(body, headHalf, row);
  }
  if (headStyle === 1) {
    for (const row of [0, headHeight - 1]) {
      body.delete(pixelKey(headHalf, row));
      body.delete(pixelKey(-headHalf, row));
    }
  } else if (headStyle === 2) {
    body.delete(pixelKey(headHalf, 0));
    body.delete(pixelKey(-headHalf, 0));
  } else if (headStyle === 3) {
    body.delete(pixelKey(headHalf, headHeight - 1));
    body.delete(pixelKey(-headHalf, headHeight - 1));
  }
  if (hasEars) {
    addMirrored(body, headHalf + 1, eyeRow);
  }

  // Antenna: its rows go negative, the whole figure is normalized further down.
  if (antennaStyle === 1) {
    addColumn(body, 0, -antennaLength, -1);
  } else if (antennaStyle === 2) {
    addColumn(body, Math.max(1, headHalf - 1), -antennaLength, -1);
  } else if (antennaStyle === 3) {
    addColumn(body, 0, -antennaLength, -1);
    addMirrored(body, 1, -antennaLength);
  }

  // Neck.
  const torsoTop = headHeight + neckHeight;
  for (let row = headHeight; row < torsoTop; row += 1) {
    addRow(body, neckHalf, row);
  }

  // Torso: a rectangle, a taper towards the bottom or a waist in the middle.
  const torsoBottom = torsoTop + torsoHeight - 1;
  const halfAt = (row) => {
    const offset = row - torsoTop;
    if (hasShoulders && offset === 0) {
      return torsoHalf + 1;
    }
    if (torsoShape === 1 && offset >= Math.ceil(torsoHeight / 2)) {
      return Math.max(1, torsoHalf - 1);
    }
    if (torsoShape === 2 && offset === Math.floor(torsoHeight / 2)) {
      return Math.max(1, torsoHalf - 1);
    }
    return torsoHalf;
  };
  for (let row = torsoTop; row <= torsoBottom; row += 1) {
    addRow(body, halfAt(row), row);
  }

  // Arms: the shoulder always touches the torso on its own row.
  const shoulderRow = Math.min(torsoTop + shoulderDrop, torsoBottom);
  const attach = halfAt(shoulderRow) + 1;
  if (armStyle === 0) {
    addColumn(body, attach, shoulderRow, shoulderRow + armLength - 1);
  } else if (armStyle === 1) {
    for (let column = attach; column < attach + armLength; column += 1) {
      addMirrored(body, column, shoulderRow);
    }
  } else if (armStyle === 2) {
    addMirrored(body, attach, shoulderRow);
    addColumn(body, attach + 1, shoulderRow - armLength, shoulderRow);
  } else {
    addMirrored(body, attach, shoulderRow);
    addColumn(body, attach + 1, shoulderRow, shoulderRow + armLength - 1);
  }

  // Legs: both rest against the bottom row of the torso.
  const bottomHalf = halfAt(torsoBottom);
  const legWidth = Math.min(legWidthRaw, bottomHalf);
  const legGap = Math.min(legGapRaw, bottomHalf - legWidth);
  const legInner = legGap + 1;
  const legOuter = legGap + legWidth;
  const legBottom = torsoBottom + legHeight;
  for (let column = legInner; column <= legOuter; column += 1) {
    addColumn(body, column, torsoBottom + 1, legBottom);
  }
  if (hasFeet) {
    addMirrored(body, legOuter + 1, legBottom);
  }

  // Normalization: the topmost point of the figure becomes row zero.
  const decoded = decodePixels(body);
  const rowShift = Math.min(...decoded.map(([, row]) => row));
  const pixels = decoded.map(([column, row]) => [column, row - rowShift]);
  const eyeColumn = Math.max(1, headHalf - eyeInset);
  const eyes = [
    [-eyeColumn, eyeRow - rowShift],
    [eyeColumn, eyeRow - rowShift],
  ];

  return {
    pixels,
    eyes,
    rows: Math.max(...pixels.map(([, row]) => row)) + 1,
  };
}

function assertConnected(pixels) {
  const remaining = new Set(pixels.map(([column, row]) => pixelKey(column, row)));
  const [first] = remaining;
  const queue = [first];
  remaining.delete(first);

  while (queue.length > 0) {
    const current = queue.shift();
    const [column, row] = current.split(",").map(Number);

    for (let deltaRow = -1; deltaRow <= 1; deltaRow += 1) {
      for (let deltaColumn = -1; deltaColumn <= 1; deltaColumn += 1) {
        if (deltaColumn === 0 && deltaRow === 0) continue;
        const neighbor = pixelKey(column + deltaColumn, row + deltaRow);
        if (remaining.delete(neighbor)) queue.push(neighbor);
      }
    }
  }

  if (remaining.size !== 0) {
    throw new Error("generated bot must be a single connected shape");
  }
}

export function assertAvatarDescriptor(descriptor) {
  if (!descriptor || typeof descriptor !== "object") {
    throw new TypeError("descriptor must be an object");
  }

  if (descriptor.version !== AVATAR_VERSION) {
    throw new Error("descriptor uses an unsupported avatar version");
  }

  if (
    typeof descriptor.fingerprint !== "string"
    || !/^[0-9a-f]{32}$/.test(descriptor.fingerprint)
  ) {
    throw new Error("descriptor fingerprint must be 128-bit lowercase hex");
  }

  if (!PALETTE.includes(descriptor.accent)) {
    throw new Error("descriptor uses an unknown accent color");
  }

  if (!Array.isArray(descriptor.pixels) || descriptor.pixels.length < MIN_BODY_PIXELS) {
    throw new Error(`descriptor must contain at least ${MIN_BODY_PIXELS} body pixels`);
  }

  const keys = new Set(descriptor.pixels.map(([column, row]) => pixelKey(column, row)));
  const columns = descriptor.pixels.map(([column]) => column);
  const rows = descriptor.pixels.map(([, row]) => row);

  if (min(columns) + max(columns) !== 0) {
    throw new Error("body bounds must be centered on the vertical axis");
  }

  if (min(rows) !== 0 || max(rows) >= MAX_ROWS) {
    throw new Error("body rows exceed their allotted area");
  }

  if (max(columns) > MAX_COLUMN) {
    throw new Error("body columns exceed their allotted area");
  }

  for (const [column, row] of descriptor.pixels) {
    if (!Number.isInteger(column) || !Number.isInteger(row)) {
      throw new Error("body coordinates must be integers");
    }
    if (column !== 0 && !keys.has(pixelKey(-column, row))) {
      throw new Error("body must be bilaterally symmetric");
    }
  }

  if (!Array.isArray(descriptor.eyes) || descriptor.eyes.length !== 2) {
    throw new Error("descriptor must contain exactly two eyes");
  }

  const [[leftColumn, leftRow], [rightColumn, rightRow]] = descriptor.eyes;
  if (leftColumn !== -rightColumn || leftRow !== rightRow) {
    throw new Error("eyes must be a mirror pair on the same row");
  }

  for (const [column, row] of descriptor.eyes) {
    if (!keys.has(pixelKey(column, row))) {
      throw new Error("eyes must sit inside the body");
    }
  }

  if (!Number.isInteger(descriptor.rows) || descriptor.rows !== max(rows) + 1) {
    throw new Error("descriptor rows must match the body bounds");
  }

  assertConnected(descriptor.pixels);
  return descriptor;
}

function min(values) {
  return Math.min(...values);
}

function max(values) {
  return Math.max(...values);
}

/** The figure is centered on the canvas: bots differ in height. */
function originYFor(rows) {
  const height = (rows - 1) * MODULE_STEP + MODULE_SIZE;
  return Math.round((CANVAS - height) / 2 + HALF_MODULE);
}

function position(column, row, originY) {
  return [
    CENTER_X + column * MODULE_STEP - HALF_MODULE,
    originY + row * MODULE_STEP - HALF_MODULE,
  ];
}

function moduleRectangles(pixels, originY) {
  return pixels
    .map(([column, row]) => {
      const [x, y] = position(column, row, originY);
      return `    <rect x="${x}" y="${y}" width="${MODULE_SIZE}" height="${MODULE_SIZE}"/>`;
    })
    .join("\n");
}

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function renderAvatarSvg(descriptor, { size = DEFAULT_SIZE, title = "Generated pixel bot avatar" } = {}) {
  assertAvatarDescriptor(descriptor);
  size = normalizeSize(size);
  requireNonEmptyString(title, "title");
  const patternId = `grid-${descriptor.fingerprint}`;
  const originY = originYFor(descriptor.rows);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${CANVAS} ${CANVAS}" role="img" aria-labelledby="title">
  <title id="title">${escapeXml(title)}</title>
  <defs>
    <pattern id="${patternId}" width="${BACKGROUND_GRID}" height="${BACKGROUND_GRID}" patternUnits="userSpaceOnUse">
      <path d="M ${BACKGROUND_GRID} 0 H 0 V ${BACKGROUND_GRID}" fill="none" stroke="${GRID}" stroke-width="2"/>
    </pattern>
  </defs>
  <rect width="${CANVAS}" height="${CANVAS}" fill="${BACKGROUND}"/>
  <rect width="${CANVAS}" height="${CANVAS}" fill="url(#${patternId})" shape-rendering="crispEdges"/>
  <g fill="${descriptor.accent}" shape-rendering="crispEdges">
${moduleRectangles(descriptor.pixels, originY)}
  </g>
  <g fill="${EYE}" shape-rendering="crispEdges">
${moduleRectangles(descriptor.eyes, originY)}
  </g>
</svg>
`;
}

/** Builds a descriptor from a ready 32-byte seed: works in Node and in a browser. */
export function descriptorFromSeed(seed) {
  const { pixels, eyes, rows } = generateBotParts(seed);
  const descriptor = {
    version: AVATAR_VERSION,
    fingerprint: toHex(seed.subarray(0, 16)),
    accent: PALETTE[seed[0] % PALETTE.length],
    pixels,
    eyes,
    rows,
  };

  assertAvatarDescriptor(descriptor);
  return Object.freeze({
    ...descriptor,
    pixels: Object.freeze(descriptor.pixels.map((pixel) => Object.freeze(pixel))),
    eyes: Object.freeze(descriptor.eyes.map((pixel) => Object.freeze(pixel))),
  });
}

// Layout constants and helpers the Node-side PNG renderer needs.
export {
  CANVAS,
  MODULE_STEP,
  MODULE_SIZE,
  HALF_MODULE,
  CENTER_X,
  BACKGROUND,
  EYE,
  requireNonEmptyString,
  GRID,
  BACKGROUND_GRID,
  originYFor,
  position,
};
