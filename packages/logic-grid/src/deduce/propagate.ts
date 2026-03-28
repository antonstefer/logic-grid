import type { Constraint } from "../types";
import { type DeduceState, getPossible, getAssigned } from "./state";

// --- Silent propagation helpers ---

function silentNakedSingles(state: DeduceState): boolean {
  let changed = false;
  for (let ci = 0; ci < state.grid.categories.length; ci++) {
    for (let vi = 0; vi < state.grid.categories[ci].values.length; vi++) {
      if (state.possible[ci][vi].size !== 1) continue;
      const pos = [...state.possible[ci][vi]][0];
      for (let ovi = 0; ovi < state.grid.categories[ci].values.length; ovi++) {
        if (ovi !== vi && state.possible[ci][ovi].has(pos)) {
          state.possible[ci][ovi].delete(pos);
          changed = true;
        }
      }
    }
  }
  return changed;
}

function silentHiddenSingles(state: DeduceState): boolean {
  let changed = false;
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
  return changed;
}

function silentNakedPairs(state: DeduceState): boolean {
  let changed = false;
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
  return changed;
}

function silentNakedTriples(state: DeduceState): boolean {
  let changed = false;
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
  return changed;
}

function silentHiddenPairs(state: DeduceState): boolean {
  let changed = false;
  for (let ci = 0; ci < state.grid.categories.length; ci++) {
    const cat = state.grid.categories[ci];
    for (let p1 = 0; p1 < state.n; p1++) {
      for (let p2 = p1 + 1; p2 < state.n; p2++) {
        const cands: number[] = [];
        for (let vi = 0; vi < cat.values.length; vi++) {
          if (state.possible[ci][vi].has(p1) || state.possible[ci][vi].has(p2))
            cands.push(vi);
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
  return changed;
}

function silentSameHouseChains(
  state: DeduceState,
  shLinks: Map<string, string[]>,
): boolean {
  let changed = false;
  for (const [middle, neighbors] of shLinks) {
    const pm = getPossible(state, middle);
    for (let i = 0; i < neighbors.length; i++) {
      const pa = getPossible(state, neighbors[i]);
      for (const p of [...pa]) {
        if (!pm.has(p)) {
          pa.delete(p);
          changed = true;
        }
      }
      for (let j = i + 1; j < neighbors.length; j++) {
        const pb = getPossible(state, neighbors[j]);
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
  return changed;
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

/** Run all constraint propagation and structural deductions to fixpoint. Returns false on contradiction. */
export function propagateToFixpoint(
  state: DeduceState,
  constraints: Constraint[],
): boolean {
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
    for (const cat of state.possible)
      for (const ps of cat) if (ps.size === 0) return false;
    changed = false;
    for (let ci = 0; ci < constraints.length; ci++)
      if (applyConstraintSilently(state, constraints[ci])) changed = true;
    if (silentNakedSingles(state)) changed = true;
    if (silentHiddenSingles(state)) changed = true;
    if (silentNakedPairs(state)) changed = true;
    if (silentNakedTriples(state)) changed = true;
    if (silentHiddenPairs(state)) changed = true;
    if (silentSameHouseChains(state, shLinks)) changed = true;
  }

  for (const cat of state.possible)
    for (const ps of cat) if (ps.size === 0) return false;
  return true;
}
