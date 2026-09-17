import * as THREE from "three";

const OFFSET = { x: 0, y: 1, z: 2 };

const STYLE = {
  stripe: { tail: 1.08, fin: 1.12, pec: 1.0 },
  beak: { tail: 1.0, fin: 1.18, pec: 1.1 },
  goldfish: { tail: 1.06, fin: 1.22, pec: 0.9 },
  ornate: { tail: 1.0, fin: 1.28, pec: 0.85 },
  carp: { tail: 1.0, fin: 0.95, pec: 0.85 },
  carp2: { tail: 1.02, fin: 1.08, pec: 0.9 },
  angel: { tail: 0.72, fin: 1.42, pec: 0.7 },
};

export function prepareSwimMesh(mesh, axes, templateId) {
  const geometry = mesh.geometry;
  if (!geometry?.attributes?.position) return null;
  axes = axes || { nose: { axis: "x", sign: 1 }, up: { axis: "y", sign: 1 }, side: { axis: "z", sign: 1 } };

  const pos = geometry.attributes.position;
  const count = pos.count;
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    arr[i * 3] = pos.getX(i);
    arr[i * 3 + 1] = pos.getY(i);
    arr[i * 3 + 2] = pos.getZ(i);
  }

  const swimGeo = new THREE.BufferGeometry();
  swimGeo.setAttribute("position", new THREE.BufferAttribute(arr, 3));

  if (geometry.index) swimGeo.setIndex(geometry.index.clone());

  if (geometry.attributes.uv) {
    const uv = geometry.attributes.uv;
    const uarr = new Float32Array(uv.count * 2);
    for (let i = 0; i < uv.count; i++) {
      uarr[i * 2] = uv.getX(i);
      uarr[i * 2 + 1] = uv.getY(i);
    }
    swimGeo.setAttribute("uv", new THREE.BufferAttribute(uarr, 2));
  }

  swimGeo.computeVertexNormals();
  swimGeo.computeBoundingBox();
  mesh.geometry = swimGeo;

  const box = swimGeo.boundingBox;
  const size = box.getSize(new THREE.Vector3());
  const body = axes.nose.axis;
  const style = STYLE[templateId] || STYLE.carp;

  return {
    mesh,
    geometry: swimGeo,
    orig: Float32Array.from(arr),
    body: OFFSET[body],
    lat: OFFSET[axes.side.axis],
    up: OFFSET[axes.up.axis],
    upSign: axes.up.sign,
    min: box.min[body],
    span: Math.max(size[body], 0.0001),
    halfLat: Math.max(size[axes.side.axis] * 0.5, 0.0001),
    halfUp: Math.max(size[axes.up.axis] * 0.5, 0.0001),
    tailAtMax: axes.nose.sign < 0,
    style,
    tick: 0,
  };
}

export function deformSwim(part, phase, effort = 1) {
  const { geometry, orig, body, lat, up, upSign, min, span, halfLat, halfUp, tailAtMax, style } = part;
  const arr = geometry.attributes.position.array;
  const drive = Math.min(1.12, 0.7 + Math.max(0.25, effort) * 0.55);
  const amp = 0.064 * drive * style.tail;
  const finAmp = 0.058 * drive * style.fin;
  const pecAmp = 0.05 * drive * style.pec;

  for (let i = 0; i < orig.length; i += 3) {
    let t = (orig[i + body] - min) / span;
    if (!tailAtMax) t = 1 - t;

    // Carangiform: head almost still, a slow S through the body, power in the tail.
    const envelope = t * t;
    const wave = Math.sin(phase * 1.72 - t * Math.PI * 1.28) * amp * envelope;
    const bodyWave = Math.sin(phase * 0.92 - t * 1.85) * amp * 0.22 * (1 - Math.abs(t - 0.42));

    const upNorm = (orig[i + up] * upSign) / halfUp;
    const side = orig[i + lat] / halfLat;

    const keel = Math.max(0, Math.abs(upNorm) - 0.2);
    const alongFin = t > 0.16 && t < 0.84 ? 1 : t > 0.84 ? 0.3 : 0.14;
    const dorsal = keel * alongFin;
    const finBeat = Math.sin(phase * 2.55 + t * 3.1);
    const finLat = finBeat * finAmp * dorsal;
    const finSweep = Math.sin(phase * 2.55 + t * 3.1 + 0.6) * finAmp * 1.15 * dorsal;

    const tail = Math.max(0, t - 0.55) / 0.45;
    const caudalFan = Math.sin(phase * 1.72 - 1.05) * amp * 0.9 * tail * tail * upNorm;
    const caudalLat = wave * tail * 0.4;

    const pectoral = Math.max(0, Math.abs(side) - 0.3) * (t > 0.08 && t < 0.5 ? 1 : 0);
    const pecBeat = Math.sin(phase * 2.95 + t * 1.6);
    const pecUp = pecBeat * pecAmp * 1.05 * pectoral * Math.sign(side || 1) * upSign;
    const pecRow = Math.sin(phase * 2.95 + 0.8) * pecAmp * 0.9 * pectoral;

    arr[i] = orig[i];
    arr[i + 1] = orig[i + 1];
    arr[i + 2] = orig[i + 2];
    arr[i + lat] = orig[i + lat] + wave + bodyWave + finLat * Math.sign(upNorm || 1) + caudalLat;
    arr[i + up] = orig[i + up] + caudalFan + pecUp;
    arr[i + body] = orig[i + body] + finSweep * Math.sign(upNorm || 1) * 0.45 + pecRow * Math.sign(side || 1);
  }

  geometry.attributes.position.needsUpdate = true;
  part.tick = (part.tick + 1) % 6;
  if (part.tick === 0) geometry.computeVertexNormals();
}
