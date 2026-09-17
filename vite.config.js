import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import { localRoomRelay } from "./vite.room-relay.js";

const HUGE_GLB_BYTES = 8 * 1024 * 1024;

function omitHugePublicGlbs() {
  return {
    name: "omit-huge-public-glbs",
    closeBundle() {
      const fishDir = path.resolve("dist/fish");
      if (!fs.existsSync(fishDir)) return;
      for (const name of fs.readdirSync(fishDir)) {
        if (!name.endsWith(".glb")) continue;
        const file = path.join(fishDir, name);
        if (fs.statSync(file).size > HUGE_GLB_BYTES) fs.unlinkSync(file);
      }
    },
  };
}

export default defineConfig({
  appType: "mpa",
  plugins: [omitHugePublicGlbs(), localRoomRelay()],
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        aquarium: "aquarium.html",
        join: "join.html",
        templates: "templates.html",
        test3d: "test-3d.html",
      },
    },
  },
  server: {
    host: true,
    port: 5173,
  },
});
