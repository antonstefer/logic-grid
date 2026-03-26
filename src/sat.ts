export type SATResult =
  | { satisfiable: true; assignment: Map<number, boolean> }
  | { satisfiable: false };

export function solveSAT(clauses: number[][]): SATResult {
  const solver = new Solver(clauses);
  if (!solver.solve()) return { satisfiable: false };
  return { satisfiable: true, assignment: solver.getAssignment() };
}

export function solveAllSAT(
  clauses: number[][],
  limit: number,
): Map<number, boolean>[] {
  const allVars = new Set<number>();
  for (const clause of clauses) {
    for (const lit of clause) allVars.add(Math.abs(lit));
  }

  const solutions: Map<number, boolean>[] = [];
  const working = clauses.map((c) => [...c]);

  while (solutions.length < limit) {
    const solver = new Solver(working);
    if (!solver.solve()) break;

    const assignment = solver.getAssignment();
    for (const v of allVars) {
      if (!assignment.has(v)) assignment.set(v, false);
    }
    solutions.push(assignment);

    const blocking: number[] = [];
    for (const v of allVars) {
      blocking.push(assignment.get(v) ? -v : v);
    }
    working.push(blocking);
  }

  return solutions;
}

export function isUnique(clauses: number[][], allVars: Set<number>): boolean {
  const solver = new Solver(clauses);
  if (!solver.solve()) return false;

  const assignment = solver.getAssignment();
  const blocking: number[] = [];
  for (const v of allVars) {
    blocking.push(assignment.get(v) ? -v : v);
  }

  const solver2 = new Solver(clauses.concat([blocking]));
  return !solver2.solve();
}

// --- Shared SAT infrastructure ---

const UNDEF = 0;
const TRUE = 1;
const FALSE = 2;

function litIdx(lit: number): number {
  return lit > 0 ? lit * 2 : -lit * 2 + 1;
}

/** Base class for watched-literal DPLL solvers with flat Int32Array storage. */
class SATBase {
  protected readonly numVars: number;
  protected readonly values: Uint8Array;
  protected readonly litBuf: Int32Array;
  protected readonly clauseOff: Uint32Array;
  protected readonly clauseLen: Uint16Array;
  protected readonly numClauses: number;
  protected readonly watches: number[][];
  protected readonly trail: Int32Array;
  protected trailSize: number;
  protected propHead: number;

  constructor(inputClauses: number[][]) {
    let maxVar = 0;
    let totalLits = 0;
    for (const clause of inputClauses) {
      totalLits += clause.length;
      for (const lit of clause) {
        const v = lit > 0 ? lit : -lit;
        if (v > maxVar) maxVar = v;
      }
    }
    this.numVars = maxVar;
    this.numClauses = inputClauses.length;

    this.values = new Uint8Array(maxVar + 1);
    this.trail = new Int32Array(maxVar + 1);
    this.trailSize = 0;
    this.propHead = 0;

    this.litBuf = new Int32Array(totalLits);
    this.clauseOff = new Uint32Array(inputClauses.length);
    this.clauseLen = new Uint16Array(inputClauses.length);

    const litCount = 2 * (maxVar + 1);
    this.watches = new Array(litCount);
    for (let i = 0; i < litCount; i++) this.watches[i] = [];

    let offset = 0;
    for (let ci = 0; ci < inputClauses.length; ci++) {
      const raw = inputClauses[ci];
      this.clauseOff[ci] = offset;
      this.clauseLen[ci] = raw.length;
      for (let j = 0; j < raw.length; j++) {
        this.litBuf[offset + j] = raw[j];
      }
      offset += raw.length;

      if (raw.length >= 2) {
        this.watches[litIdx(raw[0])].push(ci);
        this.watches[litIdx(raw[1])].push(ci);
      }
    }
  }

  protected assign(v: number, val: number): void {
    this.values[v] = val;
    this.trail[this.trailSize++] = v;
  }

  protected propagate(): boolean {
    while (this.propHead < this.trailSize) {
      const v = this.trail[this.propHead++];
      const falseLit = this.values[v] === TRUE ? -v : v;
      const fli = litIdx(falseLit);

      const watchList = this.watches[fli];
      let writeIdx = 0;

      for (let readIdx = 0; readIdx < watchList.length; readIdx++) {
        const ci = watchList[readIdx];
        const off = this.clauseOff[ci];
        const len = this.clauseLen[ci];

        if (this.litBuf[off] === falseLit) {
          this.litBuf[off] = this.litBuf[off + 1];
          this.litBuf[off + 1] = falseLit;
        }

        const otherLit = this.litBuf[off];
        const otherVar = otherLit > 0 ? otherLit : -otherLit;
        if (this.values[otherVar] === (otherLit > 0 ? TRUE : FALSE)) {
          watchList[writeIdx++] = ci;
          continue;
        }

        let found = false;
        for (let k = 2; k < len; k++) {
          const klit = this.litBuf[off + k];
          const kvar = klit > 0 ? klit : -klit;
          if (this.values[kvar] !== (klit > 0 ? FALSE : TRUE)) {
            this.litBuf[off + 1] = klit;
            this.litBuf[off + k] = falseLit;
            this.watches[litIdx(klit)].push(ci);
            found = true;
            break;
          }
        }

        if (found) continue;

        watchList[writeIdx++] = ci;

        if (this.values[otherVar] === UNDEF) {
          this.assign(otherVar, otherLit > 0 ? TRUE : FALSE);
        } else {
          for (let j = readIdx + 1; j < watchList.length; j++) {
            watchList[writeIdx++] = watchList[j];
          }
          watchList.length = writeIdx;
          return false;
        }
      }

      watchList.length = writeIdx;
    }

    return true;
  }

  /** Process unit clauses and propagate. */
  protected processUnitClauses(): boolean {
    for (let ci = 0; ci < this.numClauses; ci++) {
      if (this.clauseLen[ci] === 0) return false;
      if (this.clauseLen[ci] === 1) {
        const lit = this.litBuf[this.clauseOff[ci]];
        const v = lit > 0 ? lit : -lit;
        const val = lit > 0 ? TRUE : FALSE;
        if (this.values[v] === UNDEF) {
          this.assign(v, val);
        } else if (this.values[v] !== val) {
          return false;
        }
      }
    }
    return this.propagate();
  }

  protected backtrackTo(pos: number): void {
    while (this.trailSize > pos) {
      this.values[this.trail[--this.trailSize]] = UNDEF;
    }
    if (this.propHead > pos) this.propHead = pos;
  }
}

// --- One-shot solver (used by solveSAT / solveAllSAT / isUnique) ---

class Solver extends SATBase {
  solve(): boolean {
    return this.processUnitClauses() && this.search();
  }

  getAssignment(): Map<number, boolean> {
    const result = new Map<number, boolean>();
    for (let v = 1; v <= this.numVars; v++) {
      if (this.values[v] !== UNDEF) {
        result.set(v, this.values[v] === TRUE);
      }
    }
    return result;
  }

  private search(): boolean {
    let chosen = 0;
    for (let v = 1; v <= this.numVars; v++) {
      if (this.values[v] === UNDEF) {
        chosen = v;
        break;
      }
    }
    if (chosen === 0) return true;

    const saved = this.trailSize;
    const savedProp = this.propHead;

    this.assign(chosen, TRUE);
    if (this.propagate() && this.search()) return true;
    this.backtrackTo(saved);
    this.propHead = savedProp;

    this.assign(chosen, FALSE);
    if (this.propagate() && this.search()) return true;
    this.backtrackTo(saved);
    this.propHead = savedProp;

    return false;
  }
}

// --- Incremental solver (used by generator for repeated uniqueness checks) ---

/**
 * Incremental solver for repeated uniqueness checks with different assumption sets.
 * Build once, call isUniqueUnder() many times with different assumptions.
 * Uses activation literals to toggle constraint groups on/off.
 */
export class IncrementalSolver extends SATBase {
  private fixedTrailSize: number = 0;

  /** Process unit clauses and propagate. Call once after construction. */
  init(): boolean {
    if (!this.processUnitClauses()) return false;
    this.fixedTrailSize = this.trailSize;
    return true;
  }

  /** Check if exactly one solution exists under the given assumption literals. */
  isUniqueUnder(assumptions: number[]): boolean {
    this.backtrackTo(this.fixedTrailSize);

    for (const lit of assumptions) {
      const v = lit > 0 ? lit : -lit;
      const val = lit > 0 ? TRUE : FALSE;
      if (this.values[v] !== UNDEF) {
        if (this.values[v] !== val) return false;
        continue;
      }
      this.assign(v, val);
    }

    if (!this.propagate()) return false;
    return this.countSolutions(2) === 1;
  }

  private countSolutions(limit: number): number {
    let chosen = 0;
    for (let v = 1; v <= this.numVars; v++) {
      if (this.values[v] === UNDEF) {
        chosen = v;
        break;
      }
    }
    if (chosen === 0) return 1;

    let count = 0;
    const saved = this.trailSize;
    const savedProp = this.propHead;

    this.assign(chosen, TRUE);
    if (this.propagate()) {
      count += this.countSolutions(limit);
      if (count >= limit) {
        this.backtrackTo(saved);
        this.propHead = savedProp;
        return count;
      }
    }
    this.backtrackTo(saved);
    this.propHead = savedProp;

    this.assign(chosen, FALSE);
    if (this.propagate()) {
      count += this.countSolutions(limit - count);
    }
    this.backtrackTo(saved);
    this.propHead = savedProp;

    return count;
  }
}
