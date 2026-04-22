import type {
  Category,
  Constraint,
  DeductionStep,
  DeductionTechnique,
  OrderedCategory,
} from "../types";
import { isPinnedAxis, resolveAxis } from "../axis";
import { capitalize, formatAtSingle } from "../clues/templates";
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

/**
 * Generic deduction for binary comparative constraints.
 * When the axis is pinned, rank = position so we work directly with
 * possible sets (O(|ps|) per value). For non-pinned axes, computes
 * rank domains and projects back through the axis assignment.
 *
 * Explanations carry only reasoning + conclusion — no opener that
 * paraphrases the clue. The clue itself is already referenced by
 * `Clue N:` and shown to the reader elsewhere.
 */
function tryBinaryAxis(
  state: DeduceState,
  a: string,
  b: string,
  axis: Category,
  ci: number,
  technique: DeductionTechnique,
  isValid: (rankA: number, rankB: number) => boolean,
): DeductionStep | null {
  const pinned = isPinnedAxis(state.grid, axis);
  const pa = pinned ? getPossible(state, a) : axisRankDomain(state, a, axis);
  const pb = pinned ? getPossible(state, b) : axisRankDomain(state, b, axis);
  if (pa.size === 0 || pb.size === 0) return null;

  // Find ranks to eliminate: bad for X if no Y satisfies the predicate.
  const badA = new Set<number>();
  const badB = new Set<number>();
  for (const ra of pa) {
    let ok = false;
    for (const rb of pb) {
      if (isValid(ra, rb)) {
        ok = true;
        break;
      }
    }
    if (!ok) badA.add(ra);
  }
  for (const rb of pb) {
    let ok = false;
    for (const ra of pa) {
      if (isValid(ra, rb)) {
        ok = true;
        break;
      }
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
  // Capture "because" context from pre-elim state — describeKnown after the
  // mutation would report this step's own conclusions as the reason. When
  // both operands have state worth mentioning, join them.
  const parts = [describeKnown(state, a), describeKnown(state, b)].filter(
    (s) => s !== "",
  );
  const ctx = parts.join(" and ");
  for (const e of elims) getPossible(state, e.value).delete(e.position);
  if (state.silent) return SILENT_STEP;
  const assigns = collectAssigns(state, elims);
  const result = describeResult(state.grid, assigns, elims);
  const tail = ctx ? `${capitalize(ctx)}, so ${result}` : capitalize(result);
  return step(technique, [ci], elims, assigns, `${clueRef(ci)}${tail}.`);
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
  // Capture "because" context from pre-intersection state — after we collapse
  // pa/pb to their intersection describeKnown would report this step's result.
  const knownParts = [
    describeKnown(state, c.a),
    describeKnown(state, c.b),
  ].filter((s) => s !== "");
  const ctx = knownParts.join(" and ");
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
    // Only report values that were newly pinned by this step. A value that
    // had no eliminations was already at its single possibility before —
    // repeating it in the conclusion reads as redundant ("the first house
    // is red, so the first house must be red").
    const aChanged = elims.some((e) => e.value === c.a);
    const bChanged = elims.some((e) => e.value === c.b);
    if (aChanged) assigns.push({ value: c.a, position: p });
    if (bChanged) assigns.push({ value: c.b, position: p });
  }

  const { isAxisValue } = state.terms;
  // When one operand is a display-axis value, use the concise direct form:
  // "Clue N: X must be in the <axisVal> <noun>." — the pinned axis value
  // is self-descriptive, no need to state "X and <axisVal> are in the same".
  const axisSide = isAxisValue(c.a) ? c.a : isAxisValue(c.b) ? c.b : null;
  if (axisSide !== null && assigns.length > 0) {
    const other = axisSide === c.a ? c.b : c.a;
    const axisPos = first(pa); // pa.size === 1 here (intersection pinned)
    return step(
      "same_position",
      [ci],
      elims,
      assigns,
      `${clueRef(ci)}${capitalize(formatAtSingle(other, axisPos, state.grid, false))}.`,
    );
  }
  // Drop the "X and Y are in the same <noun>" opener — the clue itself
  // already says that. Explanation shows only the reasoning and conclusion.
  const result = describeResult(state.grid, assigns, elims);
  const explanation = ctx
    ? `${clueRef(ci)}${capitalize(ctx)}, so ${result}.`
    : `${clueRef(ci)}${capitalize(result)}.`;
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
  const { isAxisValue } = state.terms;
  const assignSuffix =
    assigns.length > 0
      ? ` ${assigns.map((a) => capitalize(formatAtSingle(a.value, a.position, state.grid, false))).join("; ")}.`
      : "";
  // When one operand is a display-axis value, use the concise direct form:
  // "Clue N: X is not in the <axisVal> <noun>." The pinned-is-here reason is
  // tautological for axis values.
  const axisSide = isAxisValue(c.a) ? c.a : isAxisValue(c.b) ? c.b : null;
  if (axisSide !== null) {
    const nonAxis = axisSide === c.a ? c.b : c.a;
    return step(
      "not_same_position",
      [ci],
      elims,
      assigns,
      `${clueRef(ci)}${capitalize(formatAtSingle(nonAxis, pinnedPos, state.grid, true))}.${assignSuffix}`,
    );
  }
  // Drop the "X and Y are in different <noun>s" opener — the clue itself
  // already says they differ. Show only the pinned-is-here reason + conclusion.
  return step(
    "not_same_position",
    [ci],
    elims,
    assigns,
    `${clueRef(ci)}${capitalize(formatAtSingle(pinned, pinnedPos, state.grid, false))}, so ${formatAtSingle(other, pinnedPos, state.grid, true)}.${assignSuffix}`,
  );
}

function tryNextTo(
  state: DeduceState,
  c: { a: string; b: string; axis: string },
  ci: number,
): DeductionStep | null {
  const axis = resolveAxis(state.grid, c.axis);
  return tryBinaryAxis(
    state,
    c.a,
    c.b,
    axis,
    ci,
    "next_to",
    (ra, rb) => Math.abs(ra - rb) === 1,
  );
}

function tryNotNextTo(
  state: DeduceState,
  c: { a: string; b: string; axis: string },
  ci: number,
): DeductionStep | null {
  const axis = resolveAxis(state.grid, c.axis);
  return tryBinaryAxis(
    state,
    c.a,
    c.b,
    axis,
    ci,
    "not_next_to",
    (ra, rb) => Math.abs(ra - rb) !== 1,
  );
}

function tryLeftOf(
  state: DeduceState,
  c: { a: string; b: string; axis: string },
  ci: number,
): DeductionStep | null {
  const axis = resolveAxis(state.grid, c.axis);
  return tryBinaryAxis(
    state,
    c.a,
    c.b,
    axis,
    ci,
    "left_of",
    (ra, rb) => rb === ra + 1,
  );
}

function tryBefore(
  state: DeduceState,
  c: { a: string; b: string; axis: string },
  ci: number,
): DeductionStep | null {
  const axis = resolveAxis(state.grid, c.axis);
  return tryBinaryAxis(
    state,
    c.a,
    c.b,
    axis,
    ci,
    "before",
    (ra, rb) => ra < rb,
  );
}

function tryBetween(
  state: DeduceState,
  c: { outer1: string; middle: string; outer2: string; axis: string },
  ci: number,
): DeductionStep | null {
  const axis = resolveAxis(state.grid, c.axis);
  return tryBetweenAxis(state, c, axis, ci, false);
}

function tryNotBetween(
  state: DeduceState,
  c: { outer1: string; middle: string; outer2: string; axis: string },
  ci: number,
): DeductionStep | null {
  const axis = resolveAxis(state.grid, c.axis);
  return tryBetweenAxis(state, c, axis, ci, true);
}

/**
 * Generic deduction for between / not_between (pinned or non-pinned axis).
 */
function tryBetweenAxis(
  state: DeduceState,
  c: { outer1: string; middle: string; outer2: string; axis: string },
  axis: OrderedCategory,
  ci: number,
  isNotBetween: boolean,
): DeductionStep | null {
  const technique: DeductionTechnique = isNotBetween
    ? "not_between"
    : "between";
  const pinned = isPinnedAxis(state.grid, axis);
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
    for (const r of rM)
      if (!okM.has(r)) elims.push({ value: c.middle, position: r });
    for (const r of rO1)
      if (!okO1.has(r)) elims.push({ value: c.outer1, position: r });
    for (const r of rO2)
      if (!okO2.has(r)) elims.push({ value: c.outer2, position: r });
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
  // Capture "because" context from pre-elim state. Between needs both anchors
  // to explain the middle's placement, so join all non-empty descriptions.
  const parts = [
    describeKnown(state, c.outer1),
    describeKnown(state, c.outer2),
    describeKnown(state, c.middle),
  ].filter((s) => s !== "");
  const ctx = parts.join(" and ");
  for (const e of elims) getPossible(state, e.value).delete(e.position);
  if (state.silent) return SILENT_STEP;
  const assigns = collectAssigns(state, elims);
  const result = describeResult(state.grid, assigns, elims);
  const tail = ctx ? `${capitalize(ctx)}, so ${result}` : capitalize(result);
  return step(technique, [ci], elims, assigns, `${clueRef(ci)}${tail}.`);
}

function tryExactDistance(
  state: DeduceState,
  c: { a: string; b: string; distance: number; axis: string },
  ci: number,
): DeductionStep | null {
  const axis = resolveAxis(state.grid, c.axis);
  const numVals = axis.numericValues;
  return tryBinaryAxis(
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
  );
}
