import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "logic-grid": path.resolve(__dirname, "../logic-grid/src/index.ts"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
