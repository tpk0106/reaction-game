import { defineConfig } from "vite";

// Static output. `base: './'` keeps asset paths relative so the built
// site can be dropped into any subpath of a portfolio host (GitHub Pages,
// Netlify, an /projects/ folder, etc.) without reconfiguring.
export default defineConfig({
  base: "/reaction-game/",
  build: {
    target: "es2020",
    outDir: "dist",
    sourcemap: false,
  },
});
