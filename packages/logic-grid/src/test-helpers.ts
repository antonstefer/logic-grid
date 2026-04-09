import type { Category, Grid, SpatialWords } from "./types";
import {
  DEFAULT_SPATIAL_WORDS,
  DEFAULT_POSITION_NOUN,
  DEFAULT_POSITION_PREPOSITION,
  defaultHouseCategory,
} from "./default-config";

/**
 * Build a Grid from a minimal description, filling in default rendering fields.
 * For tests only — production code should use generate().
 *
 * Prepends a default House ordered category if none of the supplied categories
 * is ordered, matching the buildGrid behavior in generate().
 */
export function makeGrid(partial: {
  size: number;
  categories: Category[];
  positionNoun?: [string, string];
  positionPreposition?: string;
  spatialWords?: SpatialWords;
  displayAxis?: string;
}): Grid {
  const positionNoun = partial.positionNoun ?? DEFAULT_POSITION_NOUN;
  const positionPreposition =
    partial.positionPreposition ?? DEFAULT_POSITION_PREPOSITION;
  let categories = partial.categories;
  if (!categories.some((c) => c.ordered === true)) {
    categories = [defaultHouseCategory(partial.size), ...categories];
  }
  return {
    size: partial.size,
    categories,
    positionNoun,
    positionPreposition,
    spatialWords: partial.spatialWords ?? { ...DEFAULT_SPATIAL_WORDS },
    displayAxis: partial.displayAxis,
  };
}
