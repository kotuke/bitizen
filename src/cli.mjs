#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  DEFAULT_STYLE,
  STYLE_NAMES,
  createAvatarDescriptor,
  normalizeSize,
  normalizeStyle,
  renderAvatarPng,
  renderAvatarSvg,
} from "./index.mjs";

function usage() {
  return `Usage:
  bitizen --id USER_ID --out avatar.svg [--format svg] [--size 256] [--style plain]
  bitizen --id USER_ID --out avatar.png --format png [--size 256] [--style rich]

Options:
  --id       Stable public or internal user identifier
  --out      Output file path
  --format   svg or png; inferred from --out when omitted
  --size     Integer from 32 to 2048; default 256
  --style    ${STYLE_NAMES.join(" or ")}; default ${DEFAULT_STYLE}
  --secret   HMAC secret; AVATAR_SECRET is preferred
  --help     Show this message
`;
}

function parseArguments(argumentsList) {
  const options = {};

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--help") return { help: true };
    if (!argument.startsWith("--")) {
      throw new Error(`unknown argument: ${argument}`);
    }
    const key = argument.slice(2);
    if (!["id", "out", "format", "size", "secret", "style"].includes(key)) {
      throw new Error(`unknown option: ${argument}`);
    }
    const value = argumentsList[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`${argument} requires a value`);
    }
    options[key] = value;
    index += 1;
  }

  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }

  if (!options.id || !options.out) {
    throw new Error("--id and --out are required");
  }

  const secret = options.secret ?? process.env.AVATAR_SECRET;
  if (!secret) {
    throw new Error("set AVATAR_SECRET or pass --secret");
  }

  const outputPath = resolve(options.out);
  const inferredFormat = outputPath.toLowerCase().endsWith(".png") ? "png" : "svg";
  const format = options.format ?? inferredFormat;
  if (format !== "svg" && format !== "png") {
    throw new Error("--format must be svg or png");
  }

  const size = normalizeSize(options.size);
  const style = normalizeStyle(options.style ?? DEFAULT_STYLE);
  const descriptor = createAvatarDescriptor(options.id, { secret, style });
  const payload = format === "svg"
    ? renderAvatarSvg(descriptor, { size })
    : renderAvatarPng(descriptor, { size });

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, payload);
  console.log(`${format.toUpperCase()} written: ${outputPath}`);
  console.log(`Style: ${descriptor.style}`);
  console.log(`Fingerprint: ${descriptor.fingerprint}`);
}

main().catch((error) => {
  console.error(error.message);
  process.stderr.write(usage());
  process.exitCode = 1;
});
