import * as THREE from "three";

const OFFSET = { x: 0, y: 1, z: 2 };

// `axes` says where the fish's snout, back and near flank point in this mesh's
// own vertex coordinates. Getting it from the caller rather than guessing here
// matters: guess the snout wrong and the fish wags its head while the tail
// trails behind it.
export function prepareSwimMesh(mesh, axes) {
  const geometry = mesh.geometry;
  if (!geometry?.attributes?.position) return null;

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
    tick: 0,
  };
}

export function deformSwim(part, phase, effort = 1) {
  const { geometry, orig, body, lat, up, upSign, min, span, halfLat, halfUp, tailAtMax } = part;
  const arr = geometry.attributes.position.array;
  const drive = 0.45 + Math.min(1, Math.max(0.2, effort)) * 0.55;
  const amp = 0.032 * drive;
  const finAmp = 0.028 * drive;

  for (let i = 0; i < orig.length; i += 3) {
    // 0 at the snout, 1 at the tip of the tail.
    let t = (orig[i + body] - min) / span;
    if (!tailAtMax) t = 1 - t;
    const tail = t * t * t;

    const wave = Math.sin(phase * 1.15 - t * 2.4) * amp * tail;
    const upNorm = (orig[i + up] * upSign) / halfUp;
    const side = orig[i + lat] / halfLat;

    const keel = Math.max(0, Math.abs(upNorm) - 0.28);
    const dorsal = keel * (t > 0.22 && t < 0.85 ? 1 : 0.15);
    const finLat = Math.sin(phase * 1.7 + t * 2.2) * finAmp * dorsal;
    const caudalFan = Math.sin(phase * 1.15 - 0.8) * amp * 0.55 * Math.max(0, t - 0.62) * upNorm;
    const pectoral = Math.max(0, Math.abs(side) - 0.38) * (t > 0.12 && t < 0.48 ? 1 : 0);
    const pecUp = Math.sin(phase * 1.9) * finAmp * 0.55 * pectoral * Math.sign(side || 1) * upSign;

    arr[i] = orig[i];
    arr[i + 1] = orig[i + 1];
    arr[i + 2] = orig[i + 2];
    arr[i + lat] = orig[i + lat] + wave + finLat * Math.sign(upNorm || 1);
    arr[i + up] = orig[i + up] + caudalFan + pecUp;
  }

  geometry.attributes.position.needsUpdate = true;
  part.tick = (part.tick + 1) % 12;
  if (part.tick === 0) geometry.computeVertexNormals();
}
