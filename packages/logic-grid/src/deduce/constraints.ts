import type {
  Category,
  Constraint,
  DeductionStep,
  DeductionTechnique,
} from "../types";
import { resolveAxis } from "../axis";
import {
  type DeduceState,
  SILENT_STEP,
  getPossible,
  getAssigned,
  first,
  step,
  collectAssigns,
  describeResult,
  clueRef,
  describeKnown,
  axisRankDomain,
  projectRanksToPositions,
} from "./state";

/** True when `axis` is the pinned display axis (rank = position). */
function isPinnedAxis(state: DeduceState, axis: Category): boolean {
  return state.grid.categories.find((c) => c.ordered === true) === axis;
}

/**
 * Generic rank-space deduction for binary comparative constraints.
 * When the axis is pinned, rank = position so we work directly with
 * possible sets (O(|ps|) per value). For non-pinned axes, computes
 * rank domains and projects back through the axis assignment.
 */
function tryBinaryRankSpace(
  state: DeduceState,
  a: string,
  b: string,
  axis: Category,
  ci: number,
  technique: DeductionTechnique,
  isValid: (rankA: number, rankB: number) => boolean,
  description: string,
): DeductionStep | null {
  const pinned = isPinnedAxis(state, axis);
  const pa = pinned ? getPossible(state, a) : axisRankDomain(state, a, axis);
  const pb = pinned ? getPossible(state, b) : axisRankDomain(state, b, axis);
  if (pa.size === 0 || pb.size === 0) return null;

  // Find ranks to eliminate: bad for X if no Y satisfies the predicate.
  const badA = new Set<number>();
  const badB = new Set<number>();
  for (const ra of pa) {
    let ok = false;
    for (const rb of pb) {
      if (isValid(ra, rb)) { ok = true; break; }
    }
    if (!ok) badA.add(ra);
  }
  for (const rb of pb) {
    let ok = false;
    for (const ra of pa) {
      if (isValid(ra, rb)) { ok = true; break; }
    }
    if (!ok) badB.add(rb);
  }
  if (badA.size === 0 && badB.size === 0) return null;

  // Project to position eliminations: pinned axis = direct, otherwise via axis.
  const elims: { value: string; position: number }[] = [];
  if (pinned) {
    for (const r of badA) elims.push({ value: a, position: r });
    for (const r of badB) elims.push({ value: b, position: r });
  } else {
    elims.push(
      ...projectRanksToPositions(state, a, axis, badA),
      ...projectRanksToPositions(state, b, axis, badB),
    );
  }

  if (elims.length === 0) return null;
  for (const e of elims) getPossible(state, e.value).delete(e.position);
  if (state.silent) return SILENT_STEP;
  const assigns = collectAssigns(state, elims);
  return step(
    technique,
    [ci],
    elims,
    assigns,
    `${clueRef(ci)}${description} ${describeResult(state.terms, assigns, elims)}.`,
  );
}

// --- Constraint deductions ---

export function tryConstraint(
  state: DeduceState,
  constraint: Constraint,
  ci: number,
): DeductionStep | null {
  switch (constraint.type) {
    case "same_position":
      return trySamePosition(state, constraint, ci);
    case "not_same_position":
      return tryNotSamePosition(state, constraint, ci);
    case "next_to":
      return tryNextTo(state, constraint, ci);
    case "not_next_to":
      return tryNotNextTo(state, constraint, ci);
    case "left_of":
      return tryLeftOf(state, constraint, ci);
    case "before":
      return tryBefore(state, constraint, ci);
    case "between":
      return tryBetween(state, constraint, ci);
    case "not_between":
      return tryNotBetween(state, constraint, ci);
    case "exact_distance":
      return tryExactDistance(state, constraint, ci);
  }
}

function trySamePosition(
  state: DeduceState,
  c: { a: string; b: string },
  ci: number,
): DeductionStep | null {
  const pa = getPossible(state, c.a);
  const pb = getPossible(state, c.b);
  const elims: { value: string; position: number }[] = [];
  for (const p of pa) {
    if (!pb.has(p)) elims.push({ value: c.a, position: p });
  }
  for (const p of pb) {
    if (!pa.has(p)) elims.push({ value: c.b, position: p });
  }
  if (elims.length === 0) return null;
  const intersection = new Set([...pa].filter((p) => pb.has(p)));
  pa.clear();
  pb.clear();
  for (const p of intersection) {
    pa.add(p);
    pb.add(p);
  }
  if (state.silent) return SILENT_STEP;
  const assigns: { value: string; position: number }[] = [];
  if (pa.size === 1) {
    const p = first(pa);
    assigns.push({ value: c.a, position: p });
    assigns.push({ value: c.b, position: p });
  }
  // Build "because" context from whichever value is more constrained
  const knownA = describeKnown(state, c.a);
  const knownB = describeKnown(state, c.b);
  const ctx = knownA || knownB;
  const because = ctx ? `. ${ctx}, so ` : ", so ";

  const { noun, posLabel } = state.terms;
  let explanation: string;
  if (assigns.length > 0) {
    explanation = `${clueRef(ci)}${c.a} and ${c.b} are in the same ${noun}${because}both are in the ${posLabel(assigns[0].position)} ${noun}.`;
  } else {
    explanation = `${clueRef(ci)}${c.a} and ${c.b} are in the same ${noun}${because}${describeResult(state.terms, assigns, elims)}.`;
  }
  return step("same_position", [ci], elims, assigns, explanation);
}

function tryNotSamePosition(
  state: DeduceState,
  c: { a: string; b: string },
  ci: number,
): DeductionStep | null {
  const posA = getAssigned(state, c.a);
  const posB = getAssigned(state, c.b);
  const elims: { value: string; position: number }[] = [];
  if (posA !== null && getPossible(state, c.b).has(posA)) {
    getPossible(state, c.b).delete(posA);
    elims.push({ value: c.b, position: posA });
  }
  if (posB !== null && getPossible(state, c.a).has(posB)) {
    getPossible(state, c.a).delete(posB);
    elims.push({ value: c.a, position: posB });
  }
  if (elims.length === 0) return null;
  if (state.silent) return SILENT_STEP;
  const assigns: { value: string; position: number }[] = [];
  for (const e of elims) {
    const ps = getPossible(state, e.value);
    if (ps.size === 1) assigns.push({ value: e.value, position: first(ps) });
  }
  const pinned = posA !== null ? c.a : c.b;
  const pinnedPos = posA ?? posB!;
  const other = posA !== null ? c.b : c.a;
  const { noun, posLabel } = state.terms;
  const assignSuffix =
    assigns.length > 0
      ? ` ${assigns.map((a) => `${a.value} must be in the ${posLabel(a.position)} ${noun}`).join("; ")}.`
      : "";
  return step(
    "not_same_position",
    [ci],
    elims,
    assigns,
    `${clueRef(ci)}${pinned} and ${other} are in different ${noun}s. ${pinned} is in the ${posLabel(pinnedPos)} ${noun}, so ${other} can't be there.${assignSuffix}`,
  );
}

function tryNextTo(
  state: DeduceState,
  c: { a: string; b: string; axis: string },
  ci: number,
): DeductionStep | null {
  const axis = resolveAxis(state.grid, c.axis);
  return tryBinaryRankSpace(
    state,
    c.a,
    c.b,
    axis,
    ci,
    "next_to",
    (ra, rb) => Math.abs(ra - rb) === 1,
    `${c.a} is adjacent to ${c.b} on ${axis.name}.`,
  );
}

function tryNotNextTo(
  state: DeduceState,
  c: { a: string; b: string; axis: string },
  ci: number,
): DeductionStep | null {
  const axis = resolveAxis(state.grid, c.axis);
  return tryBinaryRankSpace(
    state,
    c.a,
    c.b,
    axis,
    ci,
    "not_next_to",
    (ra, rb) => Math.abs(ra - rb) !== 1,
    `${c.a} is not adjacent to ${c.b} on ${axis.name}.`,
  );
}

function tryLeftOf(
  state: DeduceState,
  c: { a: string; b: string; axis: string },
  ci: number,
): DeductionStep | null {
  const axis = resolveAxis(state.grid, c.axis);
  return tryBinaryRankSpace(
    state,
    c.a,
    c.b,
    axis,
    ci,
    "left_of",
    (ra, rb) => rb === ra + 1,
    `${c.a} is directly before ${c.b} on ${axis.name}.`,
  );
}

function tryBefore(
  state: DeduceState,
  c: { a: string; b: string; axis: string },
  ci: number,
): DeductionStep | null {
  const axis = resolveAxis(state.grid, c.axis);
  return tryBinaryRankSpace(
    state,
    c.a,
    c.b,
    axis,
    ci,
    "before",
    (ra, rb) => ra < rb,
    `${c.a} is before ${c.b} on ${axis.name}.`,
  );
}

function tryBetween(
  state: DeduceState,
  c: { outer1: string; middle: string; outer2: string; axis: string },
  ci: number,
): DeductionStep | null {
  const axis = resolveAxis(state.grid, c.axis);
  return tryBetweenRankSpace(state, c, axis, ci, false);
}

function tryNotBetween(
  state: DeduceState,
  c: { outer1: string; middle: string; outer2: string; axis: string },
  ci: number,
): DeductionStep | null {
  const axis = resolveAxis(state.grid, c.axis);
  return tryBetweenRankSpace(state, c, axis, ci, true);
}

/**
 * Rank-space deduction for between / not_between.
 */
function tryBetweenRankSpace(
  state: DeduceState,
  c: { outer1: string; middle: string; outer2: string; axis: string },
  axis: Category,
  ci: number,
  isNotBetween: boolean,
): DeductionStep | null {
  const technique: DeductionTechnique = isNotBetween
    ? "not_between"
    : "between";
  const pinned = isPinnedAxis(state, axis);
  const rO1 = pinned
    ? getPossible(state, c.outer1)
    : axisRankDomain(state, c.outer1, axis);
  const rO2 = pinned
    ? getPossible(state, c.outer2)
    : axisRankDomain(state, c.outer2, axis);
  const rM = pinned
    ? getPossible(state, c.middle)
    : axisRankDomain(state, c.middle, axis);
  if (rO1.size === 0 || rO2.size === 0 || rM.size === 0) return null;

  // Single-pass: find which ranks are valid for each role.
  const okO1 = new Set<number>();
  const okO2 = new Set<number>();
  const okM = new Set<number>();
  for (const r1 of rO1) {
    for (const r2 of rO2) {
      const lo = Math.min(r1, r2);
      const hi = Math.max(r1, r2);
      for (const rm of rM) {
        const isBetween = r1 !== r2 && rm > lo && rm < hi;
        if (isNotBetween ? !isBetween : isBetween) {
          okO1.add(r1);
          okO2.add(r2);
          okM.add(rm);
        }
      }
    }
  }

  // Collect eliminations: for pinned axis, rank = position directly.
  const elims: { value: string; position: number }[] = [];
  if (pinned) {
    for (const r of rM) if (!okM.has(r)) elims.push({ value: c.middle, position: r });
    for (const r of rO1) if (!okO1.has(r)) elims.push({ value: c.outer1, position: r });
    for (const r of rO2) if (!okO2.has(r)) elims.push({ value: c.outer2, position: r });
  } else {
    const badM = new Set([...rM].filter((r) => !okM.has(r)));
    const badO1 = new Set([...rO1].filter((r) => !okO1.has(r)));
    const badO2 = new Set([...rO2].filter((r) => !okO2.has(r)));
    if (badM.size === 0 && badO1.size === 0 && badO2.size === 0) return null;
    elims.push(
      ...projectRanksToPositions(state, c.middle, axis, badM),
      ...projectRanksToPositions(state, c.outer1, axis, badO1),
      ...projectRanksToPositions(state, c.outer2, axis, badO2),
    );
  }
  if (elims.length === 0) return null;
  for (const e of elims) getPossible(state, e.value).delete(e.position);
  if (state.silent) return SILENT_STEP;
  const assigns = collectAssigns(state, elims);
  const verb = isNotBetween ? "is not between" : "is between";
  return step(
    technique,
    [ci],
    elims,
    assigns,
    `${clueRef(ci)}${c.middle} ${verb} ${c.outer1} and ${c.outer2} on ${axis.name}. ${describeResult(state.terms, assigns, elims)}.`,
  );
}

function tryExactDistance(
  state: DeduceState,
  c: { a: string; b: string; distance: number; axis: string },
  ci: number,
): DeductionStep | null {
  const axis = resolveAxis(state.grid, c.axis);
  const numVals = axis.numericValues;
  const unit = axis.orderingPhrases.unit;
  const distLabel = unit
    ? `${c.distance} ${c.distance === 1 ? unit[0] : unit[1]}`
    : `${c.distance} ${c.distance === 1 ? state.terms.noun : state.terms.noun + "s"}`;
  return tryBinaryRankSpace(
    state,
    c.a,
    c.b,
    axis,
    ci,
    "exact_distance",
    (ra, rb) => {
      const d = numVals
        ? Math.abs(numVals[ra] - numVals[rb])
        : Math.abs(ra - rb);
      return d === c.distance;
    },
    `${c.a} and ${c.b} are exactly ${distLabel} apart.`,
  );
}
