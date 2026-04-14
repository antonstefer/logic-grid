/** Custom comparator phrases for ordering constraints. */
export type OrderingComparatorType =
  | "left_of"
  | "before"
  | "next_to"
  | "not_next_to"
  | "between"
  | "not_between"
  | "exact_distance";

/**
 * Comparator phrases for all 7 constraint types.
 *
 * Directional constraints (`before`, `left_of`) require a `[forward, reverse]`
 * tuple for phrasing variety. The renderer picks which to use based on subject
 * priority and a deterministic hash tiebreaker.
 *   Forward: "Alice has a lower return than Bob."
 *   Reverse: "Bob has a higher return than Alice."
 *
 * Symmetric constraints (`next_to`, `between`, etc.) are a plain string since
 * both directions read the same.
 */
export interface ComparatorMap {
  before: [string, string];
  left_of: [string, string];
  next_to: string;
  not_next_to: string;
  between: string;
  not_between: string;
  exact_distance: string;
}

/** Domain-specific phrasing for ordering constraints on a category. */
export interface OrderingPhrases {
  /** Singular/plural unit for exact_distance, e.g. `["hour", "hours"]` → "exactly two hours apart". */
  unit?: [string, string];
  /** Comparator phrases for all 7 comparative constraint types. Required. */
  comparators: ComparatorMap;
}

/** Shared fields on every category. */
interface CategoryCore {
  name: string;
  values: string[];
  /** Noun for clue phrases. `"owner"` → "the cat owner". Empty string = bare value ("Alice"). */
  noun?: string;
  /** Subject priority for same-position clues. Higher = more likely to be the sentence subject. */
  subjectPriority?: number;
  /** When true, values are lowercased in clue phrases. Use for adjective/common-noun categories (Color, Pet) where "Red" should render as "the red house". Default: false (proper nouns preserved). */
  lowercase?: boolean;
}

/**
 * Ordered / unordered discriminator.
 *
 * `ordered: true` implies:
 * - `values` array defines the canonical total order (rank = array index).
 * - The category may be referenced as `axis` on any comparative constraint.
 * - `verb` is required (used for at_position rendering).
 * - `numericValues` and `orderingPhrases` become legal.
 * - The category participates in multi-axis generation, deduction, rendering.
 */
type OrderednessFields =
  | {
      ordered: true;
      /** Verb phrases for same-position clues: `[positive, negative]`. Required on ordered categories. */
      verb: [string, string];
      /** Per-rank numeric values for non-equidistant `exact_distance`. Must match `values` length and be ascending. */
      numericValues?: number[];
      /** Domain-specific phrasing for ordering constraints on this axis. Required on all ordered categories. */
      orderingPhrases: OrderingPhrases;
      /** Optional display labels for UI (grid headers). When absent, `values` are used. Clue rendering always uses `values`. */
      displayLabels?: string[];
    }
  | {
      ordered?: false;
      /** Verb phrases for same-position clues: `[positive, negative]`. Required when noun !== "" (runtime check). */
      verb?: [string, string];
      numericValues?: never;
      orderingPhrases?: never;
    };

/**
 * `positionAdjective` requires `valueSuffix`. Color-like categories
 * ("The 1st house is red") need both: the suffix gives the object form,
 * and the adjective verb pair gives the "is"/"is not" for same_position
 * rendering when the other side is an ordered-category value.
 */
type ValueSuffixFields =
  | {
      /** Suffix appended to the value in object position. E.g. `"house"` → "red house". */
      valueSuffix: string;
      /** Verb pair used when this category's value appears with an ordered-category value on the other side. E.g. `["is", "is not"]`. */
      positionAdjective?: [string, string];
    }
  | {
      valueSuffix?: undefined;
      positionAdjective?: undefined;
    };

/** A named group of values that occupy positions in the grid. */
export type Category = CategoryCore & OrderednessFields & ValueSuffixFields;

/** A Category known to be ordered (returned by resolveAxis). */
export type OrderedCategory = CategoryCore & {
  ordered: true;
  verb: [string, string];
  numericValues?: number[];
  orderingPhrases: OrderingPhrases;
  displayLabels?: string[];
} & ValueSuffixFields;

/** The puzzle board: `size` positions and one or more categories. */
export interface Grid {
  size: number;
  categories: Category[];
  /** Optional hint for presentation layers: name of an ordered category to use as display anchor. If absent, presentation picks the first ordered category. */
  displayAxis?: string;
}

/** Maps each value name to its 0-indexed position. One per category. */
export type Assignment = Record<string, number>;

/** Complete puzzle solution — one {@link Assignment} per category. */
export type Solution = Assignment[];

/** Union of all constraint type string literals. */
export type ConstraintType = Constraint["type"];

/**
 * A logical relationship between values. Discriminated union on `type`.
 * Row indices are internal SAT bookkeeping; every comparative constraint
 * references an ordered category via `axis`.
 */
export type Constraint =
  | { type: "same_position"; a: string; b: string }
  | { type: "not_same_position"; a: string; b: string }
  | { type: "next_to"; a: string; b: string; axis: string }
  | { type: "not_next_to"; a: string; b: string; axis: string }
  | { type: "left_of"; a: string; b: string; axis: string }
  | {
      type: "between";
      outer1: string;
      middle: string;
      outer2: string;
      axis: string;
    }
  | {
      type: "not_between";
      outer1: string;
      middle: string;
      outer2: string;
      axis: string;
    }
  | { type: "before"; a: string; b: string; axis: string }
  | {
      type: "exact_distance";
      a: string;
      b: string;
      distance: number;
      axis: string;
    };

/** Puzzle difficulty level, determined by constraint types and deduction depth. */
export type Difficulty = "easy" | "medium" | "hard" | "expert";

/** A human-readable clue derived from a constraint. */
export interface Clue {
  constraint: Constraint;
  text: string;
}

/** A complete generated puzzle with solution and metadata. */
export interface Puzzle {
  grid: Grid;
  constraints: Constraint[];
  clues: Clue[];
  solution: Solution;
  difficulty: Difficulty;
}

/** The technique used in a deduction step. */
export type DeductionTechnique =
  | "same_position"
  | "not_same_position"
  | "next_to"
  | "not_next_to"
  | "left_of"
  | "before"
  | "between"
  | "not_between"
  | "exact_distance"
  | "naked_single"
  | "hidden_single"
  | "naked_pair"
  | "naked_triple"
  | "hidden_pair"
  | "hidden_triple"
  | "contradiction";

/** A single logical deduction step. */
export interface DeductionStep {
  /** Which technique produced this deduction. */
  technique: DeductionTechnique;
  /** Indices into the constraints array (which clues were used). */
  clueIndices: number[];
  /** Positions eliminated in this step. */
  eliminations: { value: string; position: number }[];
  /** Values pinned to positions in this step. */
  assignments: { value: string; position: number }[];
  /** Human-readable explanation. */
  explanation: string;
}

/** Result of step-by-step deduction. */
export interface DeductionResult {
  /** Ordered deduction steps. */
  steps: DeductionStep[];
  /** Whether the puzzle was fully solved by deduction alone. */
  complete: boolean;
}

/** Options for {@link generate}. All fields are optional. */
export interface GenerateOptions {
  /** Number of positions in the grid. Default: 4. */
  size?: number;
  /** Number of categories. Default: 4. */
  categories?: number;
  /** Target difficulty. Generation retries until this is achieved. */
  difficulty?: Difficulty;
  /** Custom category definitions. Overrides `categories` count. */
  categoryNames?: Category[];
  /** Random seed for reproducible generation. */
  seed?: number;
  /** Optional presentation hint naming an ordered category as display anchor. */
  displayAxis?: string;
}
