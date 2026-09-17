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

const MAX_READ = 1600;

function canvasFromSource(src, maxEdge = MAX_READ) {
  const sw = Math.max(1, src.width || src.naturalWidth || 1);
  const sh = Math.max(1, src.height || src.naturalHeight || 1);
  const scale = Math.min(1, maxEdge / Math.max(sw, sh));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(sw * scale));
  c.height = Math.max(1, Math.round(sh * scale));
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

function imageFromCanvas(canvas) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = canvas.toDataURL("image/jpeg", 0.88);
  });
}

function safeJpeg(source, maxEdge = 900) {
  try {
    const c = canvasFromSource(source, maxEdge);
    const ctx = c.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#fff";
      ctx.globalCompositeOperation = "destination-over";
      ctx.fillRect(0, 0, c.width, c.height);
    }
    return c.toDataURL("image/jpeg", 0.84);
  } catch {
    return "";
  }
}

export function compressFishDataUrl(dataUrl, maxSize = 420) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height, 1));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, w, h);
        ctx.filter = "saturate(1.35) contrast(1.08) brightness(1.04)";
        ctx.drawImage(img, 0, 0, w, h);
        ctx.filter = "none";
        let out = c.toDataURL("image/jpeg", 0.84);
        if (out.length > 220000) out = c.toDataURL("image/jpeg", 0.7);
        resolve(out);
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export function cutOutFish(source, tolerance = 42) {
  const maxW = 1100;
  const sw = source.width || source.naturalWidth || 0;
  const sh = source.height || source.naturalHeight || 0;
  if (!sw || !sh) return safeJpeg(source);

  const scale = Math.min(1, maxW / sw);
  const w = Math.max(2, Math.round(sw * scale));
  const h = Math.max(2, Math.round(sh * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return safeJpeg(source);
  ctx.drawImage(source, 0, 0, w, h);

  let img;
  try {
    img = ctx.getImageData(0, 0, w, h);
  } catch {
    return canvas.toDataURL("image/jpeg", 0.84);
  }
  const data = img.data;
  try {

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

  try {
    dropSmallBlobs(img, "alpha");
  } catch {
    /* keep the mask we already have */
  }
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
    return safeJpeg(canvas);
  }

  const pad = Math.round(Math.max(8, (maxX - minX) * 0.06));
  const sx = Math.max(0, minX - pad);
  const sy = Math.max(0, minY - pad);
  const cropW = Math.min(w - sx, maxX - minX + pad * 2);
  const cropH = Math.min(h - sy, maxY - minY + pad * 2);
  const out = document.createElement("canvas");
  out.width = cropW;
  out.height = cropH;
  const octx = out.getContext("2d");
  if (!octx) return safeJpeg(canvas);
  octx.fillStyle = "#fff";
  octx.fillRect(0, 0, cropW, cropH);
  octx.drawImage(canvas, sx, sy, cropW, cropH, 0, 0, cropW, cropH);
  return out.toDataURL("image/jpeg", 0.86);
  } catch {
    return safeJpeg(canvas) || safeJpeg(source);
  }
}

export async function loadImageFromFile(file) {
  if (!file) throw new Error("nofile");

  if (typeof createImageBitmap === "function") {
    let bmp = null;
    try {
      bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      try {
        bmp = await createImageBitmap(file);
      } catch {
        bmp = null;
      }
    }
    if (bmp) {
      try {
        const c = canvasFromSource(bmp);
        bmp.close?.();
        return await imageFromCanvas(c);
      } catch {
        bmp.close?.();
      }
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    return await imageFromCanvas(canvasFromSource(img));
  } finally {
    URL.revokeObjectURL(url);
  }
}
