import type { Constraint, DeductionStep, DeductionTechnique } from "../types";
import {
  ordinal,
  posNoun,
  posNounPlural,
  posPrep,
  findPositionCategory,
} from "../grid-utils";
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
} from "./state";

/** Check whether every position in `set` is adjacent to `p`. */
function allAdjacent(set: Set<number>, p: number): boolean {
  for (const q of set) {
    if (q !== p - 1 && q !== p + 1) return false;
  }
  return true;
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
    `Clue ${ci + 1}: ${c.value} must be ${posPrep(state.grid)} the ${ordinal(c.position)} ${posNoun(state.grid)}.`,
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
      ? `, so ${c.value} must be ${posPrep(state.grid)} the ${ordinal(assigns[0].position)} ${posNoun(state.grid)}.`
      : ".";
  return step(
    "elimination",
    [ci],
    [{ value: c.value, position: c.position }],
    assigns,
    `Clue ${ci + 1}: ${c.value} is not ${posPrep(state.grid)} the ${ordinal(c.position)} ${posNoun(state.grid)}${suffix}`,
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

  const noun = posNoun(state.grid);
  const prep = posPrep(state.grid);
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
  const noun = posNoun(state.grid);
  const prep = posPrep(state.grid);
  const assignSuffix =
    assigns.length > 0
      ? ` ${assigns.map((a) => `${a.value} must be ${prep} the ${ordinal(a.position)} ${noun}`).join("; ")}.`
      : "";
  return step(
    "not_same_position",
    [ci],
    elims,
    assigns,
    `${clueRef(ci)}${pinned} and ${other} are ${prep} different ${posNounPlural(state.grid)}. ${pinned} is ${prep} the ${ordinal(pinnedPos)} ${noun}, so ${other} can't be there.${assignSuffix}`,
  );
}

function tryNextTo(
  state: DeduceState,
  c: { a: string; b: string },
  ci: number,
): DeductionStep | null {
  return tryAdjacency(state, c.a, c.b, ci, "next_to", true);
}

function tryNotNextTo(
  state: DeduceState,
  c: { a: string; b: string },
  ci: number,
): DeductionStep | null {
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
  c: { a: string; b: string },
  ci: number,
): DeductionStep | null {
  const pa = getPossible(state, c.a);
  const pb = getPossible(state, c.b);
  const elims: { value: string; position: number }[] = [];

  // a is directly left of b: a can only be at p if b can be at p+1
  for (const p of pa) {
    if (!pb.has(p + 1)) elims.push({ value: c.a, position: p });
  }
  // b can only be at p if a can be at p-1
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
  c: { a: string; b: string },
  ci: number,
): DeductionStep | null {
  const pa = getPossible(state, c.a);
  const pb = getPossible(state, c.b);
  const elims: { value: string; position: number }[] = [];

  // a must be left of b: eliminate positions for a where no valid b exists to the right
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
  c: { outer1: string; middle: string; outer2: string },
  ci: number,
): DeductionStep | null {
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
    const noun = posNoun(state.grid);
    const prep = posPrep(state.grid);
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
  c: { outer1: string; middle: string; outer2: string },
  ci: number,
): DeductionStep | null {
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
    const noun = posNoun(state.grid);
    const prep = posPrep(state.grid);
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

function tryExactDistance(
  state: DeduceState,
  c: { a: string; b: string; distance: number },
  ci: number,
): DeductionStep | null {
  const n = state.n;
  const pa = getPossible(state, c.a);
  const pb = getPossible(state, c.b);
  const elims: { value: string; position: number }[] = [];
  const numVals = findPositionCategory(state.grid)?.numericValues;

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
  const posCat = findPositionCategory(state.grid);
  const unit = posCat?.orderingPhrases?.unit;
  const distLabel = unit
    ? `${c.distance} ${c.distance === 1 ? unit[0] : unit[1]}`
    : `${c.distance} ${c.distance === 1 ? posNoun(state.grid) : posNounPlural(state.grid)}`;
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
