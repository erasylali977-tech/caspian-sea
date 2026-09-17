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
  const amp = 0.09 * Math.min(1.3, 0.55 + effort * 8);
  const finAmp = 0.085 * Math.min(1.2, 0.55 + effort * 6);

  for (let i = 0; i < orig.length; i += 3) {
    // 0 at the snout, 1 at the tip of the tail.
    let t = (orig[i + body] - min) / span;
    if (!tailAtMax) t = 1 - t;

    // The stroke travels down the body and gets bigger as it goes, so the
    // head barely moves and the tail does the work.
    const wave = Math.sin(phase * 2.15 - t * Math.PI * 1.35) * amp * t * t;
    const bodyWave = Math.sin(phase * 1.05 - t * 2.1) * amp * 0.2 * (1 - Math.abs(t - 0.45));

    const upNorm = (orig[i + up] * upSign) / halfUp;
    const side = orig[i + lat] / halfLat;

    // Dorsal / anal: the outer third of the height. Sweep the trailing edge
    // along the body so the flap reads in a side view, not only into the camera.
    const keel = Math.max(0, Math.abs(upNorm) - 0.18);
    const alongFin = t > 0.16 && t < 0.82 ? 1 : t > 0.82 ? 0.25 : 0.12;
    const dorsal = keel * alongFin;
    const finBeat = Math.sin(phase * 3.4 + t * 3.6);
    const finLat = finBeat * finAmp * dorsal;
    const finSweep = Math.sin(phase * 3.4 + t * 3.6 + 0.7) * finAmp * 1.35 * dorsal;

    // Caudal: fan the tail open and shut in the profile plane.
    const tail = Math.max(0, t - 0.58) / 0.42;
    const caudalFan = Math.sin(phase * 2.15 - 1.15) * amp * 0.85 * tail * tail * upNorm;
    const caudalLat = wave * tail * 0.45;

    // Pectorals sit on the flanks near the head and row.
    const pectoral = Math.max(0, Math.abs(side) - 0.28) * (t > 0.08 && t < 0.52 ? 1 : 0);
    const pecBeat = Math.sin(phase * 4.2 + t * 2);
    const pecUp = pecBeat * finAmp * 1.25 * pectoral * Math.sign(side || 1) * upSign;
    const pecRow = Math.sin(phase * 4.2 + 0.9) * finAmp * 1.15 * pectoral;

    arr[i] = orig[i];
    arr[i + 1] = orig[i + 1];
    arr[i + 2] = orig[i + 2];
    arr[i + lat] = orig[i + lat] + wave + bodyWave + finLat * Math.sign(upNorm || 1) + caudalLat;
    arr[i + up] = orig[i + up] + caudalFan + pecUp;
    arr[i + body] = orig[i + body] + finSweep * Math.sign(upNorm || 1) * 0.55 + pecRow * Math.sign(side || 1);
  }

  geometry.attributes.position.needsUpdate = true;
  part.tick = (part.tick + 1) % 3;
  if (part.tick === 0) geometry.computeVertexNormals();
}
