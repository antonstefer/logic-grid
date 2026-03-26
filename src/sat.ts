export type SATResult =
  | { satisfiable: true; assignment: Map<number, boolean> }
  | { satisfiable: false };

export function solveSAT(clauses: number[][]): SATResult {
  const assignment = new Map<number, boolean>();
  const result = dpll(clauses.map(c => [...c]), assignment);
  if (result) {
    return { satisfiable: true, assignment };
  }
  return { satisfiable: false };
}

export function solveAllSAT(clauses: number[][], limit: number): Map<number, boolean>[] {
  const solutions: Map<number, boolean>[] = [];
  const workingClauses = clauses.map(c => [...c]);

  while (solutions.length < limit) {
    const assignment = new Map<number, boolean>();
    const result = dpll(workingClauses.map(c => [...c]), assignment);
    if (!result) break;

    solutions.push(assignment);

    // Add blocking clause: negate this solution
    const blocking: number[] = [];
    for (const [variable, value] of assignment) {
      blocking.push(value ? -variable : variable);
    }
    workingClauses.push(blocking);
  }

  return solutions;
}

function dpll(clauses: number[][], assignment: Map<number, boolean>): boolean {
  // Unit propagation
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < clauses.length; i++) {
      const clause = clauses[i];
      if (clause.length === 0) return false;
      if (clause.length === 1) {
        const lit = clause[0];
        const variable = Math.abs(lit);
        const value = lit > 0;
        if (assignment.has(variable)) {
          if (assignment.get(variable) !== value) return false;
          continue;
        }
        assignment.set(variable, value);
        clauses = simplify(clauses, lit);
        changed = true;
        break;
      }
    }
  }

  // Check if all clauses satisfied
  if (clauses.length === 0) return true;

  // Check for empty clause
  for (const clause of clauses) {
    if (clause.length === 0) return false;
  }

  // Pure literal elimination
  const literalCounts = new Map<number, number>();
  for (const clause of clauses) {
    for (const lit of clause) {
      literalCounts.set(lit, (literalCounts.get(lit) ?? 0) + 1);
    }
  }
  for (const [lit] of literalCounts) {
    const variable = Math.abs(lit);
    if (!assignment.has(variable) && !literalCounts.has(-lit)) {
      assignment.set(variable, lit > 0);
      clauses = simplify(clauses, lit);
      return dpll(clauses, assignment);
    }
  }

  // Choose an unassigned variable (first literal in first clause)
  let chosenVar = 0;
  for (const clause of clauses) {
    for (const lit of clause) {
      const v = Math.abs(lit);
      if (!assignment.has(v)) {
        chosenVar = v;
        break;
      }
    }
    if (chosenVar !== 0) break;
  }

  if (chosenVar === 0) return true;

  // Try true
  const savedAssignment = new Map(assignment);
  assignment.set(chosenVar, true);
  if (dpll(simplify(clauses, chosenVar), assignment)) return true;

  // Backtrack, try false
  assignment.clear();
  for (const [k, v] of savedAssignment) assignment.set(k, v);
  assignment.set(chosenVar, false);
  if (dpll(simplify(clauses, -chosenVar), assignment)) return true;

  // Restore assignment on failure
  assignment.clear();
  for (const [k, v] of savedAssignment) assignment.set(k, v);
  return false;
}

function simplify(clauses: number[][], lit: number): number[][] {
  const result: number[][] = [];
  for (const clause of clauses) {
    if (clause.includes(lit)) continue; // clause satisfied
    const filtered = clause.filter(l => l !== -lit);
    result.push(filtered);
  }
  return result;
}
