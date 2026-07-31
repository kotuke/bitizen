import { DEFAULT_STYLE, STYLE_NAMES, createAvatarDescriptor, renderAvatarSvg } from "./lib/bitizen.mjs";

// Public demo secret: everything here runs in the browser, nothing is sent anywhere.
const SECRET = "bitizen-public-demo-secret-v1";

const form = document.querySelector("#demo-form");
const input = document.querySelector("#demo-id");
const styles = document.querySelector("#demo-styles");
const stage = document.querySelector("#demo-stage");
const meta = document.querySelector("#demo-meta");
const download = document.querySelector("#demo-download");

let style = DEFAULT_STYLE;
let objectUrl = null;

/** Each style button previews the current identifier in that very style. */
function renderStyleButtons(userId) {
  for (const button of styles.children) {
    const preview = button.querySelector(".swatch");
    button.setAttribute("aria-pressed", String(button.dataset.style === style));
    try {
      preview.innerHTML = renderAvatarSvg(
        createAvatarDescriptor(userId, { secret: SECRET, style: button.dataset.style }),
        { size: 56, title: `${button.dataset.style} preview` },
      );
    } catch {
      preview.innerHTML = "";
    }
  }
}

function render() {
  const userId = input.value.trim();
  if (userId.length === 0) {
    stage.innerHTML = "";
    meta.textContent = "Type any identifier to see its avatar.";
    download.hidden = true;
    for (const button of styles.children) button.querySelector(".swatch").innerHTML = "";
    return;
  }

  try {
    const descriptor = createAvatarDescriptor(userId, { secret: SECRET, style });
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

  renderStyleButtons(userId);
}

for (const name of STYLE_NAMES) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "style-option";
  button.dataset.style = name;
  button.setAttribute("aria-pressed", String(name === style));
  button.innerHTML = `<span class="swatch"></span><span class="style-name">${name}</span>`;
  button.addEventListener("click", () => {
    style = name;
    render();
  });
  styles.append(button);
}

form.addEventListener("submit", (event) => event.preventDefault());
input.addEventListener("input", render);

document.querySelector("#demo-random").addEventListener("click", () => {
  input.value = `user-${Math.floor(Math.random() * 1_000_000)}`;
  render();
});

input.value = "ada@example.com";
render();
