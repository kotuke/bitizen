import { STYLE_NAMES, createAvatarDescriptor } from "./src/index.mjs";

const sampleSize = Number(process.env.AVATAR_COLLISION_SAMPLE ?? 100_000);
if (!Number.isInteger(sampleSize) || sampleSize < 1) {
  throw new Error("AVATAR_COLLISION_SAMPLE must be a positive integer");
}

const secret = "collision-test-secret-at-least-16";
const report = {};

for (const style of STYLE_NAMES) {
  const visualSignatures = new Set();
  let duplicates = 0;

  for (let index = 0; index < sampleSize; index += 1) {
    const avatar = createAvatarDescriptor(`user-${index}`, { secret, style });
    const signature = style === "plain"
      ? `${avatar.accent}:${JSON.stringify(avatar.pixels)}`
      : JSON.stringify([avatar.layers, avatar.eyes]);
    if (visualSignatures.has(signature)) duplicates += 1;
    else visualSignatures.add(signature);
  }

  report[style] = {
    users: sampleSize,
    visualDuplicates: duplicates,
    uniqueVisuals: visualSignatures.size,
  };
}

console.log(JSON.stringify(report, null, 2));
