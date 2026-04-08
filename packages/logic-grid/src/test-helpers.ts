import type { Category, Grid, SpatialWords } from "./types";
import { ORDINALS } from "./grid-utils";

const CLASSIC_SPATIAL_WORDS: SpatialWords = {
  verb: ["lives", "does not live"],
  adjacency: "next to",
  direction: ["left of", "right of"],
  between: "somewhere between",
  atPosition: ["lives in", "does not live in"],
  cardinals: ["zero", "one", "two", "three", "four", "five", "six", "seven"],
};

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
  const positionNoun = partial.positionNoun ?? ["house", "houses"];
  const positionPreposition = partial.positionPreposition ?? "in";
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
    spatialWords: partial.spatialWords ?? CLASSIC_SPATIAL_WORDS,
    positionLabels,
  };
}
