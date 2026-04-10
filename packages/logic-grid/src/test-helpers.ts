import type { Category, ComparatorMap, Grid } from "./types";
import { defaultHouseCategory } from "./default-config";

/** Generic comparators for test ordered categories. */
export const TEST_COMPARATORS: ComparatorMap = {
  before: ["is before", "is after"],
  left_of: ["is right before", "is right after"],
  next_to: "is right next to",
  not_next_to: "is not right next to",
  between: "is between",
  not_between: "is not between",
  exact_distance: "is exactly",
};

/**
 * Build a Grid from a minimal description. For tests only — production code
 * should use generate().
 *
 * Prepends a default House ordered category if none of the supplied categories
 * is ordered, matching the buildGrid behavior in generate().
 */
export function makeGrid(partial: {
  size: number;
  categories: Category[];
  displayAxis?: string;
}): Grid {
  let categories = partial.categories;
  if (!categories.some((c) => c.ordered === true)) {
    categories = [defaultHouseCategory(partial.size), ...categories];
  }
  return {
    size: partial.size,
    categories,
    displayAxis: partial.displayAxis,
  };
}
