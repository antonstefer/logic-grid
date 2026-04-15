import type { Category, Constraint, Grid, OrderedCategory } from "./types";

/** Type predicate: narrows Category to OrderedCategory. */
export function isOrdered(c: Category): c is OrderedCategory {
  return c.ordered === true;
}

/**
 * Return the list of `ordered: true` categories in declaration order.
 * These are the axes available to comparative constraints.
 * Returns an empty array (never throws) if no ordered category exists.
 */
export function orderedCategories(grid: Grid): OrderedCategory[] {
  return grid.categories.filter(isOrdered);
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
  if (!isOrdered(cat)) {
    throw new RangeError(
      `Axis "${axisName}" must reference an ordered category`,
    );
  }
  return cat;
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
 * The pinned axis: the first ordered category, identity-pinned by `encodeBase`
 * (rank = position) for symmetry breaking. This is the canonical "row anchor"
 * of the SAT encoding and is independent of `grid.displayAxis` (which is a
 * UI presentation hint, not a solver concern).
 */
export function pinnedAxis(grid: Grid): OrderedCategory | undefined {
  return grid.categories.find(isOrdered);
}

/** True when `axis` is the pinned (row-anchor) axis. */
export function isPinnedAxis(grid: Grid, axis: Category): boolean {
  return pinnedAxis(grid) === axis;
}

/**
 * Return the presentation display-anchor category for the grid. Reads
 * `grid.displayAxis` when set; otherwise returns the first ordered category.
 * Throws if no ordered category exists.
 */
export function displayAxisCategory(grid: Grid): OrderedCategory {
  if (grid.displayAxis !== undefined) {
    return resolveAxis(grid, grid.displayAxis);
  }
  const first = orderedCategories(grid)[0];
  if (!first) {
    throw new RangeError("Grid has no ordered category to use as display axis");
  }
  return first;
}

/**
 * Validate that every comparative constraint in `constraints` references an
 * ordered category that exists in the grid. Throws on the first violation.
 */
export function validateConstraints(
  constraints: Constraint[],
  grid: Grid,
): void {
  for (const c of constraints) {
    if ("axis" in c && typeof c.axis === "string") {
      resolveAxis(grid, c.axis);
    }
  }
}
