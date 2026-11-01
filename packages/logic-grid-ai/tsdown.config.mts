import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  // Keep tsup's output: files named by package type (index.mjs and
  // index.d.mts for ESM, index.js and index.d.ts for CJS), the ES2020 target
  // from tsconfig.json, no JSDoc in the JavaScript and no declaration maps.
  fixedExtension: false,
  target: "es2020",
  dts: { sourcemap: false },
  sourcemap: true,
  outputOptions: { comments: { jsdoc: false } },
});
