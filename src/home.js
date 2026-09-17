import "./styles.css";
import { applyLang, getLang, bindLangSwitch, t } from "./i18n.js";
import { FISH, SCENES } from "./templates-data.js";

const lang = getLang();
applyLang(document, lang);
bindLangSwitch();

document.getElementById("cast").innerHTML = FISH.map(
  (fish) => `<a class="card" href="./templates.html#${fish.id}">
    <img src="${fish.src}" alt="${t(lang, fish.nameKey)}" />
    <span>${t(lang, fish.nameKey)}</span>
  </a>`
).join("");

document.getElementById("worlds").innerHTML = SCENES.map(
  (scene) => `<a class="world" href="./aquarium.html?scene=${scene.id}">
    <img src="${scene.src}" alt="${t(lang, scene.nameKey)}" />
    <span>${t(lang, scene.nameKey)}</span>
  </a>`
).join("");

document.getElementById("openTv").addEventListener("click", async (e) => {
  e.preventDefault();
  const scene = localStorage.getItem("aq-scene") || "ship";
  const url = `./aquarium.html?scene=${encodeURIComponent(scene)}`;
  let host = document.getElementById("aquaFrameHost");
  if (!host) {
    host = document.createElement("div");
    host.id = "aquaFrameHost";
    host.style.cssText = "position:fixed;inset:0;z-index:9999;background:#02344a";
    const iframe = document.createElement("iframe");
    iframe.src = url;
    iframe.setAttribute("allow", "fullscreen");
    iframe.style.cssText = "width:100%;height:100%;border:0;display:block";
    host.appendChild(iframe);
    document.body.appendChild(host);
  }
  const req = host.requestFullscreen || host.webkitRequestFullscreen;
  try {
    if (req) await req.call(host);
  } catch {
    const root = document.documentElement;
    const alt = root.requestFullscreen || root.webkitRequestFullscreen;
    if (alt) await alt.call(root).catch(() => {});
  }
});

document.querySelectorAll(".faq-q").forEach((btn) => {
  btn.addEventListener("click", () => {
    const item = btn.closest(".faq");
    const open = !item.classList.contains("open");
    item.classList.toggle("open", open);
    btn.setAttribute("aria-expanded", String(open));
  });
});
