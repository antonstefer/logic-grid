import path from "path";

// Resolve the libraries to source, so the demo needs no library build and hot
// reloads library changes. The `paths` in tsconfig.json mirror these.
export const alias = {
  "logic-grid": path.resolve(import.meta.dirname, "../logic-grid/src/index.ts"),
  "logic-grid-ai": path.resolve(
    import.meta.dirname,
    "../logic-grid-ai/src/index.ts",
  ),
};
