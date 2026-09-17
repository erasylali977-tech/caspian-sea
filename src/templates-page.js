import "./styles.css";
import { jsPDF } from "jspdf";
import { applyLang, getLang, bindLangSwitch, t } from "./i18n.js";
import { FISH, loadImage, toColoringPage } from "./templates-data.js";

const lang = getLang();
applyLang(document, lang);
bindLangSwitch();

document.getElementById("pdfBtn").addEventListener("click", downloadPdf);

const sheets = document.getElementById("sheets");
sheets.innerHTML = FISH.map(
  (fish) => `<article class="sheet" id="${fish.id}">
    <div class="sheet-inner">
      <span class="mark tl"></span><span class="mark tr"></span>
      <span class="mark bl"></span><span class="mark br"></span>
      <p class="sheet-kicker">${t(lang, "colorMe")}</p>
      <h2>${t(lang, fish.nameKey)}</h2>
      <img class="sheet-fish" alt="${t(lang, fish.nameKey)}" src="${fish.src}" />
      <p class="sheet-foot">${t(lang, "photoMe")}</p>
    </div>
  </article>`
).join("");

FISH.forEach(async (fish) => {
  try {
    const img = await loadImage(fish.src);
    const src = toColoringPage(img);
    const el = document.querySelector(`#${fish.id} .sheet-fish`);
    if (el) el.src = src;
  } catch {
    /* keep original drawing */
  }
});

const hash = location.hash.replace("#", "");
if (hash) document.getElementById(hash)?.scrollIntoView();

async function downloadPdf() {
  const btn = document.getElementById("pdfBtn");
  btn.disabled = true;
  try {
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
    for (let i = 0; i < FISH.length; i++) {
      if (i) pdf.addPage();
      const img = await loadImage(FISH[i].src);
      const page = toColoringPage(img);
      const sheet = await paintA4Sheet(FISH[i], page);
      pdf.addImage(sheet, "JPEG", 0, 0, 297, 210);
    }
    pdf.save("aquarium-a4.pdf");
  } finally {
    btn.disabled = false;
  }
}

function paintA4Sheet(fish, pageSrc) {
  return new Promise((resolve, reject) => {
    const art = new Image();
    art.onload = () => {
      const c = document.createElement("canvas");
      c.width = 2480;
      c.height = 1754;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#fffef8";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.fillStyle = "#121821";
      const mark = 42;
      const inset = 48;
      [
        [inset, inset],
        [c.width - inset - mark, inset],
        [inset, c.height - inset - mark],
        [c.width - inset - mark, c.height - inset - mark],
      ].forEach(([x, y]) => ctx.fillRect(x, y, mark, mark));
      ctx.textAlign = "center";
      ctx.fillStyle = "#8a97a6";
      ctx.font = "600 28px sans-serif";
      ctx.fillText(t(lang, "colorMe").toUpperCase(), c.width / 2, 120);
      ctx.fillStyle = "#152033";
      ctx.font = "800 56px sans-serif";
      ctx.fillText(t(lang, fish.nameKey), c.width / 2, 190);

      const maxW = 2100;
      const maxH = 1280;
      const scale = Math.min(maxW / art.width, maxH / art.height);
      const w = art.width * scale;
      const h = art.height * scale;
      ctx.drawImage(art, (c.width - w) / 2, 230, w, h);

      ctx.fillStyle = "#5b6b7a";
      ctx.font = "500 28px sans-serif";
      wrapText(ctx, t(lang, "photoMe"), c.width / 2, 1640, 2000, 36);
      resolve(c.toDataURL("image/jpeg", 0.92));
    };
    art.onerror = reject;
    art.src = pageSrc;
  });
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  let yy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy);
      line = word;
      yy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, yy);
}
