import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  STYLE_NAMES,
  createAvatarDescriptor,
  renderAvatarPng,
  renderAvatarSvg,
} from "../src/index.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const outputDirectory = join(directory, "generated");
const secret = process.env.AVATAR_SECRET ?? "sample-secret-not-for-production";

await mkdir(outputDirectory, { recursive: true });

let written = 0;
for (const style of STYLE_NAMES) {
  for (let index = 1; index <= 12; index += 1) {
    const descriptor = createAvatarDescriptor(`sample-user-${index}`, { secret, style });
    const name = `${style}-${String(index).padStart(2, "0")}`;
    await writeFile(join(outputDirectory, `${name}.svg`), renderAvatarSvg(descriptor, { size: 256 }));
    await writeFile(join(outputDirectory, `${name}.png`), renderAvatarPng(descriptor, { size: 256 }));
    written += 2;
  }
}

console.log(`Generated ${written} files in ${outputDirectory}`);
