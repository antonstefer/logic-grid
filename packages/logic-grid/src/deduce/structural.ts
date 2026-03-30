import type { DeductionStep } from "../types";
import {
  type DeduceState,
  SILENT_STEP,
  first,
  getPossible,
  step,
  dedup,
  collectAssigns,
  ordinal,
  posNoun,
  posNounPlural,
  posPrep,
} from "./state";

// --- Structural deductions ---

/** Ordered by complexity — try cheap techniques first. */
export const structuralTechniques = [
  tryNakedSingles,
  tryHiddenSingles,
  tryNakedPairs,
  tryNakedTriples,
  tryHiddenPairs,
  tryHiddenTriples,
];

export function tryNakedSingles(state: DeduceState): DeductionStep | null {
  for (let ci = 0; ci < state.grid.categories.length; ci++) {
    const cat = state.grid.categories[ci];
    for (let vi = 0; vi < cat.values.length; vi++) {
      if (state.possible[ci][vi].size !== 1) continue;
      const pos = first(state.possible[ci][vi]);
      const elims: { value: string; position: number }[] = [];
      for (let ovi = 0; ovi < cat.values.length; ovi++) {
        if (ovi !== vi && state.possible[ci][ovi].has(pos)) {
          state.possible[ci][ovi].delete(pos);
          elims.push({ value: cat.values[ovi], position: pos });
        }
      }
      if (elims.length === 0) continue;
      if (state.silent) return SILENT_STEP;
      const assigns = collectAssigns(state, elims);
      return step(
        "naked_single",
        [],
        elims,
        assigns,
        `${cat.values[vi]} has no other possible position — it must be ${posPrep(state.grid)} the ${ordinal(pos)} ${posNoun(state.grid)}. So no other ${cat.name} can be there.`,
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
      if (state.silent) return SILENT_STEP;
      return step(
        "hidden_single",
        [],
        elims,
        [{ value: val, position: p }],
        `The ${ordinal(p)} ${posNoun(state.grid)} must be ${val} (only remaining ${cat.name}).`,
      );
    }
  }
  return null;
}

// same_house transitivity (A→M→B) and not_same_house chains are handled by the
// iterative constraint loop. same_house(M,A) and same_house(M,B) are applied in
// alternating passes until fixpoint, so A, M, and B reach the same possible set
// before any structural technique gets to run.

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
        if (state.silent) return SILENT_STEP;

        const assigns = collectAssigns(state, elims);
        const positions = [...ps1].map((p) => ordinal(p)).join(" and ");
        return step(
          "naked_pair",
          [],
          elims,
          assigns,
          `${cat.values[vi1]} and ${cat.values[vi2]} can only be ${posPrep(state.grid)} the ${positions} ${posNounPlural(state.grid)}, so no other ${cat.name} can be there.`,
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
          if (state.silent) return SILENT_STEP;

          const assigns = collectAssigns(state, elims);
          const positions = [...union].map((p) => ordinal(p)).join(", ");
          return step(
            "naked_triple",
            [],
            elims,
            assigns,
            `${cat.values[vi1]}, ${cat.values[vi2]}, and ${cat.values[vi3]} can only be ${posPrep(state.grid)} the ${positions} ${posNounPlural(state.grid)}, so no other ${cat.name} can be there.`,
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

        const uniqueElims = dedup(elims);
        if (uniqueElims.length === 0) continue;

        for (const e of uniqueElims)
          getPossible(state, e.value).delete(e.position);
        if (state.silent) return SILENT_STEP;
        const assigns = collectAssigns(state, uniqueElims);
        return step(
          "hidden_pair",
          [],
          uniqueElims,
          assigns,
          `${cat.values[vi1]} and ${cat.values[vi2]} are the only ${cat.name} values for the ${ordinal(p1)} and ${ordinal(p2)} ${posNounPlural(state.grid)}, so they must be restricted to those positions.`,
        );
      }
    }
  }
  return null;
}

export function tryHiddenTriples(state: DeduceState): DeductionStep | null {
  for (let ci = 0; ci < state.grid.categories.length; ci++) {
    const cat = state.grid.categories[ci];
    const n = state.n;

    // For each triple of positions, find all values that can be placed there.
    // If exactly 3 values can go to {p1, p2, p3}, restrict them to those positions.
    for (let p1 = 0; p1 < n; p1++) {
      for (let p2 = p1 + 1; p2 < n; p2++) {
        for (let p3 = p2 + 1; p3 < n; p3++) {
          const candidates: number[] = [];
          for (let vi = 0; vi < cat.values.length; vi++) {
            const ps = state.possible[ci][vi];
            if (ps.has(p1) || ps.has(p2) || ps.has(p3)) candidates.push(vi);
          }
          if (candidates.length !== 3) continue;

          const [vi1, vi2, vi3] = candidates;
          const elims: { value: string; position: number }[] = [];
          for (const p of state.possible[ci][vi1])
            if (p !== p1 && p !== p2 && p !== p3)
              elims.push({ value: cat.values[vi1], position: p });
          for (const p of state.possible[ci][vi2])
            if (p !== p1 && p !== p2 && p !== p3)
              elims.push({ value: cat.values[vi2], position: p });
          for (const p of state.possible[ci][vi3])
            if (p !== p1 && p !== p2 && p !== p3)
              elims.push({ value: cat.values[vi3], position: p });

          const uniqueElims = dedup(elims);
          if (uniqueElims.length === 0) continue;

          for (const e of uniqueElims)
            getPossible(state, e.value).delete(e.position);
          if (state.silent) return SILENT_STEP;
          const assigns = collectAssigns(state, uniqueElims);
          return step(
            "hidden_triple",
            [],
            uniqueElims,
            assigns,
            `${cat.values[vi1]}, ${cat.values[vi2]}, and ${cat.values[vi3]} are the only ${cat.name} values for the ${ordinal(p1)}, ${ordinal(p2)}, and ${ordinal(p3)} ${posNounPlural(state.grid)}, so they must be restricted to those positions.`,
          );
        }
      }
    }
  }
  return null;
}
