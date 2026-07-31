import { STYLE_NAMES, createAvatarDescriptor, renderAvatarSvg } from "./lib/bitizen.mjs";

// Public demo secret: everything here runs in the browser, nothing is sent anywhere.
const SECRET = "bitizen-public-demo-secret-v1";

const form = document.querySelector("#demo-form");
const input = document.querySelector("#demo-id");
const styleField = document.querySelector("#demo-style");
const stage = document.querySelector("#demo-stage");
const meta = document.querySelector("#demo-meta");
const download = document.querySelector("#demo-download");

let objectUrl = null;

function render() {
  const userId = input.value.trim();
  if (userId.length === 0) {
    stage.innerHTML = "";
    meta.textContent = "Type any identifier to see its avatar.";
    download.hidden = true;
    return;
  }

  try {
    const descriptor = createAvatarDescriptor(userId, { secret: SECRET, style: styleField.value });
    const svg = renderAvatarSvg(descriptor, { size: 320, title: `Avatar for ${userId}` });
    stage.innerHTML = svg;

    const parts = [`style ${descriptor.style}`, `accent ${descriptor.accent}`];
    if (descriptor.style === "rich") parts.push(`scheme ${descriptor.scheme}`);
    parts.push(`fingerprint ${descriptor.fingerprint.slice(0, 12)}…`);
    meta.textContent = parts.join(" · ");

    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    download.href = objectUrl;
    download.download = `${descriptor.style}-${userId.replace(/[^\w.-]+/g, "_")}.svg`;
    download.hidden = false;
  } catch (error) {
    stage.innerHTML = "";
    meta.textContent = error.message;
    download.hidden = true;
  }
}

for (const style of STYLE_NAMES) {
  const option = document.createElement("option");
  option.value = style;
  option.textContent = style;
  styleField.append(option);
}

form.addEventListener("submit", (event) => event.preventDefault());
input.addEventListener("input", render);
styleField.addEventListener("change", render);

document.querySelector("#demo-random").addEventListener("click", () => {
  input.value = `user-${Math.floor(Math.random() * 1_000_000)}`;
  render();
});

input.value = "ada@example.com";
render();
