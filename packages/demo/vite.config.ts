import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import path from "path";
import fs from "fs";

// Walk up from this config until we find a `node_modules/@sveltejs/kit` —
// handles both the main repo and git worktrees (which share the main repo's
// node_modules) without hard-coding any paths.
function findDepsRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 20; i++) {
    if (fs.existsSync(path.join(dir, "node_modules", "@sveltejs", "kit")))
      return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

export default defineConfig({
  plugins: [sveltekit()],
  resolve: {
    alias: {
      // Resolve to source for hot reload during dev
      "logic-grid": path.resolve(__dirname, "../logic-grid/src/index.ts"),
      "logic-grid-ai": path.resolve(__dirname, "../logic-grid-ai/src/index.ts"),
    },
  },
  server: {
    fs: {
      allow: [path.resolve(__dirname, "../.."), findDepsRoot(__dirname)],
    },
  },
});
