import { headSideHint } from "./fish-facing.js";

export const HOUSE_ROOM = "home";

const SPAN = {
  fish: 0.055,        // все рыбки одинакового размера - 5.5% ширины экрана
  puffer: 0.055,      // то же
  octopus: 0.055,     // осьминог тоже
};

export function scaleToTank(kind, tank, imgW, imgH) {
  const target = (SPAN[kind] || SPAN.fish) * tank.w;
  return target / Math.max(imgW, imgH, 1);
}

export function isLegacyDemoFish(image, img) {
  if (image === true) return true;
  if (img && img.width === 280 && img.height === 150) return true;
  return false;
}

export function dropSmallBlobs(imageData, mode = "alpha") {
  const { width: w, height: h, data } = imageData;
  const n = w * h;
  const ink = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (mode === "alpha") ink[i] = data[i * 4 + 3] > 40 ? 1 : 0;
    else {
      const l = data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114;
      ink[i] = l < 90 ? 1 : 0;
    }
  }

  const label = new Int32Array(n);
  label.fill(-1);
  const sizes = [];
  let current = 0;
  const stack = [];
  const dirs = [1, -1, w, -w];

  for (let i = 0; i < n; i++) {
    if (!ink[i] || label[i] !== -1) continue;
    let count = 0;
    stack.length = 0;
    stack.push(i);
    label[i] = current;
    while (stack.length) {
      const p = stack.pop();
      count += 1;
      const x = p % w;
      for (const d of dirs) {
        const q = p + d;
        if (q < 0 || q >= n) continue;
        if (d === 1 && x === w - 1) continue;
        if (d === -1 && x === 0) continue;
        if (!ink[q] || label[q] !== -1) continue;
        label[q] = current;
        stack.push(q);
      }
    }
    sizes[current] = count;
    current += 1;
  }

  let largest = 0;
  for (let s = 0; s < sizes.length; s++) if (sizes[s] > largest) largest = sizes[s];
  const minKeep = Math.max(24, largest * 0.2);

  for (let i = 0; i < n; i++) {
    if (label[i] === -1) continue;
    if (sizes[label[i]] >= minKeep) continue;
    if (mode === "alpha") data[i * 4 + 3] = 0;
    else {
      data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = 255;
      data[i * 4 + 3] = 255;
    }
  }
  return imageData;
}

// The sprite is always stored swimming to the right, so drawing it only ever
// has to mirror it, never turn it over.
export function prepareSprite(img, templateHeadOnRight = true) {
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  const canvas = document.createElement("canvas");
  canvas.width = srcW;
  canvas.height = srcH;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const shot = ctx.getImageData(0, 0, srcW, srcH);
  dropSmallBlobs(shot, "alpha");
  const data = shot.data;

  let minX = srcW;
  let minY = srcH;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < srcH; y++) {
    for (let x = 0; x < srcW; x++) {
      if (data[(y * srcW + x) * 4 + 3] < 40) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX <= minX || maxY <= minY) {
    return { canvas, width: srcW, height: srcH };
  }

  const pad = Math.round(Math.max(4, (maxX - minX) * 0.04));
  const sx = Math.max(0, minX - pad);
  const sy = Math.max(0, minY - pad);
  const sw = Math.min(srcW - sx, maxX - minX + pad * 2);
  const sh = Math.min(srcH - sy, maxY - minY + pad * 2);
  ctx.putImageData(shot, 0, 0);

  const crop = document.createElement("canvas");
  crop.width = sw;
  crop.height = sh;
  const cctx = crop.getContext("2d", { willReadFrequently: true });
  cctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);

  const hint = headSideHint(crop);
  const headOnRight = hint === 0 ? templateHeadOnRight : hint > 0;
  if (!headOnRight) {
    const flipped = document.createElement("canvas");
    flipped.width = sw;
    flipped.height = sh;
    const fctx = flipped.getContext("2d");
    fctx.translate(sw, 0);
    fctx.scale(-1, 1);
    fctx.drawImage(crop, 0, 0);
    return { canvas: flipped, width: sw, height: sh };
  }
  return { canvas: crop, width: sw, height: sh };
}

export function classifyCreature(img) {
  const w = img.naturalWidth || img.width || 1;
  const h = img.naturalHeight || img.height || 1;
  const aspect = w / h;
  const canvas = document.createElement("canvas");
  canvas.width = 160;
  canvas.height = Math.max(2, Math.round((160 * h) / w));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const cw = canvas.width;
  const ch = canvas.height;
  const on = (x, y) => data[(y * cw + x) * 4 + 3] > 40;

  let maxRuns = 0;
  for (let y = Math.floor(ch * 0.55); y < ch; y += 2) {
    let runs = 0;
    let inside = false;
    for (let x = 0; x < cw; x++) {
      const hit = on(x, y);
      if (hit && !inside) {
        runs += 1;
        inside = true;
      } else if (!hit) inside = false;
    }
    if (runs > maxRuns) maxRuns = runs;
  }

  if (maxRuns >= 3 && aspect < 1.35) return "octopus";
  if (aspect > 2.45) return "whale";
  if (aspect > 2.15) return "swordfish";
  if (aspect > 1.72) return "large";
  return "fish";
}
