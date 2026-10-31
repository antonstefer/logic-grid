import adapter from "@sveltejs/adapter-cloudflare";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import path from "path";
import fs from "fs";
import { alias } from "./aliases.ts";

// Walk up from this config until we find a `node_modules/@sveltejs/kit` —
// handles both the main repo and git worktrees (which share the main repo's
// node_modules) without hard-coding any paths. Throws if none is found
// rather than silently falling back to `start`, since the downstream
// Vite fs-access error would be cryptic.
const MAX_WALK_DEPTH = 20; // deep enough for nested worktrees; bounded so we hit the filesystem root rather than loop.
function findDepsRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < MAX_WALK_DEPTH; i++) {
    if (fs.existsSync(path.join(dir, "node_modules", "@sveltejs", "kit")))
      return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `Could not locate node_modules/@sveltejs/kit starting from ${start}. ` +
      `Run 'npm install' at the repo root or ensure the worktree can reach the main repo.`,
  );
}

export default defineConfig({
  plugins: [sveltekit({ adapter: adapter() })],
  resolve: { alias },
  server: {
    fs: {
      allow: [
        path.resolve(import.meta.dirname, "../.."),
        findDepsRoot(import.meta.dirname),
      ],
    },
  },
});
