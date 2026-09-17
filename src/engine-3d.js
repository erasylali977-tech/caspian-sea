import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { prepareSwimMesh, deformSwim } from "./swim-motion.js";
import { headSideHint } from "./fish-facing.js";
import { templateFacesRight } from "./templates-data.js";

const FISH_LENGTH = 1.15;

// How square-on the fish sits to the camera. A pure side view hides the tail
// beat completely, because the tail sweeps straight into the screen.
const QUARTER_TURN = 0.28;
const POSE_TAU = 0.22;

// Extra zoom so a side-view drawing covers the fatter 3D body of each Meshy
// file. Stripe/angel have tall fins; beak is already close to its drawing.
const COVER_ZOOM = {
  stripe: 1.22,
  beak: 1.1,
  goldfish: 1.16,
  ornate: 1.18,
  carp: 1.14,
  carp2: 1.14,
  angel: 1.2,
};

function pixelStats(data, i) {
  const max = Math.max(data[i], data[i + 1], data[i + 2]);
  const min = Math.min(data[i], data[i + 1], data[i + 2]);
  const luma = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  const sat = max === 0 ? 0 : (max - min) / max;
  return { luma, sat, a: data[i + 3] };
}

function isPaper(data, i) {
  const { luma, sat, a } = pixelStats(data, i);
  if (a < 32) return true;
  return luma > 198 && sat < 0.2;
}

function markOutsidePaper(data, w, h) {
  const n = w * h;
  const outside = new Uint8Array(n);
  const stack = [];
  const seed = (i) => {
    if (i < 0 || i >= n || outside[i] || !isPaper(data, i * 4)) return;
    outside[i] = 1;
    stack.push(i);
  };
  for (let x = 0; x < w; x++) {
    seed(x);
    seed((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    seed(y * w);
    seed(y * w + w - 1);
  }
  while (stack.length) {
    const i = stack.pop();
    const x = i % w;
    const y = (i / w) | 0;
    if (x > 0) seed(i - 1);
    if (x + 1 < w) seed(i + 1);
    if (y > 0) seed(i - w);
    if (y + 1 < h) seed(i + w);
  }
  return outside;
}

function floodOutside(data, w, h) {
  const outside = markOutsidePaper(data, w, h);
  const n = w * h;
  const seen = new Uint8Array(n);
  const q = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < n; i++) {
    if (outside[i]) continue;
    seen[i] = 1;
    q[tail++] = i;
  }
  if (!tail) return outside;
  while (head < tail) {
    const i = q[head++];
    const x = i % w;
    const y = (i / w) | 0;
    const o = i * 4;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    const next = [i - 1, i + 1, i - w, i + w];
    const ok = [x > 0, x + 1 < w, y > 0, y + 1 < h];
    for (let k = 0; k < 4; k++) {
      if (!ok[k]) continue;
      const ni = next[k];
      if (seen[ni] || !outside[ni]) continue;
      seen[ni] = 1;
      const no = ni * 4;
      data[no] = r;
      data[no + 1] = g;
      data[no + 2] = b;
      data[no + 3] = 255;
      q[tail++] = ni;
    }
  }
  return outside;
}

function cropToFish(img) {
  const src = document.createElement("canvas");
  src.width = Math.max(2, img.width);
  src.height = Math.max(2, img.height);
  const sctx = src.getContext("2d", { willReadFrequently: true });
  sctx.filter = "saturate(1.45) contrast(1.08) brightness(1.02)";
  sctx.drawImage(img, 0, 0);
  sctx.filter = "none";
  const shot = sctx.getImageData(0, 0, src.width, src.height);
  const { data, width: w, height: h } = shot;
  const outside = markOutsidePaper(data, w, h);
  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  for (let i = 0; i < w * h; i++) {
    if (outside[i]) continue;
    const x = i % w;
    const y = (i / w) | 0;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (maxX <= minX || maxY <= minY) {
    floodOutside(data, w, h);
    sctx.putImageData(shot, 0, 0);
    return src;
  }
  const cropped = sctx.getImageData(minX, minY, maxX - minX + 1, maxY - minY + 1);
  floodOutside(cropped.data, cropped.width, cropped.height);
  const c = document.createElement("canvas");
  c.width = cropped.width;
  c.height = cropped.height;
  c.getContext("2d").putImageData(cropped, 0, 0);
  return c;
}

function coverOntoMesh(src, meshAspect, extraZoom) {
  const W = 512;
  const H = Math.max(2, Math.round(W / Math.max(meshAspect, 0.2)));
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  const scale = Math.max(W / src.width, H / src.height) * extraZoom;
  const dw = src.width * scale;
  const dh = src.height * scale;
  ctx.drawImage(src, (W - dw) / 2, (H - dh) / 2, dw, dh);
  const shot = ctx.getImageData(0, 0, W, H);
  floodOutside(shot.data, W, H);
  ctx.putImageData(shot, 0, 0);
  return c;
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function easeAngle(from, to, dtSec, tau) {
  const k = 1 - Math.exp(-Math.max(0, dtSec) / Math.max(tau, 0.001));
  return from + wrapAngle(to - from) * k;
}

// Meshy files are snout along -Z, back along +Y, thin flanks along X.
// +90° around Y sends the snout to +X (screen-right). A -90° turn left
// them swimming tail-first whenever the tank heading was "go right".
const MODEL_ALIGN = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(0, 1, 0),
  Math.PI / 2
);

function alignModel() {
  return MODEL_ALIGN.clone();
}

// Everything below runs while the aligned group is still detached from the
// scene, so world space *is* fish space: +X out of the snout, +Y out of the
// back, +Z out of the flank facing us.
function meshAxes(child) {
  child.updateWorldMatrix(true, false);
  const fromFish = new THREE.Matrix4().copy(child.matrixWorld).invert();
  const pick = (x, y, z) => {
    const v = new THREE.Vector3(x, y, z).transformDirection(fromFish);
    const axis =
      Math.abs(v.x) >= Math.abs(v.y) && Math.abs(v.x) >= Math.abs(v.z)
        ? "x"
        : Math.abs(v.y) >= Math.abs(v.z)
          ? "y"
          : "z";
    return { axis, sign: v[axis] >= 0 ? 1 : -1 };
  };
  return { nose: pick(1, 0, 0), up: pick(0, 1, 0), side: pick(0, 0, 1) };
}

// Wrap the child's drawing around the model, projected straight onto the
// flanks: along the body to the snout, up the body to the dorsal fin.
function paintDrawingOnFish(aligned, drawingUrl, templateHeadOnRight, templateId) {
  if (!drawingUrl) {
    aligned.traverse((child) => {
      if (!child.isMesh) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((mat) => {
        if (!mat) return;
        mat.side = THREE.DoubleSide;
        mat.needsUpdate = true;
      });
    });
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      aligned.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(aligned);
      const size = box.getSize(new THREE.Vector3());
      const spanAlong = Math.max(size.x, 1e-5);
      const spanUp = Math.max(size.y, 1e-5);
      const minAlong = box.min.x;
      const minUp = box.min.y;
      const meshAspect = spanAlong / spanUp;
      const extraZoom = COVER_ZOOM[templateId] || 1.14;
      const sheet = coverOntoMesh(cropToFish(img), meshAspect, extraZoom);

      const tex = new THREE.CanvasTexture(sheet);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.flipY = true;
      tex.anisotropy = 4;
      tex.generateMipmaps = false;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.needsUpdate = true;

      const hint = headSideHint(img);
      const aspect = img.width / Math.max(img.height, 1);
      const trustHint = aspect > 1.35 && hint !== 0;
      const headOnRight = trustHint ? hint > 0 : templateHeadOnRight;

      const v = new THREE.Vector3();
      aligned.traverse((child) => {
        if (!child.isMesh) return;
        child.geometry = child.geometry.clone();
        child.material = new THREE.MeshBasicMaterial({
          map: tex,
          side: THREE.DoubleSide,
        });
        const geo = child.geometry;
        if (!geo?.attributes?.position) return;
        child.updateWorldMatrix(true, false);

        const pos = geo.attributes.position;
        const uv = new Float32Array(pos.count * 2);
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(child.matrixWorld);
          let u = (v.x - minAlong) / spanAlong;
          if (!headOnRight) u = 1 - u;
          uv[i * 2] = Math.min(1, Math.max(0, u));
          uv[i * 2 + 1] = Math.min(1, Math.max(0, (v.y - minUp) / spanUp));
        }
        geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      });
      resolve();
    };
    img.onerror = () => resolve();
    img.src = drawingUrl;
  });
}

export class ThreeEngine {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.loader = new GLTFLoader();
    this.fish3D = [];
    this.initialized = false;
    this.viewW = 1;
    this.viewH = 1;
  }

  init(width, height) {
    if (this.initialized) return;

    this.viewW = width;
    this.viewH = height;
    this.scene = new THREE.Scene();

    const aspect = width / Math.max(height, 1);
    const frustumSize = 10;
    this.camera = new THREE.OrthographicCamera(
      (frustumSize * aspect) / -2,
      (frustumSize * aspect) / 2,
      frustumSize / 2,
      frustumSize / -2,
      0.1,
      1000
    );
    this.camera.position.set(0, 0, 10);

    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      canvas: document.createElement("canvas"),
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.85));

    const key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(4, 6, 8);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x9ad7ff, 0.35);
    fill.position.set(-5, 2, 6);
    this.scene.add(fill);

    this.initialized = true;
  }

  resize(width, height) {
    if (!this.initialized) return;
    this.viewW = width;
    this.viewH = height;
    const aspect = width / Math.max(height, 1);
    const frustumSize = 10;
    this.camera.left = (frustumSize * aspect) / -2;
    this.camera.right = (frustumSize * aspect) / 2;
    this.camera.top = frustumSize / 2;
    this.camera.bottom = frustumSize / -2;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  addFish(fishData, x, y, scale) {
    if (!this.initialized || !fishData?.model3d) return null;
    const already = this.fish3D.find((item) => item.id === fishData.id);
    if (already) return already;

    const fish3D = {
      id: fishData.id,
      root: null,
      swim: [],
      x,
      y,
      scale: scale || 0.2,
      loaded: false,
      failed: false,
      phase: Math.random() * Math.PI * 2,
      yaw: 0,
      pitch: 0,
      bank: 0,
      posed: false,
      lastYaw: null,
    };

    this.loader.load(
      fishData.model3d,
      async (gltf) => {
        try {
          const inner = gltf.scene.clone(true);
          const raw = new THREE.Box3().setFromObject(inner);
          const rawSize = raw.getSize(new THREE.Vector3());
          inner.scale.setScalar(FISH_LENGTH / Math.max(rawSize.x, rawSize.y, rawSize.z, 0.001));
          inner.updateMatrixWorld(true);
          const scaled = new THREE.Box3().setFromObject(inner);
          inner.position.sub(scaled.getCenter(new THREE.Vector3()));

          const aligned = new THREE.Group();
          aligned.add(inner);
          aligned.quaternion.copy(alignModel());
          aligned.updateMatrixWorld(true);

          await paintDrawingOnFish(
            aligned,
            fishData.image,
            templateFacesRight(fishData.templateId),
            fishData.templateId
          );

          const swim = [];
          inner.traverse((child) => {
            if (!child.isMesh) return;
            const part = prepareSwimMesh(child, meshAxes(child), fishData.templateId);
            if (part) swim.push(part);
          });

          const root = new THREE.Group();
          // Yaw around the tank's up axis, then pitch the snout in the screen
          // plane. ZYX stood them on their tails; YZX keeps the belly down
          // while the nose follows the swim direction.
          root.rotation.order = "YZX";
          root.add(aligned);
          this.scene.add(root);
          fish3D.root = root;
          fish3D.swim = swim;
          fish3D.loaded = true;
        } catch (err) {
          fish3D.failed = true;
          console.error("Ошибка подготовки 3D модели:", fishData.model3d, err);
        }
      },
      undefined,
      (error) => {
        fish3D.failed = true;
        console.error("Не удалось загрузить 3D модель:", fishData.model3d, error);
      }
    );

    this.fish3D.push(fish3D);
    return fish3D;
  }

  updateFish(fish3D, x, y, heading, phase = 0, speed = 0.05, dt = 16, swimYaw = null, pitch = null) {
    if (!fish3D?.loaded || !fish3D.root) return;
    const root = fish3D.root;
    const aspect = this.camera.right / this.camera.top;
    root.position.x = (x / this.viewW - 0.5) * 10 * aspect;
    root.position.y = -(y / this.viewH - 0.5) * 10;
    const dtSec = Math.min(0.05, Math.max(0.001, dt / 1000));

    // swimYaw 0 = nose to the right, π = nose to the left. Pitch is the
    // screen-space climb (positive = down). Both come from the same values
    // that move the fish, so the snout cannot trail behind the path.
    const yaw =
      swimYaw == null
        ? Math.cos(heading) >= 0
          ? 0
          : Math.PI
        : swimYaw;
    const dive =
      pitch == null ? Math.atan2(Math.sin(heading), Math.abs(Math.cos(heading))) : pitch;
    const along = Math.cos(yaw);

    const targetYaw = yaw - QUARTER_TURN * along;
    // Belly stays down: pitch in the screen plane, flipped when the fish
    // already faces left so the snout still follows +Y-down of the tank.
    const targetPitch = -dive * along;

    if (!fish3D.posed) {
      fish3D.yaw = targetYaw;
      fish3D.pitch = targetPitch;
      fish3D.posed = true;
    } else {
      fish3D.yaw = easeAngle(fish3D.yaw, targetYaw, dtSec, POSE_TAU);
      fish3D.pitch = easeAngle(fish3D.pitch, targetPitch, dtSec, POSE_TAU);
    }

    const turn = fish3D.lastYaw == null ? 0 : wrapAngle(yaw - fish3D.lastYaw);
    fish3D.lastYaw = yaw;
    const lean = Math.max(-0.28, Math.min(0.28, turn * 12));
    fish3D.bank += (lean - fish3D.bank) * 0.06;

    root.rotation.y = fish3D.yaw;
    root.rotation.z = fish3D.pitch + Math.sin(phase * 0.55) * 0.018;
    root.rotation.x = fish3D.bank + Math.sin(phase * 0.34) * 0.016;

    fish3D.phase = phase;
    const effort = Math.max(0.45, Math.min(1.15, speed * 11));
    for (const part of fish3D.swim) deformSwim(part, phase, effort);
  }

  removeFish(fish3D) {
    if (!fish3D) return;
    if (fish3D.root) this.scene.remove(fish3D.root);
    const index = this.fish3D.indexOf(fish3D);
    if (index > -1) this.fish3D.splice(index, 1);
  }

  render(ctx2d) {
    if (!this.initialized || this.fish3D.length === 0) return;
    if (!this.fish3D.some((f) => f.loaded)) return;
    this.renderer.render(this.scene, this.camera);
    ctx2d.drawImage(this.renderer.domElement, 0, 0, this.viewW, this.viewH);
  }
}
