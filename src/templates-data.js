import { dropSmallBlobs } from "./creature.js";

// `faces` is the way the fish is drawn on the printed template. The 3D models
// all swim nose-first the same way, so this is what tells the aquarium which
// end of the drawing to wrap around the snout.
export const FISH = [
  { id: "stripe", nameKey: "fishStripe", src: "/fish/stripe.jpeg", model3d: "/models/stripe.glb", kind: "fish", faces: "right" },
  { id: "beak", nameKey: "fishBeak", src: "/fish/beak.png", model3d: "/models/beak.glb", kind: "fish", faces: "left" },
  { id: "goldfish", nameKey: "fishGold", src: "/fish/goldfish.jpeg", model3d: "/models/goldfish.glb", kind: "fish", faces: "right" },
  { id: "ornate", nameKey: "fishOrnate", src: "/fish/ornate.webp", model3d: "/models/ornate.glb", kind: "fish", faces: "left" },
  { id: "carp", nameKey: "fishCarp", src: "/fish/carp.webp", model3d: "/models/carp.glb", kind: "fish", faces: "left" },
  { id: "carp2", nameKey: "fishCarp2", src: "/fish/carp2.webp", model3d: "/models/carp2.glb", kind: "fish", faces: "left" },
  { id: "angel", nameKey: "fishAngel", src: "/fish/angel.jpg", model3d: "/models/angel.glb", kind: "fish", faces: "left" },
];

export function templateFacesRight(templateId) {
  if (!templateId) return true;
  const template = FISH.find((item) => item.id === templateId);
  return template ? template.faces === "right" : true;
}

export const SCENES = [
  { id: "ship", nameKey: "sceneShip", src: "/scenes/scene-ship.png" },
  { id: "coral", nameKey: "sceneCoral", src: "/scenes/scene-coral.png" },
  { id: "cave", nameKey: "sceneCave", src: "/scenes/scene-cave.png" },
  { id: "kelp", nameKey: "sceneKelp", src: "/scenes/scene-kelp.png" },
  { id: "ruins", nameKey: "sceneRuins", src: "/scenes/scene-ruins.png" },
  { id: "night", nameKey: "sceneNight", src: "/scenes/scene-night.png" },
];

export function toColoringPage(img) {
  const max = 1600;
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(2, Math.round(img.width * scale));
  canvas.height = Math.max(2, Math.round(img.height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const shot = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = shot.data;
  for (let i = 0; i < d.length; i += 4) {
    const luma = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    if (luma > 205) {
      d[i] = d[i + 1] = d[i + 2] = 255;
    } else {
      d[i] = d[i + 1] = d[i + 2] = 28;
    }
    d[i + 3] = 255;
  }
  dropSmallBlobs(shot, "luma");
  ctx.putImageData(shot, 0, 0);
  return canvas.toDataURL("image/png");
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
