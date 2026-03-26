import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  plugins: [sveltekit()],
  resolve: {
    alias: {
      // Resolve to source for hot reload during dev
      "logic-grid": path.resolve(__dirname, "../logic-grid/src/index.ts"),
    },
  },
});
