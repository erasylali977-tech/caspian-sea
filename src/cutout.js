import { dropSmallBlobs } from "./creature.js";

function pixel(data, w, x, y) {
  const i = (y * w + x) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}

function dist(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function luma(p) {
  return p[0] * 0.299 + p[1] * 0.587 + p[2] * 0.114;
}

function sat(p) {
  const max = Math.max(p[0], p[1], p[2]);
  const min = Math.min(p[0], p[1], p[2]);
  return max === 0 ? 0 : (max - min) / max;
}

export function compressFishDataUrl(dataUrl, maxSize = 480) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      ctx.filter = "saturate(1.35) contrast(1.08) brightness(1.04)";
      ctx.drawImage(img, 0, 0, w, h);
      ctx.filter = "none";
      // Keep PNG so the transparent paper stays transparent. JPEG fills the
      // page with white and the drawing shrinks to a stamp on the 3D model.
      resolve(c.toDataURL("image/png"));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export function cutOutFish(source, tolerance = 42) {
  const maxW = 1100;
  const scale = Math.min(1, maxW / source.width);
  const w = Math.max(2, Math.round(source.width * scale));
  const h = Math.max(2, Math.round(source.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;

  const samples = [];
  const inset = Math.max(2, Math.floor(Math.min(w, h) * 0.02));
  for (const [x, y] of [
    [inset, inset],
    [w - inset - 1, inset],
    [inset, h - inset - 1],
    [w - inset - 1, h - inset - 1],
    [w >> 1, inset],
    [inset, h >> 1],
    [w >> 1, h - inset - 1],
    [w - inset - 1, h >> 1],
  ]) {
    samples.push(pixel(data, w, x, y));
  }

  const isPaperPx = (p) => luma(p) > 198 && sat(p) < 0.22;
  const isDarkPx = (p) => luma(p) < 100 && sat(p) < 0.3;
  const isPaintPx = (p) => sat(p) > 0.2 && luma(p) > 28 && luma(p) < 235;
  const paperN = samples.filter(isPaperPx).length;
  const darkN = samples.filter(isDarkPx).length;

  const isBgPx = (p) => {
    if (isPaintPx(p)) return false;
    if (paperN >= 3 && darkN >= 3) return isPaperPx(p) || isDarkPx(p);
    if (paperN >= 3) return isPaperPx(p) || luma(p) > 236;
    if (darkN >= 3) return isDarkPx(p);
    return (luma(p) > 228 && sat(p) < 0.16) || (luma(p) < 48 && sat(p) < 0.18);
  };

  const keep = new Uint8Array(w * h);
  for (let i = 0; i < keep.length; i++) {
    const o = i * 4;
    keep[i] = isBgPx(pixel(data, w, i % w, (i / w) | 0)) ? 0 : 1;
  }

  // Black print lines on a dark table look like the table. Put them back
  // if they sit next to paint, so the outline of a coloured fish survives.
  if (darkN >= 3) {
    const next = new Uint8Array(keep);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (keep[i]) continue;
        const p = pixel(data, w, x, y);
        if (luma(p) > 70) continue;
        if (
          keep[i - 1] ||
          keep[i + 1] ||
          keep[i - w] ||
          keep[i + w]
        ) {
          next[i] = 1;
        }
      }
    }
    keep.set(next);
  }

  const seen = new Uint8Array(w * h);
  const q = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (seen[i] || keep[i]) return;
    seen[i] = 1;
    q.push(i);
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  while (q.length) {
    const i = q.pop();
    const x = i % w;
    const y = (i / w) | 0;
    keep[i] = 0;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }

  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!keep[i]) {
        data[i * 4 + 3] = 0;
      } else {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        data[i * 4 + 3] = 255;
      }
    }
  }

  dropSmallBlobs(img, "alpha");
  minX = w;
  minY = h;
  maxX = 0;
  maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (data[i * 4 + 3] < 40) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  ctx.putImageData(img, 0, 0);
  if (maxX <= minX || maxY <= minY) {
    return canvas.toDataURL("image/png");
  }

  const pad = Math.round(Math.max(8, (maxX - minX) * 0.06));
  const sx = Math.max(0, minX - pad);
  const sy = Math.max(0, minY - pad);
  const sw = Math.min(w - sx, maxX - minX + pad * 2);
  const sh = Math.min(h - sy, maxY - minY + pad * 2);
  const out = document.createElement("canvas");
  out.width = sw;
  out.height = sh;
  out.getContext("2d").drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return out.toDataURL("image/png");
}

export async function loadImageFromFile(file) {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      const c = document.createElement("canvas");
      c.width = bmp.width;
      c.height = bmp.height;
      c.getContext("2d").drawImage(bmp, 0, 0);
      bmp.close?.();
      return await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = c.toDataURL("image/jpeg", 0.92);
      });
    } catch {
      /* fall through */
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = reject;
    img.src = url;
  });
}
