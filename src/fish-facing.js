// Which way is the drawn fish looking?
//
// The 3D models all have their snout at a known end, so the drawing has to be
// projected onto them the right way round - get it backwards and the fish
// swims with its painted tail in front.

const SAMPLE = 200;

function largestBlob(mask, w, h) {
  const label = new Int32Array(w * h).fill(-1);
  const sizes = [];
  const stack = [];
  let current = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || label[i] !== -1) continue;
    let count = 0;
    stack.length = 0;
    stack.push(i);
    label[i] = current;
    while (stack.length) {
      const p = stack.pop();
      count += 1;
      const x = p % w;
      for (const d of [1, -1, w, -w]) {
        const q = p + d;
        if (q < 0 || q >= mask.length) continue;
        if (d === 1 && x === w - 1) continue;
        if (d === -1 && x === 0) continue;
        if (!mask[q] || label[q] !== -1) continue;
        label[q] = current;
        stack.push(q);
      }
    }
    sizes[current] = count;
    current += 1;
  }
  let keep = 0;
  for (let s = 1; s < sizes.length; s++) if (sizes[s] > sizes[keep]) keep = s;
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) if (label[i] === keep) out[i] = 1;
  return out;
}

function grow(mask, w, h, passes) {
  const out = new Uint8Array(mask);
  for (let pass = 0; pass < passes; pass++) {
    const next = new Uint8Array(out);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (out[i]) continue;
        if (out[i - 1] || out[i + 1] || out[i - w] || out[i + w]) next[i] = 1;
      }
    }
    out.set(next);
  }
  return out;
}

// Body outline as a filled mask, cropped to the fish and scaled to SAMPLE wide.
//
// An uncoloured drawing is only an outline - the middle of the fish is the same
// white paper as the background, and a cut-out of it is a ring of strokes with
// a hole where the body should be. So rather than taking the ink itself we
// flood the background in from the border and keep everything it cannot reach,
// which fills the body whether or not the child has coloured it in.
export function silhouette(source) {
  const sw = source.naturalWidth || source.width;
  const sh = source.naturalHeight || source.height;
  if (!sw || !sh) return null;
  const scale = Math.min(1, SAMPLE / Math.max(sw, sh));
  const w = Math.max(8, Math.round(sw * scale));
  const h = Math.max(8, Math.round(sh * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  let opaque = 0;
  for (let i = 0; i < w * h; i++) if (data[i * 4 + 3] > 40) opaque += 1;
  const cutout = opaque < w * h * 0.92;

  const ink = new Uint8Array(w * h);
  for (let i = 0; i < ink.length; i++) {
    if (cutout) {
      ink[i] = data[i * 4 + 3] > 40 ? 1 : 0;
    } else {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      const max = Math.max(r, g, b);
      const sat = max === 0 ? 0 : (max - Math.min(r, g, b)) / max;
      ink[i] = r * 0.299 + g * 0.587 + b * 0.114 < 205 || sat > 0.18 ? 1 : 0;
    }
  }

  // A hand drawn outline is rarely watertight, and every gap lets the flood
  // fill pour into the body and eat the fish. Thickening the strokes closes
  // them, so keep thickening until what is left actually looks solid.
  let best = null;
  for (const passes of [2, 4, 7]) {
    const shape = floodFill(grow(ink, w, h, passes), w, h);
    if (!shape) continue;
    if (!best || shape.solidity > best.solidity) best = shape;
    if (shape.solidity >= 0.45) break;
  }
  return best;
}

function floodFill(blocked, w, h) {
  const outside = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (outside[i] || blocked[i]) return;
    outside[i] = 1;
    stack.push(i);
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  while (stack.length) {
    const i = stack.pop();
    const x = i % w;
    const y = (i / w) | 0;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }

  let mask = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) mask[i] = outside[i] ? 0 : 1;
  mask = largestBlob(mask, w, h);

  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  let filled = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      filled += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX || maxY < minY) return null;

  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  const crop = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) crop[y * bw + x] = mask[(y + minY) * w + (x + minX)];
  }
  return { mask: crop, w: bw, h: bh, solidity: filled / (bw * bh) };
}

// How tall the fish is in each column of the drawing.
function columns({ mask, w, h }) {
  const span = new Float64Array(w);
  for (let x = 0; x < w; x++) {
    let lo = -1;
    let hi = -1;
    for (let y = 0; y < h; y++) {
      if (!mask[y * w + x]) continue;
      if (lo < 0) lo = y;
      hi = y;
    }
    span[x] = lo < 0 ? 0 : hi - lo + 1;
  }
  return { span };
}

// A tail is joined to the body by the caudal peduncle: a narrow waist with the
// fin flaring out again behind it. A head just tapers to the snout and stops.
// Measuring how much the outline flares back out past its narrowest point
// tells the two ends apart even when the tail fin is small.
function waistProminence(span, from, to, outward) {
  const tall = Math.max(...span);
  if (!tall) return 0;
  let at = from;
  let low = Infinity;
  for (let x = from; x < to; x++) {
    if (span[x] > 0 && span[x] < low) {
      low = span[x];
      at = x;
    }
  }
  if (!Number.isFinite(low)) return 0;
  let flare = 0;
  const edge = outward > 0 ? span.length : -1;
  for (let x = at; x !== edge; x += outward) {
    if (span[x] > flare) flare = span[x];
  }
  return (flare - low) / tall;
}

// Positive when the waist sits on the left, i.e. when the head is on the right.
export function facingScore(source) {
  const shape = source?.mask ? source : silhouette(source);
  if (!shape) return 0;
  const { span } = columns(shape);
  const at = (f) => Math.round(shape.w * f);
  return (
    waistProminence(span, at(0.08), at(0.45), -1) -
    waistProminence(span, at(0.55), at(0.92), 1)
  );
}

// Plenty of drawings have no waist worth speaking of - a pufferfish is a ball,
// an angelfish is a disc - and guessing from a weak signal is worse than not
// guessing at all, so anything short of an obvious peduncle reports "no idea"
// and lets the caller fall back on the template it matched.
const SURE = 0.2;

export function headSideHint(source) {
  const score = facingScore(source);
  if (score > SURE) return 1;
  if (score < -SURE) return -1;
  return 0;
}
