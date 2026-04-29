import { defineConfig } from "vitest/config";
import * as path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "logic-grid": path.resolve(__dirname, "../logic-grid/src/index.ts"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      include: ["src/**/*.ts"],
      exclude: [
        "src/index.ts",
        "src/types.ts",
        "src/test-utils.ts",
        "src/**/*.test.ts",
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
