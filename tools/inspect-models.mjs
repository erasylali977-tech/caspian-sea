import fs from "node:fs";
import path from "node:path";

const DIR = path.resolve("public/models");

function parseGLB(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error("not glb");
  const total = dv.getUint32(8, true);
  let off = 12;
  let json = null;
  let bin = null;
  while (off < total) {
    const len = dv.getUint32(off, true);
    const type = dv.getUint32(off + 4, true);
    const start = off + 8;
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(buf.subarray(start, start + len)));
    if (type === 0x004e4942) bin = buf.subarray(start, start + len);
    off = start + len + ((4 - (len % 4)) % 4) * 0;
    off = start + len;
    while (off % 4) off++;
  }
  return { json, bin };
}

const COMP = { 5120: [Int8Array, 1], 5121: [Uint8Array, 1], 5122: [Int16Array, 2], 5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5126: [Float32Array, 4] };
const NUM = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function readAccessor(gltf, bin, idx) {
  const acc = gltf.accessors[idx];
  const [Ctor, csize] = COMP[acc.componentType];
  const n = NUM[acc.type];
  const out = new Float32Array(acc.count * n);
  if (acc.bufferView === undefined) return out;
  const bv = gltf.bufferViews[acc.bufferView];
  const base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const stride = bv.byteStride || csize * n;
  for (let i = 0; i < acc.count; i++) {
    const o = base + i * stride;
    const chunk = new Ctor(bin.buffer.slice(bin.byteOffset + o, bin.byteOffset + o + csize * n));
    for (let k = 0; k < n; k++) out[i * n + k] = chunk[k];
  }
  return out;
}

function mul(a, b) {
  const o = new Float64Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
  return o;
}

function trs(node) {
  if (node.matrix) return Float64Array.from(node.matrix);
  const [tx, ty, tz] = node.translation || [0, 0, 0];
  const [qx, qy, qz, qw] = node.rotation || [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale || [1, 1, 1];
  const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
  const xx = qx * x2, xy = qx * y2, xz = qx * z2;
  const yy = qy * y2, yz = qy * z2, zz = qz * z2;
  const wx = qw * x2, wy = qw * y2, wz = qw * z2;
  return Float64Array.from([
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ]);
}

function apply(m, x, y, z) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

function collect(file) {
  const { json: gltf, bin } = parseGLB(fs.readFileSync(file));
  const verts = [];
  const scene = gltf.scenes[gltf.scene || 0];
  const walk = (ni, parent) => {
    const node = gltf.nodes[ni];
    const world = mul(parent, trs(node));
    if (node.mesh !== undefined) {
      for (const prim of gltf.meshes[node.mesh].primitives) {
        if (prim.attributes.POSITION === undefined) continue;
        const pos = readAccessor(gltf, bin, prim.attributes.POSITION);
        for (let i = 0; i < pos.length; i += 3) verts.push(apply(world, pos[i], pos[i + 1], pos[i + 2]));
      }
    }
    (node.children || []).forEach((c) => walk(c, world));
  };
  const I = Float64Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  scene.nodes.forEach((n) => walk(n, I));
  return { verts, gltf };
}

function stats(name, verts) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const v of verts) for (let a = 0; a < 3; a++) { if (v[a] < min[a]) min[a] = v[a]; if (v[a] > max[a]) max[a] = v[a]; }
  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  // long axis = biggest, lateral (thin) axis = smallest, up = middle
  const order = [0, 1, 2].sort((a, b) => size[b] - size[a]);
  const L = order[0], U = order[1], W = order[2];
  const NB = 20;
  const lat = new Array(NB).fill(0).map(() => 0);
  const up = new Array(NB).fill(0).map(() => [Infinity, -Infinity]);
  const cnt = new Array(NB).fill(0);
  const latMin = new Array(NB).fill(Infinity);
  const latMax = new Array(NB).fill(-Infinity);
  const span = Math.max(size[L], 1e-9);
  for (const v of verts) {
    let b = Math.floor(((v[L] - min[L]) / span) * NB);
    if (b < 0) b = 0; if (b >= NB) b = NB - 1;
    cnt[b]++;
    if (v[W] < latMin[b]) latMin[b] = v[W];
    if (v[W] > latMax[b]) latMax[b] = v[W];
    if (v[U] < up[b][0]) up[b][0] = v[U];
    if (v[U] > up[b][1]) up[b][1] = v[U];
  }
  const AX = "xyz";
  const fmt = (arr) => arr.map((n) => (Number.isFinite(n) ? n.toFixed(2) : "-")).join(" ");
  const latW = latMin.map((_, i) => (Number.isFinite(latMin[i]) ? (latMax[i] - latMin[i]) / Math.max(size[W], 1e-9) : 0));
  const upW = up.map((p) => (Number.isFinite(p[0]) ? (p[1] - p[0]) / Math.max(size[U], 1e-9) : 0));
  console.log(`\n=== ${name} ===  verts=${verts.length}`);
  console.log(`size: x=${size[0].toFixed(3)} y=${size[1].toFixed(3)} z=${size[2].toFixed(3)}  | long=${AX[L]} up=${AX[U]} lateral=${AX[W]}`);
  console.log(`min:  x=${min[0].toFixed(2)} y=${min[1].toFixed(2)} z=${min[2].toFixed(2)}`);
  console.log(`lateral width per slice (min->max along ${AX[L]}):\n  ${fmt(latW)}`);
  console.log(`up extent per slice:\n  ${fmt(upW)}`);
  console.log(`vertex density per slice:\n  ${fmt(cnt.map((c) => c / verts.length))}`);
  const half = NB / 2;
  const latLo = latW.slice(0, 5).reduce((a, b) => a + b, 0);
  const latHi = latW.slice(-5).reduce((a, b) => a + b, 0);
  const upLo = upW.slice(0, 5).reduce((a, b) => a + b, 0);
  const upHi = upW.slice(-5).reduce((a, b) => a + b, 0);
  const volLo = cnt.slice(0, half).reduce((a, b) => a + b, 0);
  const volHi = cnt.slice(half).reduce((a, b) => a + b, 0);
  console.log(`ends: latLo=${latLo.toFixed(2)} latHi=${latHi.toFixed(2)} | upLo=${upLo.toFixed(2)} upHi=${upHi.toFixed(2)} | massLo=${volLo} massHi=${volHi}`);
  console.log(`=> guess nose at ${latLo > latHi ? "MIN" : "MAX"} of ${AX[L]} (by lateral thickness)`);
}

for (const f of fs.readdirSync(DIR).filter((f) => f.endsWith(".glb")).sort()) {
  try {
    const { verts } = collect(path.join(DIR, f));
    stats(f, verts);
  } catch (e) {
    console.log(`\n=== ${f} === FAILED: ${e.message}`);
  }
}
