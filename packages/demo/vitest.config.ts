import { defineConfig } from "vitest/config";
import { sveltekit } from "@sveltejs/kit/vite";

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      // Scope to the surface that has tests. Svelte components and the
      // Svelte 5 .svelte.ts state module would need a DOM-based component
      // test harness we don't have set up — they're intentionally excluded.
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.svelte",
        "src/**/*.svelte.ts",
        "src/**/*.test.ts",
        "src/routes/+layout.ts",
        "src/routes/**/$types.d.ts",
      ],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
