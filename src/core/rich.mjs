import { sha256, toHex } from "../internal/sha256.mjs";

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
const MODULE_STEP = 52;
const MODULE_SIZE = 42;
const HALF_MODULE = MODULE_SIZE / 2;
const CENTER_X = CANVAS / 2;

const BACKGROUND = "#080A0E";
const EYE = "#F4F1E7";
const NEUTRAL = "#98A1AE";

const MAX_ROWS = 24;
const MAX_COLUMN = 12;
const MIN_BODY_PIXELS = 22;

const HEAD_PARTS = new Set(["head", "ear", "antenna"]);
const LIMB_PARTS = new Set(["arm", "leg"]);

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

/**
 * Deterministic byte stream derived from the seed: the figure has more
 * parameters than the 32 bytes of an HMAC, so the buffer is extended by
 * hashing itself.
 */
function createSeedReader(seed) {
  let buffer = seed;
  let offset = 0;

  const byte = () => {
    if (offset >= buffer.length) {
      buffer = sha256(buffer);
      offset = 0;
    }
    offset += 1;
    return buffer[offset - 1];
  };

  return {
    byte,
    int: (bound) => byte() % bound,
    pick: (values) => values[byte() % values.length],
    /** True in roughly `percent` percent of cases. */
    chance: (percent) => byte() * 100 < percent * 256,
    sign: () => (byte() % 2 === 0 ? 1 : -1),
  };
}

function pixelKey(column, row) {
  return `${column},${row}`;
}

function parseKey(key) {
  return key.split(",").map(Number);
}

function decodePixels(keys) {
  return [...keys]
    .map(parseKey)
    .sort(([columnA, rowA], [columnB, rowB]) => rowA - rowB || columnA - columnB);
}

function hexToRgb(hex) {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function rgbToHex([red, green, blue]) {
  return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function mix(hex, target, amount) {
  const base = hexToRgb(hex);
  const towards = hexToRgb(target);
  return rgbToHex(base.map((channel, index) => Math.round(
    channel + (towards[index] - channel) * amount,
  )));
}

const lighten = (hex, amount = 0.34) => mix(hex, "#FFFFFF", amount);
const darken = (hex, amount = 0.42) => mix(hex, "#000000", amount);

/**
 * Assembles a bot: head, antenna, neck, torso, arms, legs, body cutouts and
 * the color layout. The two sides are read independently, so the figure may
 * be asymmetric, yet it always stays a single connected shape.
 */
function buildBot(reader) {
  const headHalf = reader.pick([2, 3, 4]);
  const headHeight = reader.pick([3, 4, 5]);
  const headStyle = reader.int(5);
  // Weights are tuned so that roughly half of the bots stay mirrored.
  const earsMode = reader.pick([0, 0, 1, 1, 1, 2, 3]);
  const antennaStyle = reader.pick([0, 1, 1, 2, 2, 3, 3, 4]);
  const antennaSide = reader.sign();
  const antennaLength = 1 + reader.int(3);
  const neckHeight = reader.int(3);
  const neckHalf = reader.int(2);
  const torsoHalf = Math.max(headHalf - 1, reader.pick([2, 3, 4]));
  const torsoHeight = reader.pick([3, 4, 5]);
  const torsoShape = reader.int(3);
  const hasShoulders = reader.chance(45);
  const mirroredArms = reader.chance(80);
  const rightArm = { style: reader.int(4), length: 2 + reader.int(3), drop: reader.int(2) };
  const leftArm = mirroredArms
    ? rightArm
    : { style: reader.int(4), length: 2 + reader.int(3), drop: reader.int(2) };
  const legHeight = 2 + reader.int(3);
  const legWidth = 1 + reader.int(2);
  const legGapRaw = reader.int(2);
  const feetStyle = reader.int(3);
  const eyeInset = 1 + reader.int(2);
  const hasVisor = reader.chance(45);
  const mouthStyle = reader.int(4);
  const chestCut = reader.int(3);
  const scheme = reader.int(5);
  const hasBelt = reader.chance(40);
  const panelStyle = reader.int(3);
  const pauldronMode = reader.int(4);

  const parts = new Map();
  const put = (column, row, part) => parts.set(pixelKey(column, row), part);
  const putRow = (half, row, part) => {
    for (let column = -half; column <= half; column += 1) put(column, row, part);
  };
  const drop = (column, row) => parts.delete(pixelKey(column, row));
  const eyeRow = headHeight >= 5 ? 2 : 1;

  // Head.
  for (let row = 0; row < headHeight; row += 1) putRow(headHalf, row, "head");
  if (headStyle === 1) {
    for (const row of [0, headHeight - 1]) {
      drop(headHalf, row);
      drop(-headHalf, row);
    }
  } else if (headStyle === 2) {
    drop(headHalf, 0);
    drop(-headHalf, 0);
  } else if (headStyle === 3) {
    drop(headHalf, headHeight - 1);
    drop(-headHalf, headHeight - 1);
  } else if (headStyle === 4) {
    putRow(Math.max(1, headHalf - 1), -1, "head");
  }

  // Ears: both sides, left only or right only.
  if (earsMode === 1 || earsMode === 2) put(headHalf + 1, eyeRow, "ear");
  if (earsMode === 1 || earsMode === 3) put(-(headHalf + 1), eyeRow, "ear");

  // Antenna: its rows go negative, the figure is normalized further down.
  const headTop = headStyle === 4 ? -1 : 0;
  const antennaColumn = Math.max(1, headHalf - 1);
  if (antennaStyle === 1) {
    for (let row = 1; row <= antennaLength; row += 1) put(0, headTop - row, "antenna");
  } else if (antennaStyle === 2) {
    for (let row = 1; row <= antennaLength; row += 1) {
      put(antennaColumn, headTop - row, "antenna");
      put(-antennaColumn, headTop - row, "antenna");
    }
  } else if (antennaStyle === 3) {
    for (let row = 1; row <= antennaLength; row += 1) put(0, headTop - row, "antenna");
    put(1, headTop - antennaLength, "antenna");
    put(-1, headTop - antennaLength, "antenna");
  } else if (antennaStyle === 4) {
    // A single side antenna: the main source of silhouette asymmetry.
    for (let row = 1; row <= antennaLength; row += 1) {
      put(antennaSide * antennaColumn, headTop - row, "antenna");
    }
    put(antennaSide * (antennaColumn + 1), headTop - antennaLength, "antenna");
  }

  // Neck.
  const torsoTop = headHeight + neckHeight;
  for (let row = headHeight; row < torsoTop; row += 1) putRow(neckHalf, row, "neck");

  // Torso.
  const torsoBottom = torsoTop + torsoHeight - 1;
  const halfAt = (row) => {
    const offset = row - torsoTop;
    if (hasShoulders && offset === 0) return torsoHalf + 1;
    if (torsoShape === 1 && offset >= Math.ceil(torsoHeight / 2)) return Math.max(1, torsoHalf - 1);
    if (torsoShape === 2 && offset === Math.floor(torsoHeight / 2)) return Math.max(1, torsoHalf - 1);
    return torsoHalf;
  };
  for (let row = torsoTop; row <= torsoBottom; row += 1) putRow(halfAt(row), row, "torso");

  // Arms: each side is built on its own.
  const shoulderRows = {};
  const buildArm = (side, arm) => {
    const shoulderRow = Math.min(torsoTop + arm.drop, torsoBottom);
    const attach = halfAt(shoulderRow) + 1;
    shoulderRows[side] = { shoulderRow, attach };

    if (arm.style === 0) {
      for (let row = shoulderRow; row < shoulderRow + arm.length; row += 1) {
        put(side * attach, row, "arm");
      }
    } else if (arm.style === 1) {
      // Very long horizontal arms eat the silhouette, so the reach is capped.
      const reach = Math.min(arm.length, 3);
      for (let column = attach; column < attach + reach; column += 1) {
        put(side * column, shoulderRow, "arm");
      }
    } else if (arm.style === 2) {
      put(side * attach, shoulderRow, "arm");
      for (let row = shoulderRow; row > shoulderRow - arm.length; row -= 1) {
        put(side * (attach + 1), row, "arm");
      }
    } else {
      put(side * attach, shoulderRow, "arm");
      for (let row = shoulderRow; row < shoulderRow + arm.length; row += 1) {
        put(side * (attach + 1), row, "arm");
      }
    }
  };
  buildArm(1, rightArm);
  buildArm(-1, leftArm);

  // Legs.
  const bottomHalf = halfAt(torsoBottom);
  const width = Math.min(legWidth, bottomHalf);
  const gap = Math.min(legGapRaw, bottomHalf - width);
  const legInner = gap + 1;
  const legOuter = gap + width;
  const legBottom = torsoBottom + legHeight;
  for (let column = legInner; column <= legOuter; column += 1) {
    for (let row = torsoBottom + 1; row <= legBottom; row += 1) {
      put(column, row, "leg");
      put(-column, row, "leg");
    }
  }
  if (feetStyle >= 1) {
    put(legOuter + 1, legBottom, "leg");
    put(-(legOuter + 1), legBottom, "leg");
  }
  if (feetStyle === 2 && legInner > 1) {
    put(legInner - 1, legBottom, "leg");
    put(-(legInner - 1), legBottom, "leg");
  }

  // Body cutouts: applied one at a time and rolled back if they split the figure.
  const cutouts = [];
  if (hasVisor && headHalf >= 2) {
    const visor = [];
    for (let column = -(headHalf - 1); column <= headHalf - 1; column += 1) {
      visor.push([column, eyeRow]);
    }
    cutouts.push(visor);
  }
  // On a narrow head a visor plus a mouth would leave nothing but horns.
  const mouthRow = headHeight - 1;
  const mouth = headHalf === 2 && hasVisor ? 0 : mouthStyle;
  if (mouth === 1) {
    cutouts.push([[-1, mouthRow], [0, mouthRow], [1, mouthRow]]);
  } else if (mouth === 2) {
    cutouts.push([[-1, mouthRow], [1, mouthRow]]);
  } else if (mouth === 3 && headHalf >= 3) {
    cutouts.push([[-2, mouthRow], [0, mouthRow], [2, mouthRow]]);
  }
  const chestRow = torsoTop + Math.floor(torsoHeight / 2);
  if (chestCut === 1) {
    cutouts.push([[0, chestRow]]);
  } else if (chestCut === 2 && torsoHalf >= 2) {
    cutouts.push([[-1, chestRow], [0, chestRow], [1, chestRow]]);
  }

  for (const cutout of cutouts) {
    const removed = [];
    for (const [column, row] of cutout) {
      const key = pixelKey(column, row);
      const part = parts.get(key);
      if (part !== undefined) {
        removed.push([key, part]);
        parts.delete(key);
      }
    }
    if (!isConnected([...parts.keys()])) {
      for (const [key, part] of removed) parts.set(key, part);
    }
  }

  // Color layout.
  const trim = new Map();
  if (hasBelt && torsoHeight >= 3) {
    const beltRow = torsoBottom - 1;
    for (let column = -halfAt(beltRow); column <= halfAt(beltRow); column += 1) {
      trim.set(pixelKey(column, beltRow), "trim");
    }
  }
  if (panelStyle >= 1) {
    const panelRow = torsoTop + (torsoHeight >= 4 ? 1 : 0);
    const panelHalf = panelStyle === 2 && torsoHalf >= 3 ? 1 : 0;
    for (let column = -panelHalf; column <= panelHalf; column += 1) {
      trim.set(pixelKey(column, panelRow), "trim");
    }
  }
  if (pauldronMode >= 1) {
    for (const side of pauldronMode === 1 ? [1, -1] : [pauldronMode === 2 ? 1 : -1]) {
      const { shoulderRow, attach } = shoulderRows[side];
      trim.set(pixelKey(side * (attach - 1), shoulderRow), "trim");
    }
  }

  const rows = [...parts.keys()].map((key) => parseKey(key)[1]);
  const rowShift = Math.min(...rows);
  const buckets = new Map();
  for (const [key, part] of parts) {
    const [column, row] = parseKey(key);
    const role = trim.has(key) ? "trim" : part;
    if (!buckets.has(role)) buckets.set(role, []);
    buckets.get(role).push([column, row - rowShift]);
  }

  return {
    buckets,
    scheme,
    eyes: [
      [-Math.max(1, headHalf - eyeInset), eyeRow - rowShift],
      [Math.max(1, headHalf - eyeInset), eyeRow - rowShift],
    ],
  };
}

/** Five color schemes: mono plus four two-color ones. */
function paletteFor(accent, scheme) {
  const light = lighten(accent);
  const dark = darken(accent);

  return (role) => {
    if (role === "trim") return scheme === 1 ? dark : light;
    if (scheme === 1) return HEAD_PARTS.has(role) ? light : accent;
    if (scheme === 2) return LIMB_PARTS.has(role) ? dark : accent;
    if (scheme === 3) return role === "torso" || role === "neck" ? NEUTRAL : accent;
    if (scheme === 4) return HEAD_PARTS.has(role) ? accent : NEUTRAL;
    return accent;
  };
}

function isConnected(keys) {
  if (keys.length === 0) return false;
  const remaining = new Set(keys);
  const [first] = remaining;
  const queue = [first];
  remaining.delete(first);

  while (queue.length > 0) {
    const [column, row] = parseKey(queue.pop());
    for (let deltaRow = -1; deltaRow <= 1; deltaRow += 1) {
      for (let deltaColumn = -1; deltaColumn <= 1; deltaColumn += 1) {
        if (deltaColumn === 0 && deltaRow === 0) continue;
        const neighbor = pixelKey(column + deltaColumn, row + deltaRow);
        if (remaining.delete(neighbor)) queue.push(neighbor);
      }
    }
  }

  return remaining.size === 0;
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

  if (!Array.isArray(descriptor.layers) || descriptor.layers.length === 0) {
    throw new Error("descriptor must contain at least one color layer");
  }

  const keys = new Set();
  for (const layer of descriptor.layers) {
    if (!layer || !/^#[0-9A-F]{6}$/.test(layer.color)) {
      throw new Error("layer color must be uppercase hex");
    }
    if (!Array.isArray(layer.pixels) || layer.pixels.length === 0) {
      throw new Error("layer must contain pixels");
    }
    for (const [column, row] of layer.pixels) {
      if (!Number.isInteger(column) || !Number.isInteger(row)) {
        throw new Error("body coordinates must be integers");
      }
      const key = pixelKey(column, row);
      if (keys.has(key)) {
        throw new Error("layers must not overlap");
      }
      keys.add(key);
    }
  }

  if (keys.size < MIN_BODY_PIXELS) {
    throw new Error(`descriptor must contain at least ${MIN_BODY_PIXELS} body pixels`);
  }

  const pixels = decodePixels(keys);
  const columns = pixels.map(([column]) => column);
  const rows = pixels.map(([, row]) => row);

  if (Math.min(...rows) !== 0 || Math.max(...rows) >= MAX_ROWS) {
    throw new Error("body rows exceed their allotted area");
  }

  if (Math.max(...columns.map(Math.abs)) > MAX_COLUMN) {
    throw new Error("body columns exceed their allotted area");
  }

  if (!Number.isInteger(descriptor.rows) || descriptor.rows !== Math.max(...rows) + 1) {
    throw new Error("descriptor rows must match the body bounds");
  }

  if (
    !Array.isArray(descriptor.columns)
    || descriptor.columns.length !== 2
    || descriptor.columns[0] !== Math.min(...columns)
    || descriptor.columns[1] !== Math.max(...columns)
  ) {
    throw new Error("descriptor columns must match the body bounds");
  }

  if (!Array.isArray(descriptor.eyes) || descriptor.eyes.length !== 2) {
    throw new Error("descriptor must contain exactly two eyes");
  }

  const [[leftColumn, leftRow], [rightColumn, rightRow]] = descriptor.eyes;
  if (leftColumn !== -rightColumn || leftRow !== rightRow) {
    throw new Error("eyes must be a mirror pair on the same row");
  }
  if (leftRow < 0 || leftRow >= descriptor.rows) {
    throw new Error("eyes must sit inside the figure");
  }

  if (!isConnected([...keys])) {
    throw new Error("generated bot must be a single connected shape");
  }

  return descriptor;
}

/** The figure may be asymmetric, so it is centered on its own bounding box. */
function frameFor(descriptor) {
  const height = (descriptor.rows - 1) * MODULE_STEP + MODULE_SIZE;
  const [minColumn, maxColumn] = descriptor.columns;
  return {
    originY: Math.round((CANVAS - height) / 2 + HALF_MODULE),
    columnShift: (minColumn + maxColumn) / 2,
  };
}

function position(column, row, { originY, columnShift }) {
  return [
    CENTER_X + (column - columnShift) * MODULE_STEP - HALF_MODULE,
    originY + row * MODULE_STEP - HALF_MODULE,
  ];
}

function moduleRectangles(pixels, frame) {
  return pixels
    .map(([column, row]) => {
      const [x, y] = position(column, row, frame);
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
  const frame = frameFor(descriptor);

  const body = descriptor.layers
    .map((layer) => `  <g fill="${layer.color}" shape-rendering="crispEdges">
${moduleRectangles(layer.pixels, frame)}
  </g>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${CANVAS} ${CANVAS}" role="img" aria-labelledby="title">
  <title id="title">${escapeXml(title)}</title>
  <rect width="${CANVAS}" height="${CANVAS}" fill="${BACKGROUND}"/>
${body}
  <g fill="${EYE}" shape-rendering="crispEdges">
${moduleRectangles(descriptor.eyes, frame)}
  </g>
</svg>
`;
}

/** Builds a descriptor from a ready 32-byte seed: works in Node and in a browser. */
export function descriptorFromSeed(seed) {
  const { buckets, scheme, eyes } = buildBot(createSeedReader(seed));
  const accent = PALETTE[seed[0] % PALETTE.length];
  const colorFor = paletteFor(accent, scheme);

  const byColor = new Map();
  for (const [role, pixels] of buckets) {
    const color = colorFor(role);
    if (!byColor.has(color)) byColor.set(color, []);
    byColor.get(color).push(...pixels);
  }

  const layers = [...byColor].map(([color, pixels]) => ({
    color,
    pixels: pixels.sort(([columnA, rowA], [columnB, rowB]) => rowA - rowB || columnA - columnB),
  }));

  const allPixels = layers.flatMap((layer) => layer.pixels);
  const columns = allPixels.map(([column]) => column);
  const descriptor = {
    version: AVATAR_VERSION,
    fingerprint: toHex(seed.subarray(0, 16)),
    accent,
    scheme,
    layers,
    eyes,
    rows: Math.max(...allPixels.map(([, row]) => row)) + 1,
    columns: [Math.min(...columns), Math.max(...columns)],
  };

  assertAvatarDescriptor(descriptor);
  return Object.freeze({
    ...descriptor,
    layers: Object.freeze(layers.map((layer) => Object.freeze({
      color: layer.color,
      pixels: Object.freeze(layer.pixels.map((pixel) => Object.freeze(pixel))),
    }))),
    eyes: Object.freeze(eyes.map((pixel) => Object.freeze(pixel))),
    columns: Object.freeze(descriptor.columns),
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
  frameFor,
  hexToRgb,
  position,
};
