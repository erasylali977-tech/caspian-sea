import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { prepareSwimMesh, deformSwim } from "./swim-motion.js";
import { headSideHint } from "./fish-facing.js";
import { templateFacesRight } from "./templates-data.js";

const FISH_LENGTH = 1.15;

// How square-on the fish sits to the camera. A pure side view hides the tail
// beat completely, because the tail sweeps straight into the screen.
const QUARTER_TURN = 0.28;

const FLIP_DEADZONE = 0.5;

// How long the fish takes to show the other flank. Shortest-path 180° yaw
// looks like a card flip; blending 0→1 over a couple of seconds turns
// through the camera the way a real fish banks around.
const TURN_TAU = 2.2;
const ROLL_TAU = 0.22;

function boostDrawing(img) {
  const c = document.createElement("canvas");
  c.width = Math.max(2, img.width);
  c.height = Math.max(2, img.height);
  const ctx = c.getContext("2d");
  ctx.filter = "saturate(1.45) contrast(1.12) brightness(1.06)";
  ctx.drawImage(img, 0, 0);
  ctx.filter = "none";
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

// Every Meshy export in /public/models is authored the same way: snout along
// +Z (the tail is at min-Z, where the caudal fin is tallest), back along +Y,
// thin flanks along X. Guessing this from bounding-box thickness flips the
// odd fish (stripe's tail is bulkier than its head) and they swim backwards.
const MODEL_ALIGN = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(0, 1, 0),
  -Math.PI / 2
);
const NOSE_AT_MIN_Z = new Set(["stripe"]);

function alignModel(templateId) {
  const q = MODEL_ALIGN.clone();
  if (NOSE_AT_MIN_Z.has(templateId)) {
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
  }
  return q;
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
function paintDrawingOnFish(aligned, drawingUrl, templateHeadOnRight) {
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
      const tex = new THREE.CanvasTexture(boostDrawing(img));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.flipY = true;
      tex.anisotropy = 4;
      tex.needsUpdate = true;

      // Which end of the drawing is the head? The template it was matched
      // against knows, but trust the drawing itself when it is obvious - a
      // photo taken with a mirroring front camera comes in back to front.
      // Disc-shaped fish (angel, puffer) have no real caudal waist, and the
      // silhouette hint then calls the snout a tail. Trust the template unless
      // the drawing is clearly long and the waist is obvious.
      const hint = headSideHint(img);
      const aspect = img.width / Math.max(img.height, 1);
      const trustHint = aspect > 1.35 && hint !== 0;
      const headOnRight = trustHint ? hint > 0 : templateHeadOnRight;

      aligned.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(aligned);
      const size = box.getSize(new THREE.Vector3());
      const spanX = Math.max(size.x, 1e-5);
      const spanY = Math.max(size.y, 1e-5);

      const v = new THREE.Vector3();
      aligned.traverse((child) => {
        if (!child.isMesh) return;
        child.material = new THREE.MeshLambertMaterial({
          map: tex,
          color: 0xffffff,
          side: THREE.DoubleSide,
          transparent: true,
          alphaTest: 0.12,
          depthWrite: true,
        });
        const geo = child.geometry;
        if (!geo?.attributes?.position) return;
        child.updateWorldMatrix(true, false);

        const pos = geo.attributes.position;
        const uv = new Float32Array(pos.count * 2);
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(child.matrixWorld);
          // +X is the snout, which is the right of the image only if that is
          // the way the fish was drawn.
          let u = (v.x - box.min.x) / spanX;
          if (!headOnRight) u = 1 - u;
          uv[i * 2] = Math.min(1, Math.max(0, u));
          uv[i * 2 + 1] = Math.min(1, Math.max(0, (v.y - box.min.y) / spanY));
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
      facing: 1,
      sideBlend: 0,
      yaw: 0,
      roll: 0,
      bank: 0,
      posed: false,
      lastHeading: null,
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
          aligned.quaternion.copy(alignModel(fishData.templateId));
          aligned.updateMatrixWorld(true);

          await paintDrawingOnFish(aligned, fishData.image, templateFacesRight(fishData.templateId));

          const swim = [];
          inner.traverse((child) => {
            if (!child.isMesh) return;
            const part = prepareSwimMesh(child, meshAxes(child));
            if (part) swim.push(part);
          });

          const root = new THREE.Group();
          // Yaw first (pick the flank), then roll in the screen plane, then
          // bank around the snout. Three.js applies the letters in order, so
          // this must be YZX — ZYX rolled them onto their noses when heading
          // was not horizontal.
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

  updateFish(fish3D, x, y, heading, phase = 0, speed = 0.05, dt = 16) {
    if (!fish3D?.loaded || !fish3D.root) return;
    const root = fish3D.root;
    const aspect = this.camera.right / this.camera.top;
    root.position.x = (x / this.viewW - 0.5) * 10 * aspect;
    root.position.y = -(y / this.viewH - 0.5) * 10;
    const dtSec = Math.min(0.05, Math.max(0.001, dt / 1000));

    // The tank works in screen coordinates, where y grows downwards, so a
    // heading of +0.5 is nose-down and the scene angle is its mirror.
    const towards = Math.cos(heading);
    if (towards > FLIP_DEADZONE) fish3D.facing = 1;
    else if (towards < -FLIP_DEADZONE) fish3D.facing = -1;
    const targetSide = fish3D.facing < 0 ? 1 : 0;

    const turn = fish3D.lastHeading === null ? 0 : wrapAngle(heading - fish3D.lastHeading);
    fish3D.lastHeading = heading;

    const rollRight = -heading;
    const rollLeft = Math.PI - heading;

    if (!fish3D.posed) {
      fish3D.sideBlend = targetSide;
      fish3D.roll = rollRight + (rollLeft - rollRight) * targetSide;
      fish3D.posed = true;
    } else {
      fish3D.sideBlend += (targetSide - fish3D.sideBlend) * (1 - Math.exp(-dtSec / TURN_TAU));
    }

    const u = fish3D.sideBlend;
    fish3D.yaw = -QUARTER_TURN + (Math.PI + QUARTER_TURN * 2) * u;
    fish3D.roll = easeAngle(fish3D.roll, rollRight + (rollLeft - rollRight) * u, dtSec, ROLL_TAU);

    // Lean into the turn, the way a fish rolls its belly towards the inside of
    // a bend.
    const lean = Math.max(-0.45, Math.min(0.45, turn * 22)) * fish3D.facing;
    fish3D.bank += (lean - fish3D.bank) * 0.06;

    root.rotation.y = fish3D.yaw;
    root.rotation.z = fish3D.roll + Math.sin(phase * 0.7) * 0.02;
    root.rotation.x = fish3D.bank + Math.sin(phase * 0.45) * 0.03;

    fish3D.phase = phase;
    const effort = Math.max(0.35, Math.min(1.4, speed * 14));
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
