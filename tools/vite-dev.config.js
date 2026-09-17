// Dev-only config used while checking the aquarium in a headless browser:
// same as the real one but polls for file changes, because the filesystem
// watcher does not fire in that environment.
import base from "../vite.config.js";

export default {
  ...base,
  server: {
    ...base.server,
    watch: { usePolling: true, interval: 300 },
  },
};
