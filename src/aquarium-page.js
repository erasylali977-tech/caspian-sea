import "./styles.css";
import { applyLang, getLang, bindLangSwitch, t } from "./i18n.js";
import { AquariumEngine } from "./engine.js";
import { newRoomCode, openRoom } from "./sync.js";
import { FISH, SCENES, loadImage } from "./templates-data.js";
import { cutOutFish } from "./cutout.js";
import { lanOrigin, isLocalOrigin, joinUrlFor } from "./join-url.js";
import QRCode from "qrcode";

const lang = getLang();
applyLang(document, lang);
bindLangSwitch();

Object.keys(localStorage)
  .filter((key) => key.startsWith("aq-fish-"))
  .forEach((key) => localStorage.removeItem(key));

const params = new URLSearchParams(location.search);

function resolveRoom() {
  const fromUrl = String(params.get("room") || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 8);
  if (fromUrl) {
    sessionStorage.setItem("aq-room", fromUrl);
    return fromUrl;
  }
  const saved = sessionStorage.getItem("aq-room");
  if (saved) return saved;
  const next = newRoomCode();
  sessionStorage.setItem("aq-room", next);
  return next;
}

const code = resolveRoom();
{
  const scene = params.get("scene") || localStorage.getItem("aq-scene") || "ship";
  const next = new URLSearchParams({ room: code, scene });
  if (params.get("compare") === "1") next.set("compare", "1");
  history.replaceState({}, "", `./aquarium.html?${next}`);
}

const engine = new AquariumEngine(document.getElementById("tank"));
engine.start();

const paramsScene = params.get("scene");
const savedScene = localStorage.getItem("aq-scene");
const initial =
  SCENES.find((s) => s.id === paramsScene) ||
  SCENES.find((s) => s.id === savedScene) ||
  SCENES[0];
engine.setScene(initial.src);
localStorage.setItem("aq-scene", initial.id);
SCENES.forEach((s) => {
  const preload = new Image();
  preload.src = s.src;
});

const sceneBox = document.getElementById("scenes");
sceneBox.innerHTML = SCENES.map(
  (s) => `<button type="button" data-id="${s.id}" class="${s.id === initial.id ? "active" : ""}" title="${t(lang, s.nameKey)}">
    <img src="${s.src}" alt="${t(lang, s.nameKey)}" />
  </button>`
).join("");

sceneBox.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-id]");
  if (!btn) return;
  const scene = SCENES.find((s) => s.id === btn.dataset.id);
  if (!scene) return;
  engine.setScene(scene.src);
  localStorage.setItem("aq-scene", scene.id);
  sceneBox.querySelectorAll("button").forEach((el) => el.classList.toggle("active", el === btn));
});

const room = openRoom(code, { role: "host" });
room.on((msg) => {
  if (msg.type === "addFish" && msg.fish) engine.addFish(msg.fish, true);
  if (msg.type === "clear") engine.clearTank();
});

async function enterFullscreen() {
  if (document.fullscreenElement) return;
  const node = document.documentElement;
  const req = node.requestFullscreen || node.webkitRequestFullscreen;
  if (req) await req.call(node).catch(() => {});
}

enterFullscreen();
window.addEventListener("pointerdown", enterFullscreen, { capture: true });

const audio = document.getElementById("ambientAudio");
const musicBtn = document.getElementById("musicBtn");
let musicPlaying = false;

musicBtn.addEventListener("click", () => {
  if (musicPlaying) {
    audio.pause();
    musicBtn.classList.remove("active");
    musicPlaying = false;
  } else {
    audio.play().then(() => {
      musicBtn.classList.add("active");
      musicPlaying = true;
    }).catch(() => {});
  }
});

const feedBtn = document.getElementById("feedBtn");
feedBtn.addEventListener("click", () => {
  engine.feedFish();
  feedBtn.classList.add("active");
  setTimeout(() => feedBtn.classList.remove("active"), 400);
});

const catchBtn = document.getElementById("catchBtn");
catchBtn.addEventListener("click", () => {
  engine.catchAll();
  room.send({ type: "clear" });
  catchBtn.classList.add("active");
  setTimeout(() => catchBtn.classList.remove("active"), 900);
});

const joinPanel = document.getElementById("joinPanel");
const joinBtn = document.getElementById("joinBtn");
const joinQr = document.getElementById("joinQr");
let joinUrl = "";

async function showJoinPanel() {
  const origin = isLocalOrigin(location.origin)
    ? (await lanOrigin()) || location.origin
    : location.origin;
  joinUrl = joinUrlFor(origin, code);
  try {
    joinQr.src = await QRCode.toDataURL(joinUrl, {
      margin: 1,
      width: 200,
      color: { dark: "#062436", light: "#ffffff" },
    });
    joinQr.hidden = false;
  } catch {
    joinQr.hidden = true;
  }
  joinPanel.hidden = false;
  joinBtn.classList.add("active");
}

joinBtn.addEventListener("click", async () => {
  if (!joinPanel.hidden) {
    joinPanel.hidden = true;
    joinBtn.classList.remove("active");
    return;
  }
  await showJoinPanel();
});

async function spawnCompareFish() {
  for (const fish of FISH.filter((item) => item.model3d)) {
    try {
      const img = await loadImage(fish.src);
      const cut = cutOutFish(img);
      engine.addFish(
        { id: `${fish.id}-3d`, image: cut, kind: fish.kind, model3d: fish.model3d, templateId: fish.id },
        true
      );
    } catch (err) {
      console.error("Не удалось добавить рыбку", fish.id, err);
    }
  }
}

if (params.get("compare") === "1") {
  spawnCompareFish();
}

window.addEventListener("beforeunload", () => room.destroy());
