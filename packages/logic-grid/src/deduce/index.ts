import type {
  Constraint,
  Grid,
  DeductionStep,
  DeductionResult,
} from "../types";
import { createState, isSolved } from "./state";
import { tryConstraint } from "./constraints";
import { structuralTechniques } from "./structural";
import { tryContradiction } from "./contradiction";

// --- Public API ---

/** Solve a puzzle step-by-step using human-style deduction. */
export function deduce(constraints: Constraint[], grid: Grid): DeductionResult {
  const state = createState(grid);
  const steps: DeductionStep[] = [];

  let progress = true;
  while (progress && !isSolved(state)) {
    progress = false;

    // Try each constraint
    for (let ci = 0; ci < constraints.length; ci++) {
      const s = tryConstraint(state, constraints[ci], ci);
      if (s) {
        steps.push(s);
        progress = true;
        break;
      }
    }
    if (progress) continue;

    // Try structural deductions (ordered by complexity)
    for (const tryTechnique of structuralTechniques) {
      const s = tryTechnique(state);
      if (s) {
        steps.push(s);
        progress = true;
        break;
      }
    }
    if (progress) continue;

    const contra = tryContradiction(state, constraints);
    if (contra) {
      steps.push(contra);
      progress = true;
    }
  }

  return { steps, complete: isSolved(state) };
}

/**
 * Get the next logical deduction from a partial state.
 *
 * Note: this re-runs the full deduction engine internally and returns
 * the first step that goes beyond `known`. For interactive use, prefer
 * calling `deduce()` once and iterating over its steps.
 */
export function hint(
  constraints: Constraint[],
  grid: Grid,
  known?: Record<string, number>,
): DeductionStep | null {
  const result = deduce(constraints, grid);
  if (!known || Object.keys(known).length === 0) {
    return result.steps[0] ?? null;
  }

  // Find the first step that affects a value the user doesn't have yet
  for (const s of result.steps) {
    const items = s.assignments.length > 0 ? s.assignments : s.eliminations;
    if (items.some((i) => !(i.value in known))) return s;
  }
  return null;
}
