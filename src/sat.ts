export type SATResult =
  | { satisfiable: true; assignment: Map<number, boolean> }
  | { satisfiable: false };

export function solveSAT(clauses: number[][]): SATResult {
  const solver = new Solver(clauses);
  if (!solver.solve()) return { satisfiable: false };
  return { satisfiable: true, assignment: solver.getAssignment() };
}

export function solveAllSAT(clauses: number[][], limit: number): Map<number, boolean>[] {
  const allVars = new Set<number>();
  for (const clause of clauses) {
    for (const lit of clause) allVars.add(Math.abs(lit));
  }

  const solutions: Map<number, boolean>[] = [];
  const working = clauses.map(c => [...c]);

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

/** Check if clauses have exactly one solution (up to the given variables). */
export function isUnique(clauses: number[][], allVars: Set<number>): boolean {
  const solver = new Solver(clauses);
  if (!solver.solve()) return false;

  const assignment = solver.getAssignment();
  const blocking: number[] = [];
  for (const v of allVars) {
    const val = assignment.get(v);
    blocking.push(val ? -v : v);
  }

  const withBlock = clauses.concat([blocking]);
  const solver2 = new Solver(withBlock);
  return !solver2.solve();
}

const UNDEF = 0;
const TRUE = 1;
const FALSE = 2;

class Solver {
  private numVars: number;
  private values: Uint8Array;
  // Flat clause storage
  private litBuf: Int32Array;
  private clauseOff: Uint32Array;
  private clauseLen: Uint16Array;
  private numClauses: number;
  // Watches: array-based per literal
  private watches: number[][];
  // Trail
  private trail: Int32Array;
  private trailSize: number;

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

    // Pack all literals into a single buffer
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

  solve(): boolean {
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
    if (!this.propagate()) return false;
    return this.search();
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

  private assign(v: number, val: number): void {
    this.values[v] = val;
    this.trail[this.trailSize++] = v;
  }

  private propagate(): boolean {
    // Process trail entries that haven't been propagated yet
    let qi = 0;
    while (qi < this.trailSize) {
      const v = this.trail[qi++];
      const falseLit = this.values[v] === TRUE ? -v : v;
      const fli = litIdx(falseLit);

      const watchList = this.watches[fli];
      let writeIdx = 0;

      for (let readIdx = 0; readIdx < watchList.length; readIdx++) {
        const ci = watchList[readIdx];
        const off = this.clauseOff[ci];
        const len = this.clauseLen[ci];

        // Ensure falseLit is at position 1 in the clause
        if (this.litBuf[off] === falseLit) {
          this.litBuf[off] = this.litBuf[off + 1];
          this.litBuf[off + 1] = falseLit;
        }

        // Check if the other watched literal (position 0) is true
        const otherLit = this.litBuf[off];
        const otherVar = otherLit > 0 ? otherLit : -otherLit;
        if (this.values[otherVar] === (otherLit > 0 ? TRUE : FALSE)) {
          watchList[writeIdx++] = ci;
          continue;
        }

        // Try to find a replacement watch in positions 2..len-1
        let found = false;
        for (let k = 2; k < len; k++) {
          const klit = this.litBuf[off + k];
          const kvar = klit > 0 ? klit : -klit;
          if (this.values[kvar] !== (klit > 0 ? FALSE : TRUE)) {
            // Swap into position 1
            this.litBuf[off + 1] = klit;
            this.litBuf[off + k] = falseLit;
            this.watches[litIdx(klit)].push(ci);
            found = true;
            break;
          }
        }

        if (found) continue; // Don't keep in this watch list

        // No replacement: keep watching, check for unit or conflict
        watchList[writeIdx++] = ci;

        if (this.values[otherVar] === UNDEF) {
          this.assign(otherVar, otherLit > 0 ? TRUE : FALSE);
        } else {
          // Conflict — copy remaining watches and return
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

  private search(): boolean {
    let chosen = 0;
    for (let v = 1; v <= this.numVars; v++) {
      if (this.values[v] === UNDEF) {
        chosen = v;
        break;
      }
    }
    if (chosen === 0) return true;

    const savedTrailSize = this.trailSize;

    this.assign(chosen, TRUE);
    if (this.propagate() && this.search()) return true;
    this.backtrackTo(savedTrailSize);

    this.assign(chosen, FALSE);
    if (this.propagate() && this.search()) return true;
    this.backtrackTo(savedTrailSize);

    return false;
  }

  private backtrackTo(pos: number): void {
    while (this.trailSize > pos) {
      const v = this.trail[--this.trailSize];
      this.values[v] = UNDEF;
    }
  }
}

function litIdx(lit: number): number {
  return lit > 0 ? lit * 2 : (-lit) * 2 + 1;
}
