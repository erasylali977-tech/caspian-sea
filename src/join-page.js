import "./styles.css";
import { applyLang, getLang, bindLangSwitch, t } from "./i18n.js";
import { cutOutFish, compressFishDataUrl, loadImageFromFile } from "./cutout.js";
import { openRoom } from "./sync.js";
import { FISH } from "./templates-data.js";
import { fishById } from "./match-fish.js";

const lang = getLang();
applyLang(document, lang);
bindLangSwitch();

const params = new URLSearchParams(location.search);
let code = String(params.get("room") || params.get("id") || "")
  .toLowerCase()
  .replace(/[^a-z0-9]/g, "")
  .slice(0, 8);
if (code) localStorage.setItem("aq-phone-room", code);
else code = String(localStorage.getItem("aq-phone-room") || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);

boot(code);

function boot(roomCode) {
  const success = document.getElementById("success");
  const picks = document.getElementById("picks");
  let chosenId = "";
  let sending = false;
  const room = roomCode ? openRoom(roomCode, { role: "join" }) : null;

  picks.innerHTML = FISH.map(
    (fish) => `<button type="button" data-id="${fish.id}">
      <img src="${fish.src}" alt="" />
      ${t(lang, fish.nameKey)}
    </button>`
  ).join("");

  const select = (id) => {
    chosenId = id;
    picks.querySelectorAll("button").forEach((btn) => {
      btn.classList.toggle("on", btn.dataset.id === id);
    });
  };

  picks.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-id]");
    if (btn) select(btn.dataset.id);
  });

  async function handleFile(file) {
    if (!file || sending) return;
    if (!chosenId) {
      alert(t(lang, "joinPickNeed"));
      return;
    }
    sending = true;
    success.classList.remove("show");
    try {
      const sourceImage = await loadImageFromFile(file);
      let cutout;
      try {
        cutout = cutOutFish(sourceImage);
      } catch {
        cutout = "";
      }
      const picked = fishById(chosenId);
      if (!picked?.model3d) {
        alert(t(lang, "joinPickNeed"));
        return;
      }
      const image = await compressFishDataUrl(cutout || sourceImage.src, 420);
      if (!image || image.length < 32) throw new Error("empty");
      const fish = {
        id: crypto.randomUUID ? crypto.randomUUID() : `f${Date.now()}`,
        kind: picked.kind || "fish",
        templateId: picked.id,
        image,
        model3d: picked.model3d,
      };
      const payload = { type: "addFish", fish };
      if (room) {
        try {
          room.send(payload);
        } catch (err) {
          console.error(err);
        }
      }
      success.classList.add("show");
    } catch (err) {
      console.error(err);
      alert(t(lang, "joinNeedPhoto"));
    } finally {
      sending = false;
    }
  }

  function onPick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    handleFile(file);
  }

  document.getElementById("photo").addEventListener("change", onPick);
}
