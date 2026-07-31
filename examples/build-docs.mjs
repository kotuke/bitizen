import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { generateAvatarPng } from "../src/index.mjs";

// Public demo secret: the gallery is meant to be reproducible by anyone.
const SECRET = "bitizen-public-demo-secret-v1";
const PER_STYLE = 50;
const SIZE = 256;

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "docs");
await rm(root, { recursive: true, force: true });
await mkdir(join(root, "gallery"), { recursive: true });
await mkdir(join(root, "lib"), { recursive: true });

// The live demo runs the real generator in the browser, so the browser-safe
// modules are copied next to the page with their import paths flattened.
const src = join(here, "..", "src");
const flatten = (code) => code
  .replaceAll('from "../internal/sha256.mjs"', 'from "./sha256.mjs"')
  .replaceAll('from "./internal/sha256.mjs"', 'from "./sha256.mjs"')
  .replaceAll('from "./core/plain.mjs"', 'from "./plain.mjs"')
  .replaceAll('from "./core/rich.mjs"', 'from "./rich.mjs"');

for (const [from, to] of [
  [join(src, "internal", "sha256.mjs"), "sha256.mjs"],
  [join(src, "core", "plain.mjs"), "plain.mjs"],
  [join(src, "core", "rich.mjs"), "rich.mjs"],
  [join(src, "browser.mjs"), "bitizen.mjs"],
]) {
  await writeFile(join(root, "lib", to), flatten(await readFile(from, "utf8")));
}
await copyFile(join(here, "demo-app.mjs"), join(root, "app.mjs"));

const cards = [];
for (const style of ["plain", "rich"]) {
  for (let index = 1; index <= PER_STYLE; index += 1) {
    const id = `demo-${String(index).padStart(3, "0")}`;
    const name = `${style}-${String(index).padStart(3, "0")}.png`;
    await writeFile(
      join(root, "gallery", name),
      generateAvatarPng(id, { secret: SECRET, style, size: SIZE }),
    );
    cards.push({ style, id, name });
  }
}

const figures = (style) => cards
  .filter((card) => card.style === style)
  .map((card) => `      <figure>
        <img src="gallery/${card.name}" alt="${style} avatar for ${card.id}" width="${SIZE}" height="${SIZE}" loading="lazy">
        <figcaption>${card.id}</figcaption>
      </figure>`)
  .join("\n");

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bitizen — deterministic pixel avatars</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 40px clamp(16px, 4vw, 56px) 72px;
    background: #0b0d10;
    color: #e6e8eb;
    font: 15px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  h1 { margin: 0 0 8px; font-size: 26px; letter-spacing: -0.02em; }
  h2 { margin: 40px 0 4px; font-size: 18px; }
  p { margin: 0 0 4px; color: #8b939c; max-width: 70ch; }
  a { color: #6aa9ff; }
  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 13px;
    background: #16191e;
    border: 1px solid #23272e;
    border-radius: 5px;
    padding: 1px 5px;
  }
  .grid {
    margin-top: 18px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 14px;
  }
  figure {
    margin: 0;
    background: #14171b;
    border: 1px solid #22262c;
    border-radius: 10px;
    padding: 8px;
  }
  img {
    display: block;
    width: 100%;
    height: auto;
    aspect-ratio: 1 / 1;
    border-radius: 6px;
    image-rendering: pixelated;
  }
  figcaption {
    margin-top: 6px;
    font-size: 11px;
    color: #8b939c;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  footer { margin-top: 56px; color: #6d757e; font-size: 13px; }
  .demo {
    margin-top: 24px;
    display: flex;
    flex-wrap: wrap;
    gap: 24px;
    align-items: flex-start;
    background: #14171b;
    border: 1px solid #22262c;
    border-radius: 14px;
    padding: 20px;
  }
  .demo form { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  .demo label { font-size: 13px; color: #8b939c; }
  .demo input, .demo select, .demo button, .demo a.button {
    font: inherit;
    font-size: 14px;
    color: #e6e8eb;
    background: #0f1216;
    border: 1px solid #2a2f37;
    border-radius: 8px;
    padding: 8px 12px;
  }
  .demo input { min-width: 260px; }
  .demo button, .demo a.button { cursor: pointer; text-decoration: none; }
  .demo button:hover, .demo a.button:hover { border-color: #3d4650; }
  .demo .controls { flex: 1 1 320px; min-width: 280px; }
  .demo #demo-stage {
    width: 320px;
    height: 320px;
    border-radius: 10px;
    overflow: hidden;
    background: #0f1216;
    flex: 0 0 auto;
  }
  .demo #demo-stage svg { display: block; width: 100%; height: 100%; }
  .demo .field-label { font-size: 13px; color: #8b939c; }
  .demo .style-options { display: flex; gap: 8px; }
  .demo .style-option {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px 6px 6px;
    cursor: pointer;
  }
  .demo .style-option[aria-pressed="true"] {
    border-color: #6aa9ff;
    background: #16202c;
  }
  .demo .style-option .swatch {
    width: 34px;
    height: 34px;
    border-radius: 6px;
    overflow: hidden;
    background: #080a0e;
    flex: 0 0 auto;
  }
  .demo .style-option .swatch svg { display: block; width: 100%; height: 100%; }
  .demo .style-option .style-name { font-size: 13px; }
  .demo #demo-meta {
    margin-top: 12px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
    color: #8b939c;
    word-break: break-all;
  }
</style>
</head>
<body>
<h1>Bitizen</h1>
<p>Deterministic pixel avatar people. The same <code>userId</code> and secret always
produce the same citizen — no network, no database, no runtime dependencies.
Source: <a href="https://github.com/kotuke/bitizen">github.com/kotuke/bitizen</a>.</p>

<h2>Try it</h2>
<p>The generator runs entirely in your browser with a public demo secret — nothing
you type leaves this page.</p>
<div class="demo">
  <div id="demo-stage"></div>
  <div class="controls">
    <form id="demo-form">
      <label for="demo-id">Identifier</label>
      <input id="demo-id" type="text" autocomplete="off" spellcheck="false" placeholder="user-123">
      <span class="field-label">Style</span>
      <div id="demo-styles" class="style-options"></div>
      <button type="button" id="demo-random">Random</button>
      <a class="button" id="demo-download" hidden>Download SVG</a>
    </form>
    <div id="demo-meta"></div>
  </div>
</div>

<h2>Gallery</h2>
<p>Every avatar below is generated from <code>demo-NNN</code> with the same demo secret,
so the gallery can be rebuilt byte for byte with <code>npm run docs</code>.</p>

<h2>Style <code>plain</code></h2>
<p>One paint for the whole figure, always mirrored, solid body.</p>
<div class="grid">
${figures("plain")}
</div>

<h2>Style <code>rich</code></h2>
<p>Plain black background, body cutouts, a second color, about half of the figures asymmetric.</p>
<div class="grid">
${figures("rich")}
</div>

<footer>MIT licensed · ${cards.length} avatars at ${SIZE}×${SIZE}</footer>
<script type="module" src="app.mjs"></script>
</body>
</html>
`;

await writeFile(join(root, "index.html"), page);
await writeFile(join(root, ".nojekyll"), "");
console.log(`Docs written: ${root} (${cards.length} avatars)`);
