import type { Constraint } from "../types";
import type { DeduceState } from "./state";
import { tryConstraint } from "./constraints";
import {
  tryNakedSingles,
  tryHiddenSingles,
  tryNakedPairs,
  tryNakedTriples,
  tryHiddenPairs,
  tryHiddenTriples,
} from "./structural";

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
    for (let ci = 0; ci < constraints.length; ci++)
      if (tryConstraint(state, constraints[ci], ci) !== null) changed = true;
    if (tryNakedSingles(state) !== null) changed = true;
    if (tryHiddenSingles(state) !== null) changed = true;
    if (tryNakedPairs(state) !== null) changed = true;
    if (tryNakedTriples(state) !== null) changed = true;
    if (tryHiddenPairs(state) !== null) changed = true;
    if (tryHiddenTriples(state) !== null) changed = true;
  }

  return true;
}
