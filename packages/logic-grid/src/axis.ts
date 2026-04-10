import type { Category, Constraint, Grid, OrderedCategory } from "./types";

/**
 * Return the list of `ordered: true` categories in declaration order.
 * These are the axes available to comparative constraints.
 */
export function orderedCategories(grid: Grid): OrderedCategory[] {
  return grid.categories.filter((c) => c.ordered === true) as OrderedCategory[];
}

/**
 * Resolve an axis name to its ordered category. Throws if the name does not
 * match any category or if the matching category is not ordered.
 */
export function resolveAxis(grid: Grid, axisName: string): OrderedCategory {
  const cat = grid.categories.find((c) => c.name === axisName);
  if (!cat) {
    throw new RangeError(`Unknown axis: "${axisName}"`);
  }
  if (cat.ordered !== true) {
    throw new RangeError(
      `Axis "${axisName}" must reference an ordered category`,
    );
  }
  return cat as OrderedCategory;
}

/**
 * Rank of `value` on the given ordered category. Throws if the category is
 * not ordered or the value does not belong to it.
 */
export function axisRank(category: Category, value: string): number {
  if (category.ordered !== true) {
    throw new RangeError(
      `Category "${category.name}" is not ordered; axisRank undefined`,
    );
  }
  const idx = category.values.indexOf(value);
  if (idx === -1) {
    throw new RangeError(
      `Value "${value}" is not a member of category "${category.name}"`,
    );
  }
  return idx;
}

/**
 * Return the presentation display-anchor category for the grid. Reads
 * `grid.displayAxis` when set; otherwise returns the first ordered category.
 * Throws if no ordered category exists.
 */
export function displayAxisCategory(grid: Grid): Category {
  if (grid.displayAxis !== undefined) {
    return resolveAxis(grid, grid.displayAxis);
  }
  const first = orderedCategories(grid)[0];
  if (!first) {
    throw new RangeError("Grid has no ordered category to use as display axis");
  }
  return first;
}

/** Constraint types that carry an `axis` field. */
const AXIS_CONSTRAINT_TYPES = new Set([
  "next_to",
  "not_next_to",
  "left_of",
  "between",
  "not_between",
  "before",
  "exact_distance",
]);

/**
 * Validate that every comparative constraint in `constraints` references an
 * ordered category that exists in the grid. Throws on the first violation.
 */
export function validateConstraints(
  constraints: Constraint[],
  grid: Grid,
): void {
  for (const c of constraints) {
    if (AXIS_CONSTRAINT_TYPES.has(c.type)) {
      const axisName = (c as { axis: string }).axis;
      resolveAxis(grid, axisName);
    }
  }
}
