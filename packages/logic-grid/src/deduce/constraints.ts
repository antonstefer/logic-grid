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
  dedup,
  collectAssigns,
  describeResult,
  clueRef,
  describeKnown,
  axisRankDomain,
  projectRanksToPositions,
} from "./state";

/**
 * Generic rank-space deduction for binary comparative constraints on a
 * non-pinned axis. Computes the rank domain of both values,
 * applies the predicate `isValid(rankA, rankB)` to decide which ranks
 * to eliminate, then projects back to position eliminations.
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
  const rankA = axisRankDomain(state, a, axis);
  const rankB = axisRankDomain(state, b, axis);
  if (rankA.size === 0 || rankB.size === 0) return null;

  // Find ranks to eliminate: a rank is bad for value X if no rank of Y satisfies the predicate.
  const badRanksA = new Set<number>();
  for (const ra of rankA) {
    let hasValidB = false;
    for (const rb of rankB) {
      if (isValid(ra, rb)) {
        hasValidB = true;
        break;
      }
    }
    if (!hasValidB) badRanksA.add(ra);
  }
  const badRanksB = new Set<number>();
  for (const rb of rankB) {
    let hasValidA = false;
    for (const ra of rankA) {
      if (isValid(ra, rb)) {
        hasValidA = true;
        break;
      }
    }
    if (!hasValidA) badRanksB.add(rb);
  }

  if (badRanksA.size === 0 && badRanksB.size === 0) return null;

  const elims = [
    ...projectRanksToPositions(state, a, axis, badRanksA),
    ...projectRanksToPositions(state, b, axis, badRanksB),
  ];
  const uniqueElims = dedup(elims);
  if (uniqueElims.length === 0) return null;
  for (const e of uniqueElims) getPossible(state, e.value).delete(e.position);
  if (state.silent) return SILENT_STEP;
  const assigns = collectAssigns(state, uniqueElims);
  return step(
    technique,
    [ci],
    uniqueElims,
    assigns,
    `${clueRef(ci)}${description} ${describeResult(state.terms, assigns, uniqueElims)}.`,
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
  const rO1 = axisRankDomain(state, c.outer1, axis);
  const rO2 = axisRankDomain(state, c.outer2, axis);
  const rM = axisRankDomain(state, c.middle, axis);
  if (rO1.size === 0 || rO2.size === 0 || rM.size === 0) return null;

  // Single-pass: find which ranks are valid for each role by scanning all
  // triples once instead of three separate O(|rO1|·|rO2|·|rM|) passes.
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
  const badO1 = new Set([...rO1].filter((r) => !okO1.has(r)));
  const badO2 = new Set([...rO2].filter((r) => !okO2.has(r)));
  const badM = new Set([...rM].filter((r) => !okM.has(r)));

  if (badM.size === 0 && badO1.size === 0 && badO2.size === 0) return null;

  const elims = [
    ...projectRanksToPositions(state, c.middle, axis, badM),
    ...projectRanksToPositions(state, c.outer1, axis, badO1),
    ...projectRanksToPositions(state, c.outer2, axis, badO2),
  ];
  const uniqueElims = dedup(elims);
  if (uniqueElims.length === 0) return null;
  for (const e of uniqueElims) getPossible(state, e.value).delete(e.position);
  if (state.silent) return SILENT_STEP;
  const assigns = collectAssigns(state, uniqueElims);
  const verb = isNotBetween ? "is not between" : "is between";
  return step(
    technique,
    [ci],
    uniqueElims,
    assigns,
    `${clueRef(ci)}${c.middle} ${verb} ${c.outer1} and ${c.outer2} on ${axis.name}. ${describeResult(state.terms, assigns, uniqueElims)}.`,
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
    : `${c.distance} ${c.distance === 1 ? axis.noun || "position" : (axis.noun || "position") + "s"}`;
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
