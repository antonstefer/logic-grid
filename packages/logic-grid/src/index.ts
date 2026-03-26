export { generate } from "./generator";
export { solve, hasUniqueSolution, createSolverContext } from "./solver";
export type { SolverContext } from "./solver";
export { classify } from "./difficulty";

export {
  sameHouse,
  notSameHouse,
  nextTo,
  notNextTo,
  leftOf,
  between,
  atPosition,
  notAtPosition,
} from "./clues/constraints";

export { renderClue } from "./clues/templates";

export type {
  Category,
  Grid,
  Assignment,
  Solution,
  ConstraintType,
  Constraint,
  Difficulty,
  Clue,
  Puzzle,
  GenerateOptions,
} from "./types";
