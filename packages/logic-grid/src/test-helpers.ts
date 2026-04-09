import type { Category, Grid, SpatialWords } from "./types";
import { ORDINALS } from "./grid-utils";
import { DEFAULT_CONFIG } from "./default-config";

/**
 * Build a Grid from a minimal description, filling in default rendering fields.
 * For tests only — production code should use generate().
 */
export function makeGrid(partial: {
  size: number;
  categories: Category[];
  positionNoun?: [string, string];
  positionPreposition?: string;
  spatialWords?: SpatialWords;
  positionLabels?: string[];
}): Grid {
  const positionNoun = partial.positionNoun ?? DEFAULT_CONFIG.positionNoun;
  const positionPreposition =
    partial.positionPreposition ?? DEFAULT_CONFIG.positionPreposition;
  const positionLabels =
    partial.positionLabels ??
    Array.from(
      { length: partial.size },
      (_, i) => `the ${ORDINALS[i]} ${positionNoun[0]}`,
    );
  return {
    size: partial.size,
    categories: partial.categories,
    positionNoun,
    positionPreposition,
    spatialWords: partial.spatialWords ?? DEFAULT_CONFIG.spatialWords,
    positionLabels,
  };
}
