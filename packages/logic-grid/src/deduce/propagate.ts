import type { Constraint } from "../types";
import type { DeduceState } from "./state";
import { tryConstraint } from "./constraints";
import { structuralTechniques } from "./structural";

/** Run all constraint propagation and structural deductions to fixpoint. Returns false on contradiction. */
export function propagateToFixpoint(
  state: DeduceState,
  constraints: Constraint[],
): boolean {
  state.silent = true;
  let changed = true;
  while (changed) {
    for (const cat of state.possible)
      for (const ps of cat) if (ps.size === 0) return false;
    changed = false;
    // Run all constraints and structural techniques per iteration (not breaking
    // after the first hit) so a single pass extracts maximum information and we
    // reach fixpoint in fewer iterations.
    for (let ci = 0; ci < constraints.length; ci++)
      if (tryConstraint(state, constraints[ci], ci) !== null) changed = true;
    for (const tryTechnique of structuralTechniques)
      if (tryTechnique(state) !== null) changed = true;
  }

  return true;
}
