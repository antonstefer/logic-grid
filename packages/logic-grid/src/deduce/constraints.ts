import type { Constraint, DeductionStep, DeductionTechnique } from "../types";
import {
  type DeduceState,
  getPossible,
  getAssigned,
  step,
  dedup,
  collectAssigns,
  ordinal,
  describeResult,
  clueRef,
  describeKnown,
} from "./state";

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
    case "same_house":
      return trySameHouse(state, constraint, ci);
    case "not_same_house":
      return tryNotSameHouse(state, constraint, ci);
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
  return step(
    "direct",
    [ci],
    elims,
    [{ value: c.value, position: c.position }],
    `Clue ${ci + 1}: ${c.value} must be in the ${ordinal(c.position)} house.`,
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
  const assigns =
    ps.size === 1 ? [{ value: c.value, position: [...ps][0] }] : [];
  const suffix =
    assigns.length > 0
      ? `, so ${c.value} must be in the ${ordinal(assigns[0].position)} house.`
      : ".";
  return step(
    "elimination",
    [ci],
    [{ value: c.value, position: c.position }],
    assigns,
    `Clue ${ci + 1}: ${c.value} is not in the ${ordinal(c.position)} house${suffix}`,
  );
}

function trySameHouse(
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
  const assigns: { value: string; position: number }[] = [];
  if (pa.size === 1) {
    const p = [...pa][0];
    assigns.push({ value: c.a, position: p });
    assigns.push({ value: c.b, position: p });
  }
  // Build "because" context from whichever value is more constrained
  const knownA = describeKnown(state, c.a);
  const knownB = describeKnown(state, c.b);
  const ctx = knownA || knownB;
  const because = ctx ? `. ${ctx}, so ` : ", so ";

  let explanation: string;
  if (assigns.length > 0) {
    explanation = `${clueRef(ci)}${c.a} and ${c.b} are in the same house${because}both are in the ${ordinal(assigns[0].position)} house.`;
  } else {
    explanation = `${clueRef(ci)}${c.a} and ${c.b} are in the same house${because}${describeResult(assigns, elims)}.`;
  }
  return step("same_house", [ci], elims, assigns, explanation);
}

function tryNotSameHouse(
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
  const assigns: { value: string; position: number }[] = [];
  for (const e of elims) {
    const ps = getPossible(state, e.value);
    if (ps.size === 1) assigns.push({ value: e.value, position: [...ps][0] });
  }
  const pinned = posA !== null ? c.a : c.b;
  const pinnedPos = posA ?? posB!;
  const other = posA !== null ? c.b : c.a;
  const assignSuffix =
    assigns.length > 0
      ? ` ${assigns.map((a) => `${a.value} must be in the ${ordinal(a.position)} house`).join("; ")}.`
      : "";
  return step(
    "not_same_house",
    [ci],
    elims,
    assigns,
    `${clueRef(ci)}${pinned} and ${other} are in different houses. ${pinned} is in the ${ordinal(pinnedPos)} house, so ${other} can't be there.${assignSuffix}`,
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
      if (pb.size > 0 && [...pb].every((q) => q === p - 1 || q === p + 1))
        elims.push({ value: a, position: p });
    }
    for (const p of pb) {
      if (pa.size > 0 && [...pa].every((q) => q === p - 1 || q === p + 1))
        elims.push({ value: b, position: p });
    }
  }

  const uniqueElims = dedup(elims);
  if (uniqueElims.length === 0) return null;
  for (const e of uniqueElims) getPossible(state, e.value).delete(e.position);
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
    `${clueRef(ci)}${a} is ${verb} ${b}.${because}${describeResult(assigns, uniqueElims)}.`,
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
    `${clueRef(ci)}${c.a} is directly left of ${c.b}.${because}${describeResult(assigns, uniqueElims)}.`,
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
    `${clueRef(ci)}${c.a} is somewhere left of ${c.b}.${because}${describeResult(assigns, uniqueElims)}.`,
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

  const uniqueElims = dedup(elims);
  if (uniqueElims.length === 0) return null;
  for (const e of uniqueElims) getPossible(state, e.value).delete(e.position);
  const assigns = collectAssigns(state, uniqueElims);

  let because: string;
  if (a1 !== null && a2 !== null) {
    const parts = [
      `${c.outer1} is in the ${ordinal(a1)} house`,
      `${c.outer2} is in the ${ordinal(a2)} house`,
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
    `${clueRef(ci)}${c.middle} is somewhere between ${c.outer1} and ${c.outer2}.${because}${describeResult(assigns, uniqueElims)}.`,
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
  for (const e of uniqueElims) pm.delete(e.position);
  const assigns = collectAssigns(state, uniqueElims);

  let because: string;
  if (a1 !== null && a2 !== null) {
    because = `${c.outer1} is in the ${ordinal(a1)} house and ${c.outer2} is in the ${ordinal(a2)} house, so `;
  } else {
    const knownO1 = describeKnown(state, c.outer1);
    const knownO2 = describeKnown(state, c.outer2);
    const ctx = knownO1 || knownO2;
    // ctx is always truthy for supported grid sizes (3–8): the neither-pinned
    // branch needs 4+4+1=9 positions for both outers to exceed the describeKnown
    // threshold, so at least one outer always has a description.
    because = ctx ? `${ctx}, so ` : "";
  }
  return step(
    "not_between",
    [ci],
    uniqueElims,
    assigns,
    `${clueRef(ci)}${c.middle} is not between ${c.outer1} and ${c.outer2}. ${because}${describeResult(assigns, uniqueElims)}.`,
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

  // For each possible position of a, check if any valid b position exists
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

  const uniqueElims = dedup(elims);
  if (uniqueElims.length === 0) return null;
  for (const e of uniqueElims) getPossible(state, e.value).delete(e.position);
  const assigns = collectAssigns(state, uniqueElims);
  const knownA = describeKnown(state, c.a);
  const knownB = describeKnown(state, c.b);
  const ctx = knownA || knownB;
  const because = ctx ? ` ${ctx}, so ` : " ";
  return step(
    "exact_distance",
    [ci],
    uniqueElims,
    assigns,
    `${clueRef(ci)}${c.a} and ${c.b} are exactly ${c.distance} houses apart.${because}${describeResult(assigns, uniqueElims)}.`,
  );
}
