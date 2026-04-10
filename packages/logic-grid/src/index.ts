export { generate } from "./generator";
export { DEFAULT_CATEGORIES, defaultHouseCategory } from "./default-config";
export { solve, hasUniqueSolution } from "./solver";
export { classify } from "./difficulty";
export { deduce } from "./deduce";

export {
  samePosition,
  notSamePosition,
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
export {
  isOrdered,
  resolveAxis,
  orderedCategories,
  axisRank,
  displayAxisCategory,
  validateConstraints,
} from "./axis";

export type {
  Category,
  OrderingPhrases,
  OrderingComparatorType,
  ComparatorMap,
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
