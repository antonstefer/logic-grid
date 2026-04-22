import type { Category, DeductionStep, Grid } from "../types";
import { capitalize, formatAtSingle, joinOr, label } from "../clues/templates";
import {
  type DeduceState,
  SILENT_STEP,
  first,
  getPossible,
  step,
  collectAssigns,
} from "./state";

/**
 * Subject noun-phrase for a value in a context where the pinned-axis noun
 * will also appear. For positionAdjective categories (e.g. Color, "Red"
 * describes "house"), the bare adjective ("red") avoids the double-noun
 * "the red house ... the Nth house" idiom. Otherwise the full label
 * ("the bird owner") is used.
 *
 * Scope: used by naked_pair / naked_triple / hidden_pair / hidden_triple,
 * which assemble multiple subjects into one clause ("Red and Blue can only
 * be in the A and B houses"). Single-value conclusions go through
 * `formatAtSingle`, which has its own built-in positionAdjective flip and
 * fits the full "subject + verb + object" form on its own.
 */
function subjectForm(value: string, cat: Category, grid: Grid): string {
  if (cat.positionAdjective) {
    return cat.lowercase ? value.toLowerCase() : value;
  }
  return label(value, grid);
}

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
      const { axisName } = state.terms;
      // Parenthetical reasoning hint mirrors hidden_single's structure and
      // avoids repeating the subject ("Carol lives in the fourth house —
      // Carol lives in the fourth house" before). Uses axis *name* ("bounty",
      // "house", "year") not axis *noun* ("fugitive", "slot", "fund") — the
      // name is the concept being measured and doesn't semantically overlap
      // with the subject.
      //
      // Note the asymmetry with pair/triple techniques below: they use
      // `axisAnchor` ("house", "gold pieces", "fund") because they form a
      // positional compound ("the first or second <anchor>"). naked_single
      // makes a conceptual claim ("no other <concept> possible"), where the
      // concept word reads better than the object anchor ("no other house
      // possible" vs "no other gold pieces possible" for a Bounty axis).
      const conclusion = formatAtSingle(cat.values[vi], pos, state.grid, false);
      return step(
        "naked_single",
        [],
        elims,
        assigns,
        `${capitalize(conclusion)} (no other ${axisName} possible).`,
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
        // `cat.name` is kept as-is (capitalized) — it's a category label,
        // not a free-running noun. Lowercasing it for tone-uniformity with
        // naked_single's "(no other bounty possible)" reads poorly for
        // multi-word names like "YTD Return" → "ytd return". The semantic
        // difference is real: naked's anchor is the axis *concept*, hidden's
        // anchor is the specific category being scanned.
        `${capitalize(formatAtSingle(val, p, state.grid, false))} (only remaining ${cat.name}).`,
      );
    }
  }
  return null;
}

// same_position transitivity (A→M→B) and not_same_position chains are handled by the
// iterative constraint loop. same_position(M,A) and same_position(M,B) are applied in
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
        const { posLabel, axisAnchor } = state.terms;
        // Disjunctive "or" joins with the singular anchor: "the first or
        // second house" reads distributively (each of X, Y is in one of
        // those positions) without needing plural morphology.
        const posList = joinOr([...ps1].map((p) => posLabel(p)));
        const s1 = subjectForm(cat.values[vi1], cat, state.grid);
        const s2 = subjectForm(cat.values[vi2], cat, state.grid);
        const prep = cat.positionAdjective ? "" : "in ";
        return step(
          "naked_pair",
          [],
          elims,
          assigns,
          `${capitalize(s1)} and ${s2} can only be ${prep}the ${posList} ${axisAnchor}.`,
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
          const { posLabel, axisAnchor } = state.terms;
          const posList = joinOr([...union].map((p) => posLabel(p)));
          const s1 = subjectForm(cat.values[vi1], cat, state.grid);
          const s2 = subjectForm(cat.values[vi2], cat, state.grid);
          const s3 = subjectForm(cat.values[vi3], cat, state.grid);
          const prep = cat.positionAdjective ? "" : "in ";
          return step(
            "naked_triple",
            [],
            elims,
            assigns,
            `${capitalize(s1)}, ${s2}, and ${s3} can only be ${prep}the ${posList} ${axisAnchor}.`,
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

        if (elims.length === 0) continue;

        for (const e of elims) getPossible(state, e.value).delete(e.position);
        if (state.silent) return SILENT_STEP;
        const assigns = collectAssigns(state, elims);
        const { posLabel, axisAnchor } = state.terms;
        const s1 = subjectForm(cat.values[vi1], cat, state.grid);
        const s2 = subjectForm(cat.values[vi2], cat, state.grid);
        return step(
          "hidden_pair",
          [],
          elims,
          assigns,
          `${capitalize(s1)} and ${s2} are the only ${cat.name} values for the ${posLabel(p1)} or ${posLabel(p2)} ${axisAnchor}.`,
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

          if (elims.length === 0) continue;

          for (const e of elims) getPossible(state, e.value).delete(e.position);
          if (state.silent) return SILENT_STEP;
          const assigns = collectAssigns(state, elims);
          const { posLabel, axisAnchor } = state.terms;
          const s1 = subjectForm(cat.values[vi1], cat, state.grid);
          const s2 = subjectForm(cat.values[vi2], cat, state.grid);
          const s3 = subjectForm(cat.values[vi3], cat, state.grid);
          return step(
            "hidden_triple",
            [],
            elims,
            assigns,
            `${capitalize(s1)}, ${s2}, and ${s3} are the only ${cat.name} values for the ${posLabel(p1)}, ${posLabel(p2)}, or ${posLabel(p3)} ${axisAnchor}.`,
          );
        }
      }
    }
  }
  return null;
}
