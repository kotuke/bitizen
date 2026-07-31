import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { deflateSync, inflateSync } from "node:zlib";

import { generateAvatarPng } from "../src/index.mjs";

const SECRET = process.env.AVATAR_SECRET ?? "contact-sheet-secret-not-for-production";
const CELL = 160;
const COLUMNS = 8;
const ROWS_PER_STYLE = 2;
const DIVIDER = "#2A2F37";

function decodePng(png) {
  const width = png.readUInt32BE(16);
  const compressed = [];
  let offset = 8;

  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT") compressed.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }

  const raw = inflateSync(Buffer.concat(compressed));
  const rowLength = width * 3;
  const rgb = Buffer.allocUnsafe(rowLength * width);
  for (let row = 0; row < width; row += 1) {
    raw.copy(rgb, row * rowLength, row * (rowLength + 1) + 1, (row + 1) * (rowLength + 1));
  }
  return { width, rgb };
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
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
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

function encodePng(rgb, width, height) {
  const rowLength = width * 3;
  const raw = Buffer.allocUnsafe((rowLength + 1) * height);
  for (let row = 0; row < height; row += 1) {
    raw[row * (rowLength + 1)] = 0;
    rgb.copy(raw, row * (rowLength + 1) + 1, row * rowLength, (row + 1) * rowLength);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function blit(sheet, sheetWidth, tile, tileWidth, left, top) {
  for (let row = 0; row < tileWidth; row += 1) {
    tile.copy(
      sheet,
      ((top + row) * sheetWidth + left) * 3,
      row * tileWidth * 3,
      (row + 1) * tileWidth * 3,
    );
  }
}

const width = CELL * COLUMNS;
const height = CELL * ROWS_PER_STYLE * 2;
const sheet = Buffer.alloc(width * height * 3);

// Top half is plain, bottom half is rich: one image shows both styles.
let index = 0;
for (const style of ["plain", "rich"]) {
  for (let cell = 0; cell < COLUMNS * ROWS_PER_STYLE; cell += 1) {
    const png = generateAvatarPng(`sheet-user-${cell + 1}`, { secret: SECRET, style, size: CELL });
    const { rgb } = decodePng(png);
    const column = cell % COLUMNS;
    const row = Math.floor(index / COLUMNS);
    blit(sheet, width, rgb, CELL, column * CELL, row * CELL);
    index += 1;
  }
}

const dividerTop = CELL * ROWS_PER_STYLE;
const [red, green, blue] = [1, 3, 5].map((offset) => Number.parseInt(DIVIDER.slice(offset, offset + 2), 16));
for (let row = dividerTop - 1; row <= dividerTop; row += 1) {
  for (let column = 0; column < width; column += 1) {
    const offset = (row * width + column) * 3;
    sheet[offset] = red;
    sheet[offset + 1] = green;
    sheet[offset + 2] = blue;
  }
}

const outputPath = join(dirname(fileURLToPath(import.meta.url)), "..", "preview.png");
await writeFile(outputPath, encodePng(sheet, width, height));
console.log(`Contact sheet written: ${outputPath} (${width}×${height})`);
