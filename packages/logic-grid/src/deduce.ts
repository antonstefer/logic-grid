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

  // If both outers are pinned, middle must be strictly between them
  const a1 = getAssigned(state, c.outer1);
  const a2 = getAssigned(state, c.outer2);
  if (a1 !== null && a2 !== null) {
    const lo = Math.min(a1, a2);
    const hi = Math.max(a1, a2);
    for (const p of pm) {
      if (p <= lo || p >= hi) elims.push({ value: c.middle, position: p });
    }
  }

  // If middle and one outer are pinned, constrain the other outer
  const am = getAssigned(state, c.middle);
  if (am !== null && a1 !== null) {
    // outer2 must be on the opposite side of middle from outer1
    for (const p of po2) {
      if (a1 < am && p >= am) elims.push({ value: c.outer2, position: p });
      if (a1 > am && p <= am) elims.push({ value: c.outer2, position: p });
    }
  }
  if (am !== null && a2 !== null) {
    for (const p of po1) {
      if (a2 < am && p >= am) elims.push({ value: c.outer1, position: p });
      if (a2 > am && p <= am) elims.push({ value: c.outer1, position: p });
    }
  }

  const uniqueElims = dedup(elims, state);
  if (uniqueElims.length === 0) return null;
  for (const e of uniqueElims) getPossible(state, e.value).delete(e.position);
  const assigns = collectAssigns(state, uniqueElims);
  const parts: string[] = [];
  if (a1 !== null) parts.push(`${c.outer1} is in the ${ordinal(a1)} house`);
  if (a2 !== null) parts.push(`${c.outer2} is in the ${ordinal(a2)} house`);
  const because = parts.length > 0 ? ` ${parts.join(" and ")}, so ` : " ";
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
