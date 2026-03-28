export { generate } from "./generator";
export { solve, hasUniqueSolution } from "./solver";
export { classify } from "./difficulty";
export { deduce } from "./deduce";

export {
  sameHouse,
  notSameHouse,
  nextTo,
  notNextTo,
  leftOf,
  between,
  notBetween,
  before,
  exactDistance,
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
  DeductionTechnique,
  DeductionStep,
  DeductionResult,
} from "./types";
