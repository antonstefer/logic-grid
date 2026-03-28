import type { Constraint, DeductionStep } from "../types";
import {
  type DeduceState,
  getPossible,
  step,
  dedup,
  collectAssigns,
  ordinal,
  describeResult,
  cloneState,
} from "./state";
import { propagateToFixpoint } from "./propagate";

// --- Structural deductions ---

export function tryNakedSingles(state: DeduceState): DeductionStep | null {
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

export function tryHiddenSingles(state: DeduceState): DeductionStep | null {
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
export function trySameHouseChain(
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

export function tryNakedPairs(state: DeduceState): DeductionStep | null {
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

export function tryNakedTriples(state: DeduceState): DeductionStep | null {
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

export function tryHiddenPairs(state: DeduceState): DeductionStep | null {
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
export function tryContradiction(
  state: DeduceState,
  constraints: Constraint[],
): DeductionStep | null {
  for (let ci = 0; ci < state.grid.categories.length; ci++) {
    for (let vi = 0; vi < state.grid.categories[ci].values.length; vi++) {
      const ps = state.possible[ci][vi];
      if (ps.size <= 1) continue;

      for (const p of ps) {
        const cloned = cloneState(state);
        const clonedPs = cloned.possible[ci][vi];
        clonedPs.clear();
        clonedPs.add(p);

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
