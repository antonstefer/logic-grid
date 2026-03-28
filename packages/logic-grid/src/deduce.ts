import type {
  Constraint,
  Grid,
  DeductionStep,
  DeductionResult,
  DeductionTechnique,
} from "./types";

const ORDINALS = [
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
  "seventh",
  "eighth",
];

function ordinal(position: number): string {
  return ORDINALS[position];
}

function describeResult(
  assigns: { value: string; position: number }[],
  elims: { value: string; position: number }[],
): string {
  const parts: string[] = [];
  for (const a of assigns) {
    parts.push(`${a.value} must be in the ${ordinal(a.position)} house`);
  }
  // Group eliminations by value
  const byValue = new Map<string, number[]>();
  for (const e of elims) {
    // Skip eliminated positions for values that were also assigned
    if (assigns.some((a) => a.value === e.value)) continue;
    if (!byValue.has(e.value)) byValue.set(e.value, []);
    byValue.get(e.value)!.push(e.position);
  }
  for (const [value, positions] of byValue) {
    const posStr = positions.map((p) => ordinal(p)).join(" or ");
    parts.push(`${value} can't be in the ${posStr} house`);
  }
  return parts.join("; ");
}

function clueRef(ci: number): string {
  return `Clue ${ci + 1}: `;
}

/** Describe what we know about a value's position — used for "because" context. */
function describeKnown(state: DeduceState, value: string): string {
  const pos = getAssigned(state, value);
  if (pos !== null) return `${value} is in the ${ordinal(pos)} house`;
  const possible = getPossible(state, value);
  if (possible.size <= 3) {
    const posStr = [...possible].map((p) => ordinal(p)).join(" or ");
    return `${value} can only be in the ${posStr} house`;
  }
  return "";
}

// --- State management ---

interface DeduceState {
  grid: Grid;
  n: number;
  possible: Set<number>[][];
  valueInfo: Map<string, [number, number]>;
}

function createState(grid: Grid): DeduceState {
  const n = grid.size;
  const possible: Set<number>[][] = grid.categories.map((cat) =>
    cat.values.map(() => new Set(Array.from({ length: n }, (_, i) => i))),
  );
  const valueInfo = new Map<string, [number, number]>();
  for (let ci = 0; ci < grid.categories.length; ci++) {
    for (let vi = 0; vi < grid.categories[ci].values.length; vi++) {
      valueInfo.set(grid.categories[ci].values[vi], [ci, vi]);
    }
  }
  return { grid, n, possible, valueInfo };
}

function getPossible(state: DeduceState, value: string): Set<number> {
  const info = state.valueInfo.get(value);
  if (!info) throw new Error(`Unknown value: ${value}`);
  return state.possible[info[0]][info[1]];
}

function getAssigned(state: DeduceState, value: string): number | null {
  const ps = getPossible(state, value);
  return ps.size === 1 ? [...ps][0] : null;
}

function isSolved(state: DeduceState): boolean {
  for (const cat of state.possible) {
    for (const ps of cat) {
      if (ps.size !== 1) return false;
    }
  }
  return true;
}

// --- Step builder ---

function step(
  technique: DeductionTechnique,
  clueIndices: number[],
  eliminations: { value: string; position: number }[],
  assignments: { value: string; position: number }[],
  explanation: string,
): DeductionStep {
  return { technique, clueIndices, eliminations, assignments, explanation };
}

// --- Constraint deductions ---

function tryConstraint(
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
  if (elims.length === 0) return null;
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
  const because = knownA || knownB ? `. ${knownA || knownB}, so ` : ", so ";

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
  }

  if (elims.length === 0) return null;
  for (const e of elims) getPossible(state, e.value).delete(e.position);
  const assigns: { value: string; position: number }[] = [];
  for (const e of elims) {
    const ps = getPossible(state, e.value);
    if (ps.size === 1) assigns.push({ value: e.value, position: [...ps][0] });
  }
  const verb = mustBeAdjacent ? "next to" : "not next to";
  const knownA = describeKnown(state, a);
  const knownB = describeKnown(state, b);
  const because = knownA || knownB ? ` ${knownA || knownB}, so ` : " ";
  return step(
    technique,
    [ci],
    elims,
    assigns,
    `${clueRef(ci)}${a} is ${verb} ${b}.${because}${describeResult(assigns, elims)}.`,
  );
}

function tryLeftOf(
  state: DeduceState,
  c: { a: string; b: string },
  ci: number,
): DeductionStep | null {
  const n = state.n;
  const pa = getPossible(state, c.a);
  const pb = getPossible(state, c.b);
  const elims: { value: string; position: number }[] = [];

  // a cannot be in last position
  if (pa.has(n - 1)) elims.push({ value: c.a, position: n - 1 });
  // b cannot be in first position
  if (pb.has(0)) elims.push({ value: c.b, position: 0 });

  // If a is pinned at p, b must be at p+1
  const posA = getAssigned(state, c.a);
  if (posA !== null && posA < n - 1) {
    for (const p of pb) {
      if (p !== posA + 1) elims.push({ value: c.b, position: p });
    }
  }
  // If b is pinned at p, a must be at p-1
  const posB = getAssigned(state, c.b);
  if (posB !== null && posB > 0) {
    for (const p of pa) {
      if (p !== posB - 1) elims.push({ value: c.a, position: p });
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  const uniqueElims = elims.filter((e) => {
    const key = `${e.value}:${e.position}`;
    if (seen.has(key)) return false;
    if (!getPossible(state, e.value).has(e.position)) return false;
    seen.add(key);
    return true;
  });

  if (uniqueElims.length === 0) return null;
  for (const e of uniqueElims) getPossible(state, e.value).delete(e.position);
  const assigns = collectAssigns(state, uniqueElims);
  const knownA = describeKnown(state, c.a);
  const knownB = describeKnown(state, c.b);
  const because = knownA || knownB ? ` ${knownA || knownB}, so ` : " ";
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

  const uniqueElims = dedup(elims, state);
  if (uniqueElims.length === 0) return null;
  for (const e of uniqueElims) getPossible(state, e.value).delete(e.position);
  const assigns = collectAssigns(state, uniqueElims);
  const knownA = describeKnown(state, c.a);
  const knownB = describeKnown(state, c.b);
  const because = knownA || knownB ? ` ${knownA || knownB}, so ` : " ";
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

  const uniqueElims = dedup(elims, state);
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
  if (a1 === null || a2 === null) return null;

  const lo = Math.min(a1, a2);
  const hi = Math.max(a1, a2);
  const pm = getPossible(state, c.middle);
  const elims: { value: string; position: number }[] = [];
  for (const p of pm) {
    if (p > lo && p < hi) elims.push({ value: c.middle, position: p });
  }

  if (elims.length === 0) return null;
  for (const e of elims) pm.delete(e.position);
  const assigns = collectAssigns(state, elims);
  return step(
    "not_between",
    [ci],
    elims,
    assigns,
    `${clueRef(ci)}${c.middle} is not between ${c.outer1} and ${c.outer2}. ${c.outer1} is in the ${ordinal(a1)} house and ${c.outer2} is in the ${ordinal(a2)} house, so ${describeResult(assigns, elims)}.`,
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

  const uniqueElims = dedup(elims, state);
  if (uniqueElims.length === 0) return null;
  for (const e of uniqueElims) getPossible(state, e.value).delete(e.position);
  const assigns = collectAssigns(state, uniqueElims);
  const knownA = describeKnown(state, c.a);
  const knownB = describeKnown(state, c.b);
  const because = knownA || knownB ? ` ${knownA || knownB}, so ` : " ";
  return step(
    "exact_distance",
    [ci],
    uniqueElims,
    assigns,
    `${clueRef(ci)}${c.a} and ${c.b} are exactly ${c.distance} houses apart.${because}${describeResult(assigns, uniqueElims)}.`,
  );
}

// --- Structural deductions ---

function tryNakedSingles(state: DeduceState): DeductionStep | null {
  for (let ci = 0; ci < state.grid.categories.length; ci++) {
    const cat = state.grid.categories[ci];
    for (let vi = 0; vi < cat.values.length; vi++) {
      if (state.possible[ci][vi].size !== 1) continue;
      const pos = [...state.possible[ci][vi]][0];
      const elims: { value: string; position: number }[] = [];
      for (let ovi = 0; ovi < cat.values.length; ovi++) {
        if (ovi !== vi && state.possible[ci][ovi].has(pos)) {
          state.possible[ci][ovi].delete(pos);
          elims.push({ value: cat.values[ovi], position: pos });
        }
      }
      if (elims.length === 0) continue;
      const assigns = collectAssigns(state, elims);
      return step(
        "naked_single",
        [],
        elims,
        assigns,
        `${cat.values[vi]} has no other possible position — it must be in the ${ordinal(pos)} house. So no other ${cat.name} can be there.`,
      );
    }
  }
  return null;
}

function tryHiddenSingles(state: DeduceState): DeductionStep | null {
  for (let ci = 0; ci < state.grid.categories.length; ci++) {
    const cat = state.grid.categories[ci];
    for (let p = 0; p < state.n; p++) {
      let count = 0;
      let lastVi = -1;
      for (let vi = 0; vi < cat.values.length; vi++) {
        if (state.possible[ci][vi].has(p)) {
          count++;
          lastVi = vi;
          if (count > 1) break;
        }
      }
      if (count !== 1 || state.possible[ci][lastVi].size <= 1) continue;
      const val = cat.values[lastVi];
      const elims: { value: string; position: number }[] = [];
      for (const op of state.possible[ci][lastVi]) {
        if (op !== p) elims.push({ value: val, position: op });
      }
      state.possible[ci][lastVi].clear();
      state.possible[ci][lastVi].add(p);
      return step(
        "hidden_single",
        [],
        elims,
        [{ value: val, position: p }],
        `The ${ordinal(p)} house must be ${val} (only remaining ${cat.name}).`,
      );
    }
  }
  return null;
}

/** Same-house transitivity: if same_house(A,B) and same_house(B,C), intersect A and C. */
function trySameHouseChain(
  state: DeduceState,
  constraints: Constraint[],
): DeductionStep | null {
  // Build a map of same-house links: value → set of linked values with clue indices
  const links = new Map<string, { value: string; ci: number }[]>();
  for (let ci = 0; ci < constraints.length; ci++) {
    const c = constraints[ci];
    if (c.type !== "same_house") continue;
    if (!links.has(c.a)) links.set(c.a, []);
    if (!links.has(c.b)) links.set(c.b, []);
    links.get(c.a)!.push({ value: c.b, ci });
    links.get(c.b)!.push({ value: c.a, ci });
  }

  // For each pair of values linked through a common middle, intersect positions
  for (const [middle, neighbors] of links) {
    for (let i = 0; i < neighbors.length; i++) {
      for (let j = i + 1; j < neighbors.length; j++) {
        const a = neighbors[i].value;
        const b = neighbors[j].value;
        const pa = getPossible(state, a);
        const pb = getPossible(state, b);

        const elims: { value: string; position: number }[] = [];
        for (const p of pa) {
          if (!pb.has(p)) elims.push({ value: a, position: p });
        }
        for (const p of pb) {
          if (!pa.has(p)) elims.push({ value: b, position: p });
        }

        const uniqueElims = dedup(elims, state);
        if (uniqueElims.length === 0) continue;

        for (const e of uniqueElims)
          getPossible(state, e.value).delete(e.position);
        const assigns = collectAssigns(state, uniqueElims);

        return step(
          "same_house_chain",
          [neighbors[i].ci, neighbors[j].ci],
          uniqueElims,
          assigns,
          `${a} and ${b} must be in the same house (both share a house with ${middle}). ${describeResult(assigns, uniqueElims)}.`,
        );
      }
    }
  }
  return null;
}

function tryNakedPairs(state: DeduceState): DeductionStep | null {
  for (let ci = 0; ci < state.grid.categories.length; ci++) {
    const cat = state.grid.categories[ci];
    // Find all values with exactly 2 possible positions
    const pairs: [number, Set<number>][] = [];
    for (let vi = 0; vi < cat.values.length; vi++) {
      if (state.possible[ci][vi].size === 2) {
        pairs.push([vi, state.possible[ci][vi]]);
      }
    }

    // Check each pair of values that share the same 2 positions
    for (let i = 0; i < pairs.length; i++) {
      for (let j = i + 1; j < pairs.length; j++) {
        const [vi1, ps1] = pairs[i];
        const [vi2, ps2] = pairs[j];
        // Same two positions?
        if (ps1.size !== ps2.size) continue;
        let match = true;
        for (const p of ps1) {
          if (!ps2.has(p)) {
            match = false;
            break;
          }
        }
        if (!match) continue;

        // Found a naked pair — eliminate these positions from all other values in category
        const elims: { value: string; position: number }[] = [];
        for (let ovi = 0; ovi < cat.values.length; ovi++) {
          if (ovi === vi1 || ovi === vi2) continue;
          for (const p of ps1) {
            if (state.possible[ci][ovi].has(p)) {
              state.possible[ci][ovi].delete(p);
              elims.push({ value: cat.values[ovi], position: p });
            }
          }
        }
        if (elims.length === 0) continue;

        const assigns = collectAssigns(state, elims);
        const positions = [...ps1].map((p) => ordinal(p)).join(" and ");
        return step(
          "naked_pair",
          [],
          elims,
          assigns,
          `${cat.values[vi1]} and ${cat.values[vi2]} can only be in the ${positions} houses, so no other ${cat.name} can be there.`,
        );
      }
    }
  }
  return null;
}

function tryNakedTriples(state: DeduceState): DeductionStep | null {
  for (let ci = 0; ci < state.grid.categories.length; ci++) {
    const cat = state.grid.categories[ci];
    // Find values with 2 or 3 possible positions
    const candidates: [number, Set<number>][] = [];
    for (let vi = 0; vi < cat.values.length; vi++) {
      const size = state.possible[ci][vi].size;
      if (size >= 2 && size <= 3) {
        candidates.push([vi, state.possible[ci][vi]]);
      }
    }

    // Check each triple of candidates
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        for (let k = j + 1; k < candidates.length; k++) {
          const [vi1, ps1] = candidates[i];
          const [vi2, ps2] = candidates[j];
          const [vi3, ps3] = candidates[k];
          // Union of their positions must be exactly 3
          const union = new Set([...ps1, ...ps2, ...ps3]);
          if (union.size !== 3) continue;

          const elims: { value: string; position: number }[] = [];
          for (let ovi = 0; ovi < cat.values.length; ovi++) {
            if (ovi === vi1 || ovi === vi2 || ovi === vi3) continue;
            for (const p of union) {
              if (state.possible[ci][ovi].has(p)) {
                state.possible[ci][ovi].delete(p);
                elims.push({ value: cat.values[ovi], position: p });
              }
            }
          }
          if (elims.length === 0) continue;

          const assigns = collectAssigns(state, elims);
          const positions = [...union].map((p) => ordinal(p)).join(", ");
          return step(
            "naked_triple",
            [],
            elims,
            assigns,
            `${cat.values[vi1]}, ${cat.values[vi2]}, and ${cat.values[vi3]} can only be in the ${positions} houses, so no other ${cat.name} can be there.`,
          );
        }
      }
    }
  }
  return null;
}

function tryHiddenPairs(state: DeduceState): DeductionStep | null {
  for (let ci = 0; ci < state.grid.categories.length; ci++) {
    const cat = state.grid.categories[ci];
    const n = state.n;

    // For each pair of positions, find all values that can be placed there.
    // If exactly 2 values can go to {p1, p2}, those 2 values must occupy those
    // positions — restrict them by eliminating their other possible positions.
    for (let p1 = 0; p1 < n; p1++) {
      for (let p2 = p1 + 1; p2 < n; p2++) {
        const candidates: number[] = [];
        for (let vi = 0; vi < cat.values.length; vi++) {
          const ps = state.possible[ci][vi];
          if (ps.has(p1) || ps.has(p2)) candidates.push(vi);
        }
        if (candidates.length !== 2) continue;

        const [vi1, vi2] = candidates;
        const elims: { value: string; position: number }[] = [];
        for (const p of state.possible[ci][vi1]) {
          if (p !== p1 && p !== p2)
            elims.push({ value: cat.values[vi1], position: p });
        }
        for (const p of state.possible[ci][vi2]) {
          if (p !== p1 && p !== p2)
            elims.push({ value: cat.values[vi2], position: p });
        }

        const uniqueElims = dedup(elims, state);
        if (uniqueElims.length === 0) continue;

        for (const e of uniqueElims)
          getPossible(state, e.value).delete(e.position);
        const assigns = collectAssigns(state, uniqueElims);
        return step(
          "hidden_pair",
          [],
          uniqueElims,
          assigns,
          `${cat.values[vi1]} and ${cat.values[vi2]} are the only ${cat.name} values for the ${ordinal(p1)} and ${ordinal(p2)} houses, so they must be restricted to those positions.`,
        );
      }
    }
  }
  return null;
}

/**
 * Proof by contradiction: try placing a value at a position, propagate,
 * and if any value ends up with 0 possible positions, eliminate it.
 * "If X were at position p, then [chain]... contradiction. So X can't be at p."
 */
function tryContradiction(
  state: DeduceState,
  constraints: Constraint[],
): DeductionStep | null {
  for (let ci = 0; ci < state.grid.categories.length; ci++) {
    for (let vi = 0; vi < state.grid.categories[ci].values.length; vi++) {
      const ps = state.possible[ci][vi];
      if (ps.size <= 1) continue;

      for (const p of ps) {
        // Clone state
        const cloned = cloneState(state);
        const clonedPs = cloned.possible[ci][vi];
        clonedPs.clear();
        clonedPs.add(p);

        // Propagate to fixpoint
        if (!propagateToFixpoint(cloned, constraints)) {
          // Contradiction found — eliminate this position
          ps.delete(p);
          const value = state.grid.categories[ci].values[vi];
          const assigns =
            ps.size === 1 ? [{ value, position: [...ps][0] }] : [];
          const assignSuffix =
            assigns.length > 0
              ? ` So ${value} must be in the ${ordinal(assigns[0].position)} house.`
              : "";
          return step(
            "contradiction",
            [],
            [{ value, position: p }],
            assigns,
            `If ${value} were in the ${ordinal(p)} house, it would lead to a contradiction.${assignSuffix}`,
          );
        }
      }
    }
  }
  return null;
}

function cloneState(state: DeduceState): DeduceState {
  return {
    grid: state.grid,
    n: state.n,
    possible: state.possible.map((cat) => cat.map((ps) => new Set(ps))),
    valueInfo: state.valueInfo,
  };
}

/** Run all basic constraint propagation + singles to fixpoint. Returns false on contradiction. */
function propagateToFixpoint(
  state: DeduceState,
  constraints: Constraint[],
): boolean {
  // Build same-house links once (constraints don't change)
  const shLinks = new Map<string, string[]>();
  for (const c of constraints) {
    if (c.type !== "same_house") continue;
    if (!shLinks.has(c.a)) shLinks.set(c.a, []);
    if (!shLinks.has(c.b)) shLinks.set(c.b, []);
    shLinks.get(c.a)!.push(c.b);
    shLinks.get(c.b)!.push(c.a);
  }

  let changed = true;
  while (changed) {
    changed = false;

    // Check for contradictions
    for (const cat of state.possible) {
      for (const ps of cat) {
        if (ps.size === 0) return false;
      }
    }

    // Apply all constraints
    for (let ci = 0; ci < constraints.length; ci++) {
      if (applyConstraintSilently(state, constraints[ci])) changed = true;
    }

    // Naked singles
    for (let ci = 0; ci < state.grid.categories.length; ci++) {
      for (let vi = 0; vi < state.grid.categories[ci].values.length; vi++) {
        if (state.possible[ci][vi].size !== 1) continue;
        const pos = [...state.possible[ci][vi]][0];
        for (
          let ovi = 0;
          ovi < state.grid.categories[ci].values.length;
          ovi++
        ) {
          if (ovi !== vi && state.possible[ci][ovi].has(pos)) {
            state.possible[ci][ovi].delete(pos);
            changed = true;
          }
        }
      }
    }

    // Hidden singles
    for (let ci = 0; ci < state.grid.categories.length; ci++) {
      for (let p = 0; p < state.n; p++) {
        let count = 0;
        let lastVi = -1;
        for (let vi = 0; vi < state.grid.categories[ci].values.length; vi++) {
          if (state.possible[ci][vi].has(p)) {
            count++;
            lastVi = vi;
            if (count > 1) break;
          }
        }
        if (count === 1 && state.possible[ci][lastVi].size > 1) {
          state.possible[ci][lastVi].clear();
          state.possible[ci][lastVi].add(p);
          changed = true;
        }
      }
    }

    // Naked pairs
    for (let ci = 0; ci < state.grid.categories.length; ci++) {
      const cat = state.grid.categories[ci];
      const pairs: [number, Set<number>][] = [];
      for (let vi = 0; vi < cat.values.length; vi++) {
        if (state.possible[ci][vi].size === 2)
          pairs.push([vi, state.possible[ci][vi]]);
      }
      for (let i = 0; i < pairs.length; i++) {
        for (let j = i + 1; j < pairs.length; j++) {
          const [vi1, ps1] = pairs[i];
          const [vi2, ps2] = pairs[j];
          let match = ps1.size === ps2.size;
          if (match)
            for (const p of ps1)
              if (!ps2.has(p)) {
                match = false;
                break;
              }
          if (!match) continue;
          for (let ovi = 0; ovi < cat.values.length; ovi++) {
            if (ovi === vi1 || ovi === vi2) continue;
            for (const p of ps1) {
              if (state.possible[ci][ovi].has(p)) {
                state.possible[ci][ovi].delete(p);
                changed = true;
              }
            }
          }
        }
      }
    }

    // Naked triples
    for (let ci = 0; ci < state.grid.categories.length; ci++) {
      const cat = state.grid.categories[ci];
      const cands: [number, Set<number>][] = [];
      for (let vi = 0; vi < cat.values.length; vi++) {
        const sz = state.possible[ci][vi].size;
        if (sz >= 2 && sz <= 3) cands.push([vi, state.possible[ci][vi]]);
      }
      for (let i = 0; i < cands.length; i++) {
        for (let j = i + 1; j < cands.length; j++) {
          for (let k = j + 1; k < cands.length; k++) {
            const [vi1, ps1] = cands[i];
            const [vi2, ps2] = cands[j];
            const [vi3, ps3] = cands[k];
            const union = new Set([...ps1, ...ps2, ...ps3]);
            if (union.size !== 3) continue;
            for (let ovi = 0; ovi < cat.values.length; ovi++) {
              if (ovi === vi1 || ovi === vi2 || ovi === vi3) continue;
              for (const p of union) {
                if (state.possible[ci][ovi].has(p)) {
                  state.possible[ci][ovi].delete(p);
                  changed = true;
                }
              }
            }
          }
        }
      }
    }

    // Hidden pairs: exactly 2 values can go to {p1,p2} → restrict them to those positions
    for (let ci = 0; ci < state.grid.categories.length; ci++) {
      const cat = state.grid.categories[ci];
      for (let p1 = 0; p1 < state.n; p1++) {
        for (let p2 = p1 + 1; p2 < state.n; p2++) {
          const cands: number[] = [];
          for (let vi = 0; vi < cat.values.length; vi++) {
            const ps = state.possible[ci][vi];
            if (ps.has(p1) || ps.has(p2)) cands.push(vi);
          }
          if (cands.length !== 2) continue;
          const [vi1, vi2] = cands;
          for (const p of [...state.possible[ci][vi1]]) {
            if (p !== p1 && p !== p2) {
              state.possible[ci][vi1].delete(p);
              changed = true;
            }
          }
          for (const p of [...state.possible[ci][vi2]]) {
            if (p !== p1 && p !== p2) {
              state.possible[ci][vi2].delete(p);
              changed = true;
            }
          }
        }
      }
    }

    // Same-house chain (transitivity: if A=M and B=M then A=B)
    for (const [middle, neighbors] of shLinks) {
      const pm = getPossible(state, middle);
      for (let i = 0; i < neighbors.length; i++) {
        const pa = getPossible(state, neighbors[i]);
        // Intersect with middle
        for (const p of [...pa]) {
          if (!pm.has(p)) {
            pa.delete(p);
            changed = true;
          }
        }
        for (let j = i + 1; j < neighbors.length; j++) {
          const pb = getPossible(state, neighbors[j]);
          // Intersect a and b (both share middle)
          for (const p of [...pa]) {
            if (!pb.has(p)) {
              pa.delete(p);
              changed = true;
            }
          }
          for (const p of [...pb]) {
            if (!pa.has(p)) {
              pb.delete(p);
              changed = true;
            }
          }
        }
      }
    }
  }

  // Final contradiction check
  for (const cat of state.possible) {
    for (const ps of cat) {
      if (ps.size === 0) return false;
    }
  }
  return true;
}

/** Apply a single constraint silently (no step recording). Returns true if state changed. */
function applyConstraintSilently(
  state: DeduceState,
  constraint: Constraint,
): boolean {
  let changed = false;
  const n = state.n;

  switch (constraint.type) {
    case "at_position": {
      const ps = getPossible(state, constraint.value);
      if (ps.size > 1 && ps.has(constraint.position)) {
        ps.clear();
        ps.add(constraint.position);
        changed = true;
      }
      break;
    }
    case "not_at_position": {
      const ps = getPossible(state, constraint.value);
      if (ps.has(constraint.position)) {
        ps.delete(constraint.position);
        changed = true;
      }
      break;
    }
    case "same_house": {
      const pa = getPossible(state, constraint.a);
      const pb = getPossible(state, constraint.b);
      for (const p of [...pa]) {
        if (!pb.has(p)) {
          pa.delete(p);
          changed = true;
        }
      }
      for (const p of [...pb]) {
        if (!pa.has(p)) {
          pb.delete(p);
          changed = true;
        }
      }
      break;
    }
    case "not_same_house": {
      const posA = getAssigned(state, constraint.a);
      const posB = getAssigned(state, constraint.b);
      if (posA !== null) {
        const pb = getPossible(state, constraint.b);
        if (pb.has(posA)) {
          pb.delete(posA);
          changed = true;
        }
      }
      if (posB !== null) {
        const pa = getPossible(state, constraint.a);
        if (pa.has(posB)) {
          pa.delete(posB);
          changed = true;
        }
      }
      break;
    }
    case "next_to": {
      const pa = getPossible(state, constraint.a);
      const pb = getPossible(state, constraint.b);
      for (const p of [...pa]) {
        if (!(p > 0 && pb.has(p - 1)) && !(p < n - 1 && pb.has(p + 1))) {
          pa.delete(p);
          changed = true;
        }
      }
      for (const p of [...pb]) {
        if (!(p > 0 && pa.has(p - 1)) && !(p < n - 1 && pa.has(p + 1))) {
          pb.delete(p);
          changed = true;
        }
      }
      break;
    }
    case "not_next_to": {
      const posA = getAssigned(state, constraint.a);
      const posB = getAssigned(state, constraint.b);
      if (posA !== null) {
        const pb = getPossible(state, constraint.b);
        if (posA > 0 && pb.has(posA - 1)) {
          pb.delete(posA - 1);
          changed = true;
        }
        if (posA < n - 1 && pb.has(posA + 1)) {
          pb.delete(posA + 1);
          changed = true;
        }
      }
      if (posB !== null) {
        const pa = getPossible(state, constraint.a);
        if (posB > 0 && pa.has(posB - 1)) {
          pa.delete(posB - 1);
          changed = true;
        }
        if (posB < n - 1 && pa.has(posB + 1)) {
          pa.delete(posB + 1);
          changed = true;
        }
      }
      break;
    }
    case "left_of": {
      const pa = getPossible(state, constraint.a);
      const pb = getPossible(state, constraint.b);
      if (pa.has(n - 1)) {
        pa.delete(n - 1);
        changed = true;
      }
      if (pb.has(0)) {
        pb.delete(0);
        changed = true;
      }
      const posA = getAssigned(state, constraint.a);
      if (posA !== null) {
        for (const p of [...pb]) {
          if (p !== posA + 1) {
            pb.delete(p);
            changed = true;
          }
        }
      }
      const posB = getAssigned(state, constraint.b);
      if (posB !== null) {
        for (const p of [...pa]) {
          if (p !== posB - 1) {
            pa.delete(p);
            changed = true;
          }
        }
      }
      break;
    }
    case "before": {
      const pa = getPossible(state, constraint.a);
      const pb = getPossible(state, constraint.b);
      const maxB = Math.max(...pb);
      for (const p of [...pa]) {
        if (p >= maxB) {
          pa.delete(p);
          changed = true;
        }
      }
      const minA = Math.min(...pa);
      for (const p of [...pb]) {
        if (p <= minA) {
          pb.delete(p);
          changed = true;
        }
      }
      break;
    }
    case "between": {
      const po1 = getPossible(state, constraint.outer1);
      const po2 = getPossible(state, constraint.outer2);
      const pm = getPossible(state, constraint.middle);
      const minO1 = Math.min(...po1);
      const maxO1 = Math.max(...po1);
      const minO2 = Math.min(...po2);
      const maxO2 = Math.max(...po2);
      // Middle arc-consistency: eliminate positions where no valid outer pair exists on both sides
      for (const p of [...pm]) {
        const case1 = minO1 < p && maxO2 > p;
        const case2 = minO2 < p && maxO1 > p;
        if (!case1 && !case2) {
          pm.delete(p);
          changed = true;
        }
      }
      // Outer arc-consistency: eliminate outer positions where no valid (middle, other-outer) exists
      for (const p1 of [...po1]) {
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
        if (!valid) {
          po1.delete(p1);
          changed = true;
        }
      }
      for (const p2 of [...po2]) {
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
        if (!valid) {
          po2.delete(p2);
          changed = true;
        }
      }
      break;
    }
    case "not_between": {
      const a1 = getAssigned(state, constraint.outer1);
      const a2 = getAssigned(state, constraint.outer2);
      if (a1 !== null && a2 !== null) {
        const lo = Math.min(a1, a2);
        const hi = Math.max(a1, a2);
        const pm = getPossible(state, constraint.middle);
        for (const p of [...pm]) {
          if (p > lo && p < hi) {
            pm.delete(p);
            changed = true;
          }
        }
      }
      break;
    }
    case "exact_distance": {
      const pa = getPossible(state, constraint.a);
      const pb = getPossible(state, constraint.b);
      const d = constraint.distance;
      for (const p of [...pa]) {
        if (!(p + d < n && pb.has(p + d)) && !(p - d >= 0 && pb.has(p - d))) {
          pa.delete(p);
          changed = true;
        }
      }
      for (const p of [...pb]) {
        if (!(p + d < n && pa.has(p + d)) && !(p - d >= 0 && pa.has(p - d))) {
          pb.delete(p);
          changed = true;
        }
      }
      break;
    }
  }
  return changed;
}

// --- Helpers ---

function dedup(
  elims: { value: string; position: number }[],
  state: DeduceState,
): { value: string; position: number }[] {
  const seen = new Set<string>();
  return elims.filter((e) => {
    const key = `${e.value}:${e.position}`;
    if (seen.has(key)) return false;
    if (!getPossible(state, e.value).has(e.position)) return false;
    seen.add(key);
    return true;
  });
}

function collectAssigns(
  state: DeduceState,
  elims: { value: string; position: number }[],
): { value: string; position: number }[] {
  const assigns: { value: string; position: number }[] = [];
  const checked = new Set<string>();
  for (const e of elims) {
    if (checked.has(e.value)) continue;
    checked.add(e.value);
    const ps = getPossible(state, e.value);
    if (ps.size === 1) assigns.push({ value: e.value, position: [...ps][0] });
  }
  return assigns;
}

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

    // Try structural deductions
    const naked = tryNakedSingles(state);
    if (naked) {
      steps.push(naked);
      progress = true;
      continue;
    }

    const hidden = tryHiddenSingles(state);
    if (hidden) {
      steps.push(hidden);
      progress = true;
      continue;
    }

    const pair = tryNakedPairs(state);
    if (pair) {
      steps.push(pair);
      progress = true;
      continue;
    }

    const triple = tryNakedTriples(state);
    if (triple) {
      steps.push(triple);
      progress = true;
      continue;
    }

    const hiddenPair = tryHiddenPairs(state);
    if (hiddenPair) {
      steps.push(hiddenPair);
      progress = true;
      continue;
    }

    const chain = trySameHouseChain(state, constraints);
    if (chain) {
      steps.push(chain);
      progress = true;
      continue;
    }

    const contra = tryContradiction(state, constraints);
    if (contra) {
      steps.push(contra);
      progress = true;
    }
  }

  return { steps, complete: isSolved(state) };
}

/** Get the next logical deduction from a partial state. */
export function hint(
  constraints: Constraint[],
  grid: Grid,
  known?: Record<string, number>,
): DeductionStep | null {
  const result = deduce(constraints, grid);
  if (!known || Object.keys(known).length === 0) {
    return result.steps[0] ?? null;
  }

  // Find the first step that produces an assignment the user doesn't have yet
  for (const s of result.steps) {
    if (s.assignments.some((a) => known[a.value] === undefined)) return s;
    if (
      s.assignments.length === 0 &&
      s.eliminations.some((e) => known[e.value] === undefined)
    )
      return s;
  }

  return null;
}
