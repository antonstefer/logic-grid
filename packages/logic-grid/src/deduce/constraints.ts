import type {
  Category,
  Constraint,
  DeductionStep,
  DeductionTechnique,
} from "../types";
import { ordinal } from "../grid-utils";
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

/** Check whether every position in `set` is adjacent to `p`. */
function allAdjacent(set: Set<number>, p: number): boolean {
  for (const q of set) {
    if (q !== p - 1 && q !== p + 1) return false;
  }
  return true;
}

/** True when `axis` is the first ordered category (identity-pinned). */
function isIdentityPinned(
  grid: { categories: Category[] },
  axis: Category,
): boolean {
  return grid.categories.find((c) => c.ordered === true) === axis;
}

/**
 * Generic rank-space deduction for binary comparative constraints on a
 * non-identity-pinned axis. Computes the rank domain of both values,
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
    `${clueRef(ci)}${description} ${describeResult(state.grid, assigns, uniqueElims)}.`,
  );
}

// --- Constraint deductions ---

export function tryConstraint(
  state: DeduceState,
  constraint: Constraint,
  ci: number,
): DeductionStep | null {
  switch (constraint.type) {
    case "at_position":
      return tryAtPosition(state, constraint, ci);
    case "not_at_position":
      return tryNotAtPosition(state, constraint, ci);
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

function tryAtPosition(
  state: DeduceState,
  c: { value: string; position: number },
  ci: number,
): DeductionStep | null {
  const ps = getPossible(state, c.value);
  if (ps.size <= 1) return null;
  const elims: { value: string; position: number }[] = [];
  for (const p of ps) {
    if (p !== c.position) elims.push({ value: c.value, position: p });
  }
  ps.clear();
  ps.add(c.position);
  if (state.silent) return SILENT_STEP;
  return step(
    "direct",
    [ci],
    elims,
    [{ value: c.value, position: c.position }],
    `Clue ${ci + 1}: ${c.value} must be in the ${ordinal(c.position)} position.`,
  );
}

function tryNotAtPosition(
  state: DeduceState,
  c: { value: string; position: number },
  ci: number,
): DeductionStep | null {
  const ps = getPossible(state, c.value);
  if (!ps.has(c.position)) return null;
  ps.delete(c.position);
  if (state.silent) return SILENT_STEP;
  const assigns =
    ps.size === 1 ? [{ value: c.value, position: first(ps) }] : [];
  const suffix =
    assigns.length > 0
      ? `, so ${c.value} must be in the ${ordinal(assigns[0].position)} position.`
      : ".";
  return step(
    "elimination",
    [ci],
    [{ value: c.value, position: c.position }],
    assigns,
    `Clue ${ci + 1}: ${c.value} is not in the ${ordinal(c.position)} position${suffix}`,
  );
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

  const noun = "position";
  const prep = "in";
  let explanation: string;
  if (assigns.length > 0) {
    explanation = `${clueRef(ci)}${c.a} and ${c.b} are ${prep} the same ${noun}${because}both are ${prep} the ${ordinal(assigns[0].position)} ${noun}.`;
  } else {
    explanation = `${clueRef(ci)}${c.a} and ${c.b} are ${prep} the same ${noun}${because}${describeResult(state.grid, assigns, elims)}.`;
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
  const noun = "position";
  const prep = "in";
  const assignSuffix =
    assigns.length > 0
      ? ` ${assigns.map((a) => `${a.value} must be ${prep} the ${ordinal(a.position)} ${noun}`).join("; ")}.`
      : "";
  return step(
    "not_same_position",
    [ci],
    elims,
    assigns,
    `${clueRef(ci)}${pinned} and ${other} are ${prep} different positions. ${pinned} is ${prep} the ${ordinal(pinnedPos)} ${noun}, so ${other} can't be there.${assignSuffix}`,
  );
}

function tryNextTo(
  state: DeduceState,
  c: { a: string; b: string; axis: string },
  ci: number,
): DeductionStep | null {
  const axis = resolveAxis(state.grid, c.axis);
  if (!isIdentityPinned(state.grid, axis)) {
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
  return tryAdjacency(state, c.a, c.b, ci, "next_to", true);
}

function tryNotNextTo(
  state: DeduceState,
  c: { a: string; b: string; axis: string },
  ci: number,
): DeductionStep | null {
  const axis = resolveAxis(state.grid, c.axis);
  if (!isIdentityPinned(state.grid, axis)) {
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
  return tryAdjacency(state, c.a, c.b, ci, "not_next_to", false);
}

function tryAdjacency(
  state: DeduceState,
  a: string,
  b: string,
  ci: number,
  technique: DeductionTechnique,
  mustBeAdjacent: boolean,
): DeductionStep | null {
  const n = state.n;
  const pa = getPossible(state, a);
  const pb = getPossible(state, b);
  const elims: { value: string; position: number }[] = [];

  if (mustBeAdjacent) {
    // next_to: for each value, eliminate positions where no neighbor is possible
    const validForA = new Set<number>();
    for (const p of pa) {
      if ((p > 0 && pb.has(p - 1)) || (p < n - 1 && pb.has(p + 1))) {
        validForA.add(p);
      }
    }
    for (const p of pa) {
      if (!validForA.has(p)) elims.push({ value: a, position: p });
    }
    const validForB = new Set<number>();
    for (const p of pb) {
      if ((p > 0 && pa.has(p - 1)) || (p < n - 1 && pa.has(p + 1))) {
        validForB.add(p);
      }
    }
    for (const p of pb) {
      if (!validForB.has(p)) elims.push({ value: b, position: p });
    }
  } else {
    // not_next_to: if one is pinned, eliminate adjacent from the other
    const posA = getAssigned(state, a);
    if (posA !== null) {
      if (posA > 0 && pb.has(posA - 1))
        elims.push({ value: b, position: posA - 1 });
      if (posA < n - 1 && pb.has(posA + 1))
        elims.push({ value: b, position: posA + 1 });
    }
    const posB = getAssigned(state, b);
    if (posB !== null) {
      if (posB > 0 && pa.has(posB - 1))
        elims.push({ value: a, position: posB - 1 });
      if (posB < n - 1 && pa.has(posB + 1))
        elims.push({ value: a, position: posB + 1 });
    }
    // Arc-consistency: eliminate p from a if every position in b is adjacent to p
    for (const p of pa) {
      if (pb.size > 0 && allAdjacent(pb, p))
        elims.push({ value: a, position: p });
    }
    for (const p of pb) {
      if (pa.size > 0 && allAdjacent(pa, p))
        elims.push({ value: b, position: p });
    }
  }

  const uniqueElims = dedup(elims);
  if (uniqueElims.length === 0) return null;
  for (const e of uniqueElims) getPossible(state, e.value).delete(e.position);
  if (state.silent) return SILENT_STEP;
  const assigns = collectAssigns(state, uniqueElims);
  const verb = mustBeAdjacent ? "next to" : "not next to";
  const knownA = describeKnown(state, a);
  const knownB = describeKnown(state, b);
  const ctx = knownA || knownB;
  const because = ctx ? ` ${ctx}, so ` : " ";
  return step(
    technique,
    [ci],
    uniqueElims,
    assigns,
    `${clueRef(ci)}${a} is ${verb} ${b}.${because}${describeResult(state.grid, assigns, uniqueElims)}.`,
  );
}

function tryLeftOf(
  state: DeduceState,
  c: { a: string; b: string; axis: string },
  ci: number,
): DeductionStep | null {
  const axis = resolveAxis(state.grid, c.axis);
  if (!isIdentityPinned(state.grid, axis)) {
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
  const pa = getPossible(state, c.a);
  const pb = getPossible(state, c.b);
  const elims: { value: string; position: number }[] = [];

  for (const p of pa) {
    if (!pb.has(p + 1)) elims.push({ value: c.a, position: p });
  }
  for (const p of pb) {
    if (!pa.has(p - 1)) elims.push({ value: c.b, position: p });
  }

  const uniqueElims = dedup(elims);
  if (uniqueElims.length === 0) return null;
  for (const e of uniqueElims) getPossible(state, e.value).delete(e.position);
  if (state.silent) return SILENT_STEP;
  const assigns = collectAssigns(state, uniqueElims);
  const knownA = describeKnown(state, c.a);
  const knownB = describeKnown(state, c.b);
  const ctx = knownA || knownB;
  const because = ctx ? ` ${ctx}, so ` : " ";
  return step(
    "left_of",
    [ci],
    uniqueElims,
    assigns,
    `${clueRef(ci)}${c.a} is directly left of ${c.b}.${because}${describeResult(state.grid, assigns, uniqueElims)}.`,
  );
}

function tryBefore(
  state: DeduceState,
  c: { a: string; b: string; axis: string },
  ci: number,
): DeductionStep | null {
  const axis = resolveAxis(state.grid, c.axis);
  if (!isIdentityPinned(state.grid, axis)) {
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
  const pa = getPossible(state, c.a);
  const pb = getPossible(state, c.b);
  const elims: { value: string; position: number }[] = [];

  if (pa.size === 0 || pb.size === 0) return null;
  const maxB = Math.max(...pb);
  for (const p of pa) {
    if (p >= maxB) elims.push({ value: c.a, position: p });
  }
  const minA = Math.min(...pa);
  for (const p of pb) {
    if (p <= minA) elims.push({ value: c.b, position: p });
  }

  const uniqueElims = dedup(elims);
  if (uniqueElims.length === 0) return null;
  for (const e of uniqueElims) getPossible(state, e.value).delete(e.position);
  if (state.silent) return SILENT_STEP;
  const assigns = collectAssigns(state, uniqueElims);
  const knownA = describeKnown(state, c.a);
  const knownB = describeKnown(state, c.b);
  const ctx = knownA || knownB;
  const because = ctx ? ` ${ctx}, so ` : " ";
  return step(
    "before",
    [ci],
    uniqueElims,
    assigns,
    `${clueRef(ci)}${c.a} is somewhere left of ${c.b}.${because}${describeResult(state.grid, assigns, uniqueElims)}.`,
  );
}

function tryBetween(
  state: DeduceState,
  c: { outer1: string; middle: string; outer2: string; axis: string },
  ci: number,
): DeductionStep | null {
  const axis = resolveAxis(state.grid, c.axis);
  if (!isIdentityPinned(state.grid, axis)) {
    return tryBetweenRankSpace(state, c, axis, ci, false);
  }
  const po1 = getPossible(state, c.outer1);
  const pm = getPossible(state, c.middle);
  const po2 = getPossible(state, c.outer2);
  const elims: { value: string; position: number }[] = [];

  const a1 = getAssigned(state, c.outer1);
  const a2 = getAssigned(state, c.outer2);

  // If both outers are pinned, middle must be strictly between them
  if (a1 !== null && a2 !== null) {
    const lo = Math.min(a1, a2);
    const hi = Math.max(a1, a2);
    for (const p of pm) {
      if (p <= lo || p >= hi) elims.push({ value: c.middle, position: p });
    }
  }

  // If middle and one outer are pinned, constrain the other outer to the opposite side
  const am = getAssigned(state, c.middle);
  if (am !== null && a1 !== null) {
    for (const p of po2) {
      // outer1 < middle → outer2 must be > middle; outer1 > middle → outer2 must be < middle
      if (a1 < am && p <= am) elims.push({ value: c.outer2, position: p });
      if (a1 > am && p >= am) elims.push({ value: c.outer2, position: p });
    }
  }
  if (am !== null && a2 !== null) {
    for (const p of po1) {
      if (a2 < am && p <= am) elims.push({ value: c.outer1, position: p });
      if (a2 > am && p >= am) elims.push({ value: c.outer1, position: p });
    }
  }

  // Arc-consistency: eliminate middle positions where no valid outer pair exists on both sides
  // Skip when any set is empty — Math.min/max on empty sets returns ±Infinity
  if (po1.size > 0 && po2.size > 0 && pm.size > 0) {
    const minO1 = Math.min(...po1);
    const maxO1 = Math.max(...po1);
    const minO2 = Math.min(...po2);
    const maxO2 = Math.max(...po2);
    for (const p of pm) {
      const case1 = minO1 < p && maxO2 > p;
      const case2 = minO2 < p && maxO1 > p;
      if (!case1 && !case2) elims.push({ value: c.middle, position: p });
    }
    // Arc-consistency for outers
    for (const p1 of po1) {
      let valid = false;
      for (const m of pm) {
        if (p1 < m && maxO2 > m) {
          valid = true;
          break;
        }
        if (p1 > m && minO2 < m) {
          valid = true;
          break;
        }
      }
      if (!valid) elims.push({ value: c.outer1, position: p1 });
    }
    for (const p2 of po2) {
      let valid = false;
      for (const m of pm) {
        if (p2 < m && maxO1 > m) {
          valid = true;
          break;
        }
        if (p2 > m && minO1 < m) {
          valid = true;
          break;
        }
      }
      if (!valid) elims.push({ value: c.outer2, position: p2 });
    }
  }

  const uniqueElims = dedup(elims);
  if (uniqueElims.length === 0) return null;
  for (const e of uniqueElims) getPossible(state, e.value).delete(e.position);
  if (state.silent) return SILENT_STEP;
  const assigns = collectAssigns(state, uniqueElims);

  let because: string;
  if (a1 !== null && a2 !== null) {
    const noun = "position";
    const prep = "in";
    const parts = [
      `${c.outer1} is ${prep} the ${ordinal(a1)} ${noun}`,
      `${c.outer2} is ${prep} the ${ordinal(a2)} ${noun}`,
    ];
    because = ` ${parts.join(" and ")}, so `;
  } else {
    const knownO1 = describeKnown(state, c.outer1);
    const knownO2 = describeKnown(state, c.outer2);
    const knownM = describeKnown(state, c.middle);
    const ctx = knownO1 || knownO2 || knownM;
    because = ctx ? ` ${ctx}, so ` : " ";
  }

  return step(
    "between",
    [ci],
    uniqueElims,
    assigns,
    `${clueRef(ci)}${c.middle} is somewhere between ${c.outer1} and ${c.outer2}.${because}${describeResult(state.grid, assigns, uniqueElims)}.`,
  );
}

function tryNotBetween(
  state: DeduceState,
  c: { outer1: string; middle: string; outer2: string; axis: string },
  ci: number,
): DeductionStep | null {
  const axis = resolveAxis(state.grid, c.axis);
  if (!isIdentityPinned(state.grid, axis)) {
    return tryBetweenRankSpace(state, c, axis, ci, true);
  }
  const a1 = getAssigned(state, c.outer1);
  const a2 = getAssigned(state, c.outer2);
  const pm = getPossible(state, c.middle);
  const elims: { value: string; position: number }[] = [];

  if (a1 !== null && a2 !== null) {
    // Both pinned: middle cannot be strictly between them
    const lo = Math.min(a1, a2);
    const hi = Math.max(a1, a2);
    for (const p of pm) {
      if (p > lo && p < hi) elims.push({ value: c.middle, position: p });
    }
  } else if (a1 !== null || a2 !== null) {
    // One outer pinned: eliminate middle positions where every position of the
    // other outer would place the middle between them.
    const pinnedPos = a1 ?? a2!;
    const otherPossible =
      a1 !== null ? getPossible(state, c.outer2) : getPossible(state, c.outer1);
    if (otherPossible.size === 0) return null;
    const minOther = Math.min(...otherPossible);
    const maxOther = Math.max(...otherPossible);
    for (const m of pm) {
      if (pinnedPos < m && minOther > m)
        elims.push({ value: c.middle, position: m });
      if (pinnedPos > m && maxOther < m)
        elims.push({ value: c.middle, position: m });
    }
  } else {
    // Neither outer pinned: eliminate middle positions that are always between
    // all possible outer pairs (all outer1 positions on one side, all outer2 on the other).
    const po1 = getPossible(state, c.outer1);
    const po2 = getPossible(state, c.outer2);
    if (po1.size === 0 || po2.size === 0) return null;
    const maxO1 = Math.max(...po1);
    const minO1 = Math.min(...po1);
    const maxO2 = Math.max(...po2);
    const minO2 = Math.min(...po2);
    for (const m of pm) {
      if ((maxO1 < m && minO2 > m) || (minO1 > m && maxO2 < m))
        elims.push({ value: c.middle, position: m });
    }
  }

  const uniqueElims = dedup(elims);
  if (uniqueElims.length === 0) return null;
  for (const e of uniqueElims) getPossible(state, e.value).delete(e.position);
  if (state.silent) return SILENT_STEP;
  const assigns = collectAssigns(state, uniqueElims);

  let because: string;
  if (a1 !== null && a2 !== null) {
    const noun = "position";
    const prep = "in";
    because = ` ${c.outer1} is ${prep} the ${ordinal(a1)} ${noun} and ${c.outer2} is ${prep} the ${ordinal(a2)} ${noun}, so `;
  } else {
    // At least one outer always has a description for supported grid sizes (3–8):
    // the neither-pinned case needs 4+4+1=9 positions, exceeding max size 8.
    const ctx =
      describeKnown(state, c.outer1) || describeKnown(state, c.outer2);
    because = ` ${ctx}, so `;
  }
  return step(
    "not_between",
    [ci],
    uniqueElims,
    assigns,
    `${clueRef(ci)}${c.middle} is not between ${c.outer1} and ${c.outer2}.${because}${describeResult(state.grid, assigns, uniqueElims)}.`,
  );
}

/**
 * Rank-space deduction for between / not_between on non-identity-pinned axes.
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

  // For `between`: middle rank must be strictly between the two outers.
  // Eliminate middle ranks where no valid outer pair exists on both sides.
  // For `not_between`: middle rank must NOT be strictly between.
  const badM = new Set<number>();
  for (const rm of rM) {
    let ok = false;
    for (const r1 of rO1) {
      for (const r2 of rO2) {
        const lo = Math.min(r1, r2);
        const hi = Math.max(r1, r2);
        const isBetween = r1 !== r2 && rm > lo && rm < hi;
        if (isNotBetween ? !isBetween : isBetween) {
          ok = true;
          break;
        }
      }
      if (ok) break;
    }
    if (!ok) badM.add(rm);
  }

  // Similarly eliminate outer ranks that can't participate in any valid triple.
  const badO1 = new Set<number>();
  for (const r1 of rO1) {
    let ok = false;
    for (const r2 of rO2) {
      for (const rm of rM) {
        const lo = Math.min(r1, r2);
        const hi = Math.max(r1, r2);
        const isBetween = r1 !== r2 && rm > lo && rm < hi;
        if (isNotBetween ? !isBetween : isBetween) {
          ok = true;
          break;
        }
      }
      if (ok) break;
    }
    if (!ok) badO1.add(r1);
  }
  const badO2 = new Set<number>();
  for (const r2 of rO2) {
    let ok = false;
    for (const r1 of rO1) {
      for (const rm of rM) {
        const lo = Math.min(r1, r2);
        const hi = Math.max(r1, r2);
        const isBetween = r1 !== r2 && rm > lo && rm < hi;
        if (isNotBetween ? !isBetween : isBetween) {
          ok = true;
          break;
        }
      }
      if (ok) break;
    }
    if (!ok) badO2.add(r2);
  }

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
    `${clueRef(ci)}${c.middle} ${verb} ${c.outer1} and ${c.outer2} on ${axis.name}. ${describeResult(state.grid, assigns, uniqueElims)}.`,
  );
}

function tryExactDistance(
  state: DeduceState,
  c: { a: string; b: string; distance: number; axis: string },
  ci: number,
): DeductionStep | null {
  const axis = resolveAxis(state.grid, c.axis);
  if (!isIdentityPinned(state.grid, axis)) {
    const numVals = axis.numericValues;
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
      `${c.a} and ${c.b} are ${c.distance} apart on ${axis.name}.`,
    );
  }
  const n = state.n;
  const pa = getPossible(state, c.a);
  const pb = getPossible(state, c.b);
  const elims: { value: string; position: number }[] = [];
  const numVals = axis.numericValues;

  if (numVals) {
    // Value-based distance: compute valid partner positions from numeric values
    const partnersOf = (p: number): number[] => {
      const result: number[] = [];
      for (let q = 0; q < n; q++) {
        if (Math.abs(numVals[p] - numVals[q]) === c.distance) result.push(q);
      }
      return result;
    };
    for (const p of pa) {
      if (!partnersOf(p).some((q) => pb.has(q)))
        elims.push({ value: c.a, position: p });
    }
    for (const p of pb) {
      if (!partnersOf(p).some((q) => pa.has(q)))
        elims.push({ value: c.b, position: p });
    }
  } else {
    // Position-based distance (original behavior)
    for (const p of pa) {
      const canB =
        (p + c.distance < n && pb.has(p + c.distance)) ||
        (p - c.distance >= 0 && pb.has(p - c.distance));
      if (!canB) elims.push({ value: c.a, position: p });
    }
    for (const p of pb) {
      const canA =
        (p + c.distance < n && pa.has(p + c.distance)) ||
        (p - c.distance >= 0 && pa.has(p - c.distance));
      if (!canA) elims.push({ value: c.b, position: p });
    }
  }

  const uniqueElims = dedup(elims);
  if (uniqueElims.length === 0) return null;
  for (const e of uniqueElims) getPossible(state, e.value).delete(e.position);
  if (state.silent) return SILENT_STEP;
  const assigns = collectAssigns(state, uniqueElims);
  const unit = axis.orderingPhrases.unit;
  const distLabel = unit
    ? `${c.distance} ${c.distance === 1 ? unit[0] : unit[1]}`
    : `${c.distance} ${c.distance === 1 ? "position" : "positions"}`;
  // At least one value always has a description for supported grid sizes (3–8).
  const ctx = describeKnown(state, c.a) || describeKnown(state, c.b);
  const because = ` ${ctx}, so `;
  return step(
    "exact_distance",
    [ci],
    uniqueElims,
    assigns,
    `${clueRef(ci)}${c.a} and ${c.b} are exactly ${distLabel} apart.${because}${describeResult(state.grid, assigns, uniqueElims)}.`,
  );
}
