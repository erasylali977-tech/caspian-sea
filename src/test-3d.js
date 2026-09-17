import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { FISH } from "./templates-data.js";
import { prepareSwimMesh, deformSwim } from "./swim-motion.js";

const NAMES = {
  stripe: "Полосатик",
  beak: "Носатик",
  goldfish: "Золотая",
  ornate: "Чешуйка",
  carp: "Карасик",
  carp2: "Карпик",
  angel: "Парусник",
};

const models = FISH.filter((fish) => fish.model3d);
const container = document.getElementById("canvas-container");
const loading = document.getElementById("loading");
const flat = document.getElementById("flat");
const tabs = document.getElementById("tabs");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x083a62);
scene.fog = new THREE.Fog(0x02344a, 12, 42);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
camera.position.set(0, 1.2, 6);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.target.set(0, 0, 0);

scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const mainLight = new THREE.DirectionalLight(0xffffff, 1.4);
mainLight.position.set(5, 10, 5);
mainLight.castShadow = true;
scene.add(mainLight);
const fill = new THREE.DirectionalLight(0x93d5f5, 0.7);
fill.position.set(-5, 4, -3);
scene.add(fill);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40),
  new THREE.ShadowMaterial({ opacity: 0.18 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -1.6;
ground.receiveShadow = true;
scene.add(ground);

const loader = new GLTFLoader();
let current = null;
let swimParts = [];
let phase = 0;
let autoSpin = true;

function fitRenderer() {
  const w = container.clientWidth || window.innerWidth / 2;
  const h = container.clientHeight || window.innerHeight - 72;
  camera.aspect = w / Math.max(h, 1);
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

function clearModel() {
  if (!current) return;
  scene.remove(current);
  current.traverse((child) => {
    if (child.isMesh) {
      child.geometry?.dispose();
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((m) => m?.dispose());
    }
  });
  current = null;
  swimParts = [];
}

function loadFish(fish) {
  flat.src = fish.src;
  loading.style.display = "grid";
  clearModel();
  loader.load(
    fish.model3d,
    (gltf) => {
      try {
        current = gltf.scene;
        current.traverse((child) => {
          if (!child.isMesh) return;
          child.castShadow = true;
          child.receiveShadow = true;
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach((mat) => {
            if (!mat) return;
            mat.side = THREE.DoubleSide;
            mat.needsUpdate = true;
          });
          const part = prepareSwimMesh(child);
          if (part) swimParts.push(part);
        });
        const box = new THREE.Box3().setFromObject(current);
        current.position.sub(box.getCenter(new THREE.Vector3()));
        const size = box.getSize(new THREE.Vector3());
        current.scale.multiplyScalar(3 / Math.max(size.x, size.y, size.z, 0.001));
        scene.add(current);
        loading.style.display = "none";
        loading.innerHTML = '<div class="spinner"></div><div>Загрузка модели…</div>';
      } catch (err) {
        console.error(err);
        loading.innerHTML = `<div>Ошибка подготовки модели<br/>${String(err.message || err)}</div>`;
      }
    },
    undefined,
    (error) => {
      console.error(error);
      loading.innerHTML = `<div>Не удалось загрузить 3D модель<br/>${String(error?.message || error)}</div>`;
    }
  );
}

tabs.innerHTML = models
  .map(
    (fish, i) =>
      `<button type="button" data-id="${fish.id}" class="${i === 0 ? "active" : ""}">${NAMES[fish.id] || fish.id}</button>`
  )
  .join("");

tabs.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-id]");
  if (!btn) return;
  tabs.querySelectorAll("button").forEach((el) => el.classList.toggle("active", el === btn));
  const fish = models.find((item) => item.id === btn.dataset.id);
  if (fish) loadFish(fish);
});

renderer.domElement.addEventListener("pointerdown", () => {
  autoSpin = false;
});

function animate() {
  requestAnimationFrame(animate);
  phase += 0.045;
  if (current && autoSpin) current.rotation.y += 0.008;
  if (current) current.position.y = Math.sin(Date.now() * 0.001) * 0.12;
  for (const part of swimParts) deformSwim(part, phase, 1);
  orbit.update();
  renderer.render(scene, camera);
}

window.addEventListener("resize", fitRenderer);
fitRenderer();
animate();
if (models[0]) loadFish(models[0]);
