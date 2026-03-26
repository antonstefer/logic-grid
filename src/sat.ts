export type SATResult =
  | { satisfiable: true; assignment: Map<number, boolean> }
  | { satisfiable: false };

export function solveSAT(clauses: number[][]): SATResult {
  const solver = new Solver(clauses);
  const sat = solver.solve();
  if (!sat) return { satisfiable: false };
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

    // Block this solution
    const blocking: number[] = [];
    for (const v of allVars) {
      blocking.push(assignment.get(v) ? -v : v);
    }
    working.push(blocking);
  }

  return solutions;
}

const UNDEF = 0;
const TRUE = 1;
const FALSE = 2;

class Solver {
  private numVars: number;
  private values: Uint8Array;           // var -> UNDEF | TRUE | FALSE
  private clauses: Int32Array[];        // clause literals
  private watches: Int32Array[];        // watches[lit_index] -> clause indices watching this lit
  private watchCount: Int32Array;       // number of entries in each watches array
  private trail: number[];              // assigned variables in order
  private trailLimits: number[];        // trail size at each decision level
  private reason: Int32Array;           // reason[var] = clause index that forced it, or -1

  constructor(inputClauses: number[][]) {
    // Find max variable
    let maxVar = 0;
    for (const clause of inputClauses) {
      for (const lit of clause) {
        const v = Math.abs(lit);
        if (v > maxVar) maxVar = v;
      }
    }
    this.numVars = maxVar;

    this.values = new Uint8Array(maxVar + 1);
    this.trail = [];
    this.trailLimits = [];
    this.reason = new Int32Array(maxVar + 1).fill(-1);

    // Copy clauses into typed arrays for cache efficiency
    this.clauses = [];
    // lit_index: positive lit l -> 2*l, negative lit -l -> 2*l+1
    // total possible lit indices: 2*(maxVar+1)
    const litCount = 2 * (maxVar + 1);
    const watchBuckets: number[][] = Array.from({ length: litCount }, () => []);
    this.watches = new Array(litCount);
    this.watchCount = new Int32Array(litCount);

    for (const rawClause of inputClauses) {
      if (rawClause.length === 0) {
        // Empty clause — immediately unsatisfiable, store it and let solve() catch it
        this.clauses.push(new Int32Array(0));
        continue;
      }
      const ci = this.clauses.length;
      const arr = new Int32Array(rawClause.length);
      for (let i = 0; i < rawClause.length; i++) arr[i] = rawClause[i];
      this.clauses.push(arr);

      if (rawClause.length >= 2) {
        // Watch first two literals
        watchBuckets[litIndex(arr[0])].push(ci);
        watchBuckets[litIndex(arr[1])].push(ci);
      }
      // Unit clauses handled during propagation
    }

    // Convert watch buckets to typed arrays
    for (let i = 0; i < litCount; i++) {
      this.watches[i] = new Int32Array(watchBuckets[i].length + 16); // extra space for growth
      for (let j = 0; j < watchBuckets[i].length; j++) {
        this.watches[i][j] = watchBuckets[i][j];
      }
      this.watchCount[i] = watchBuckets[i].length;
    }
  }

  solve(): boolean {
    // Enqueue all unit clauses
    for (let ci = 0; ci < this.clauses.length; ci++) {
      const c = this.clauses[ci];
      if (c.length === 0) return false;
      if (c.length === 1) {
        const lit = c[0];
        const v = Math.abs(lit);
        const val = lit > 0 ? TRUE : FALSE;
        if (this.values[v] === UNDEF) {
          this.assignLit(lit, ci);
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

  private assignLit(lit: number, reasonClause: number): void {
    const v = Math.abs(lit);
    this.values[v] = lit > 0 ? TRUE : FALSE;
    this.reason[v] = reasonClause;
    this.trail.push(v);
  }

  private propagate(): boolean {
    // BCP: process newly assigned literals
    let qhead = 0;
    // We process from the current trail position
    // On first call, qhead should start from 0; on subsequent calls from where we left off
    // Actually let's track propagation pointer
    qhead = this.trail.length - 1;
    if (qhead < 0) return true;

    // Process all recently assigned variables
    // We need to go through the trail from the last processed position
    let i = 0;
    while (i < this.trail.length) {
      const v = this.trail[i];
      i++;
      // The false literal for this assignment
      const falseLit = this.values[v] === TRUE ? -v : v;
      const fli = litIndex(falseLit);

      // Process all clauses watching falseLit
      const wcount = this.watchCount[fli];
      let j = 0;
      let newCount = 0;

      while (j < wcount) {
        const ci = this.watches[fli][j];
        const clause = this.clauses[ci];

        // Make sure the false literal is at position 1 (not 0)
        if (clause[0] === falseLit) {
          clause[0] = clause[1];
          clause[1] = falseLit;
        }

        // Check if the other watched literal (clause[0]) is already true
        const otherLit = clause[0];
        const otherVar = Math.abs(otherLit);
        const otherVal = this.values[otherVar];
        if (otherVal === (otherLit > 0 ? TRUE : FALSE)) {
          // Clause already satisfied, keep watching
          this.watches[fli][newCount++] = ci;
          j++;
          continue;
        }

        // Try to find a new literal to watch (from position 2 onward)
        let found = false;
        for (let k = 2; k < clause.length; k++) {
          const lit = clause[k];
          const litVar = Math.abs(lit);
          const litVal = this.values[litVar];
          // If this literal is not false, we can watch it
          if (litVal !== (lit > 0 ? FALSE : TRUE)) {
            // Swap clause[1] and clause[k]
            clause[1] = lit;
            clause[k] = falseLit;
            // Add this clause to the new literal's watch list
            this.addWatch(litIndex(lit), ci);
            found = true;
            break;
          }
        }

        if (found) {
          // Don't copy this clause to the compacted watch list
          j++;
          continue;
        }

        // No replacement found. clause[0] is the only potentially non-false literal.
        this.watches[fli][newCount++] = ci;
        j++;

        if (otherVal === UNDEF) {
          // Unit propagation: clause[0] must be true
          this.assignLit(otherLit, ci);
        } else {
          // Conflict: clause[0] is also false
          // Copy remaining watches
          while (j < wcount) {
            this.watches[fli][newCount++] = this.watches[fli][j++];
          }
          this.watchCount[fli] = newCount;
          return false;
        }
      }

      this.watchCount[fli] = newCount;
    }

    return true;
  }

  private search(): boolean {
    // Pick an unassigned variable
    let chosen = 0;
    for (let v = 1; v <= this.numVars; v++) {
      if (this.values[v] === UNDEF) {
        chosen = v;
        break;
      }
    }

    if (chosen === 0) return true; // All assigned, SAT

    // Decision: try true, then false
    for (const polarity of [TRUE, FALSE]) {
      const trailPos = this.trail.length;
      this.trailLimits.push(trailPos);

      const lit = polarity === TRUE ? chosen : -chosen;
      this.assignLit(lit, -1);

      if (this.propagate() && this.search()) {
        return true;
      }

      // Backtrack
      this.backtrackTo(trailPos);
      this.trailLimits.pop();
    }

    return false;
  }

  private backtrackTo(trailPos: number): void {
    while (this.trail.length > trailPos) {
      const v = this.trail.pop()!;
      this.values[v] = UNDEF;
      this.reason[v] = -1;
    }
  }

  private addWatch(li: number, ci: number): void {
    const count = this.watchCount[li];
    if (count >= this.watches[li].length) {
      // Grow the array
      const newArr = new Int32Array(this.watches[li].length * 2);
      newArr.set(this.watches[li]);
      this.watches[li] = newArr;
    }
    this.watches[li][count] = ci;
    this.watchCount[li] = count + 1;
  }
}

function litIndex(lit: number): number {
  return lit > 0 ? lit * 2 : (-lit) * 2 + 1;
}
