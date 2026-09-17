import { FISH, loadImage } from "./templates-data.js";
import { silhouette } from "./fish-facing.js";

let cache = null;
const BIT = 48;

function toBits(shape) {
  const bits = new Uint8Array(BIT * BIT);
  for (let y = 0; y < BIT; y++) {
    for (let x = 0; x < BIT; x++) {
      const sx = Math.min(shape.w - 1, ((x + 0.5) * shape.w) / BIT) | 0;
      const sy = Math.min(shape.h - 1, ((y + 0.5) * shape.h) / BIT) | 0;
      bits[y * BIT + x] = shape.mask[sy * shape.w + sx];
    }
  }
  let top = 0;
  let n = 0;
  for (let i = 0; i < bits.length; i++) {
    if (!bits[i]) continue;
    n += 1;
    if ((i / BIT) | 0 < BIT * 0.38) top += 1;
  }
  return { bits, aspect: shape.w / Math.max(shape.h, 1), top: n ? top / n : 0 };
}

function featuresFromImage(img) {
  const shape = silhouette(img);
  return shape ? toBits(shape) : null;
}

function mirrorBits(bits) {
  const out = new Uint8Array(bits.length);
  for (let y = 0; y < BIT; y++) {
    for (let x = 0; x < BIT; x++) out[y * BIT + x] = bits[y * BIT + (BIT - 1 - x)];
  }
  return out;
}

function iou(a, b) {
  let inter = 0;
  let uni = 0;
  for (let i = 0; i < a.length; i++) {
    const p = a[i];
    const q = b[i];
    if (p | q) uni += 1;
    if (p & q) inter += 1;
  }
  return uni ? inter / uni : 0;
}

function scorePair(probe, item) {
  const overlap = Math.max(iou(probe.bits, item.bits), iou(probe.bits, mirrorBits(item.bits)));
  const aspect =
    1 - Math.min(1, Math.abs(Math.log((probe.aspect || 1) / (item.aspect || 1))) / Math.log(2.2));
  const top = 1 - Math.min(1, Math.abs((probe.top || 0) - (item.top || 0)) / 0.35);
  return overlap * 0.62 + aspect * 0.28 + top * 0.1;
}

async function templateCache() {
  if (cache) return cache;
  cache = await Promise.all(
    FISH.map(async (fish) => {
      const img = await loadImage(fish.src);
      return { fish, feat: featuresFromImage(img) };
    })
  );
  return cache;
}

export async function matchFishTemplate(source) {
  const list = (await templateCache()).filter((item) => item.feat);
  const img = typeof source === "string" ? await loadImage(source) : source;
  const probe = featuresFromImage(img);
  if (!probe || !list.length) return { fish: null, score: 0, gap: 0, ranked: [] };

  const ranked = list
    .map((item) => ({ fish: item.fish, score: scorePair(probe, item.feat) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  const second = ranked[1]?.score ?? 0;
  return { fish: best.fish, score: best.score, gap: best.score - second, ranked };
}

export function fishById(id) {
  return FISH.find((fish) => fish.id === id) || null;
}
