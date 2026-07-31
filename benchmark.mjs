import { performance } from "node:perf_hooks";

import {
  STYLE_NAMES,
  createAvatarDescriptor,
  renderAvatarPng,
  renderAvatarSvg,
} from "./src/index.mjs";

const SECRET = "benchmark-secret-at-least-16-characters";

function benchmark(label, iterations, operation) {
  const startedAt = performance.now();
  for (let index = 0; index < iterations; index += 1) operation(index);
  const elapsed = performance.now() - startedAt;
  console.log(`${label}: ${iterations} in ${elapsed.toFixed(1)} ms (${(elapsed / iterations).toFixed(3)} ms/avatar)`);
}

for (const style of STYLE_NAMES) {
  benchmark(`${style}: descriptor + SVG 256px`, 10_000, (index) => {
    const descriptor = createAvatarDescriptor(`svg-${index}`, { secret: SECRET, style });
    renderAvatarSvg(descriptor, { size: 256 });
  });

  benchmark(`${style}: descriptor + PNG 256px`, 500, (index) => {
    const descriptor = createAvatarDescriptor(`png-${index}`, { secret: SECRET, style });
    renderAvatarPng(descriptor, { size: 256 });
  });
}
