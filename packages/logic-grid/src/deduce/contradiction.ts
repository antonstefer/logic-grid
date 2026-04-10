import type { Constraint, DeductionStep } from "../types";
import { type DeduceState, first, step, cloneState, axisTerms } from "./state";
import { propagateToFixpoint } from "./propagate";

/**
 * Proof by contradiction: try placing a value at a position, propagate,
 * and if any value ends up with 0 possible positions, eliminate it.
 * "If X were at position p, then [chain]... contradiction. So X can't be at p."
 *
 * Cost: O(values × positions × propagation), where propagation itself is a
 * fixpoint over all constraints and structural techniques. Acceptable for
 * the supported grid sizes (3–8) and only reached when cheaper techniques stall.
 */
export function tryContradiction(
  state: DeduceState,
  constraints: Constraint[],
): DeductionStep | null {
  for (let ci = 0; ci < state.grid.categories.length; ci++) {
    for (let vi = 0; vi < state.grid.categories[ci].values.length; vi++) {
      const ps = state.possible[ci][vi];
      if (ps.size <= 1) continue;

      for (const p of ps) {
        const cloned = cloneState(state);
        const clonedPs = cloned.possible[ci][vi];
        clonedPs.clear();
        clonedPs.add(p);

        if (!propagateToFixpoint(cloned, constraints)) {
          // Contradiction found — eliminate this position
          ps.delete(p);
          const value = state.grid.categories[ci].values[vi];
          const assigns = ps.size === 1 ? [{ value, position: first(ps) }] : [];
          const { noun, posLabel } = axisTerms(state.grid);
          const assignSuffix =
            assigns.length > 0
              ? ` So ${value} must be in the ${posLabel(assigns[0].position)} ${noun}.`
              : "";
          return step(
            "contradiction",
            [],
            [{ value, position: p }],
            assigns,
            `If ${value} were in the ${posLabel(p)} ${noun}, it would lead to a contradiction.${assignSuffix}`,
          );
        }
      }
    }
  }
  return null;
}
