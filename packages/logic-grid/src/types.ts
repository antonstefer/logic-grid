/** Custom comparator phrases for ordering constraints. */
export type OrderingComparatorType =
  | "left_of"
  | "before"
  | "next_to"
  | "not_next_to"
  | "between"
  | "not_between"
  | "exact_distance";

/** Domain-specific phrasing for ordering constraints on a category. */
export interface OrderingPhrases {
  /** Singular/plural unit, e.g. `["hour", "hours"]` → "exactly two hours apart". */
  unit?: [string, string];
  /** Custom comparator phrases keyed by constraint type. */
  comparators?: Partial<Record<OrderingComparatorType, string>>;
}

/** Configurable words for composing ordering clue sentences. */
export interface SpatialWords {
  /** [positive, negative] verb. E.g. `["lives", "does not live"]` or `["is", "is not"]`. */
  verb: [string, string];
  /** Adjacency word for next_to / not_next_to. E.g. `"next to"` or `"adjacent to"`. */
  adjacency: string;
  /** [forward, reverse] directional words for left_of / before. E.g. `["left of", "right of"]` or `["before", "after"]`. */
  direction: [string, string];
  /** Suffix for between / not_between, composed with verb. E.g. `"somewhere between"` → "lives somewhere between". */
  between: string;
  /** [positive, negative] for at_position / not_at_position. E.g. `["lives in", "does not live in"]` or `["has an appointment at", "does not have an appointment at"]`. */
  atPosition: [string, string];
  /** Spelled-out cardinal numbers for exact_distance. */
  cardinals: string[];
  /** Full-phrase overrides per constraint type. Checked before composing from verb/direction/adjacency. */
  comparators?: Partial<Record<OrderingComparatorType, string>>;
  /** Singular/plural distance unit override. When set, exact_distance uses this instead of positionNoun. */
  distanceUnit?: [string, string];
}

/** A named group of values that occupy positions in the grid. */
export interface Category {
  name: string;
  values: string[];
  /** Noun for clue phrases. `"owner"` → "the cat owner". Empty string = bare value ("Alice"). */
  noun?: string;
  /** Verb phrases for same-position clues: `[positive, negative]`. Include "the" if appropriate. E.g. `["drives the", "does not drive the"]`. */
  verb?: [string, string];
  /** Subject priority for same-position clues. Higher = more likely to be the sentence subject. */
  subjectPriority?: number;
  /** Set when this category's values describe the position noun (e.g. Color describes "house": "the red house", "The first house is red."). */
  positionAdjective?: {
    /** Appended to value in same-position clues. E.g. `"house"` → "red house". */
    suffix: string;
    /** [positive, negative] verb for at_position. E.g. `["is", "is not"]` → "The first house is red." */
    atPosition: [string, string];
  };
  /** When true, this category defines position labels. Assignment is identity (value[i] → position i). */
  isPosition?: boolean;
  /** Actual numeric values per position, enabling value-based distance for `exact_distance`. Must match `values` length. */
  numericValues?: number[];
  /** Domain-specific phrasing for ordering constraints. */
  orderingPhrases?: OrderingPhrases;
}

/** The puzzle board: `size` positions and one or more categories. */
export interface Grid {
  size: number;
  categories: Category[];
  /** Singular and plural position noun, e.g. `["house", "houses"]`. */
  positionNoun: [string, string];
  /** Preposition for positional phrases, e.g. `"in"` → "lives in the first house". */
  positionPreposition: string;
  /** Configurable words for composing ordering clue sentences. */
  spatialWords: SpatialWords;
  /** Human-readable position labels. E.g. `["the first house", ...]` or `["6%", "7%", ...]`. */
  positionLabels: string[];
}

/** Maps each value name to its 0-indexed position. One per category. */
export type Assignment = Record<string, number>;

/** Complete puzzle solution — one {@link Assignment} per category. */
export type Solution = Assignment[];

/** Union of all constraint type string literals. */
export type ConstraintType = Constraint["type"];

/**
 * A logical relationship between values. Discriminated union on `type`.
 * Positions are 0-indexed.
 */
export type Constraint =
  | { type: "same_position"; a: string; b: string }
  | { type: "not_same_position"; a: string; b: string }
  | { type: "next_to"; a: string; b: string }
  | { type: "not_next_to"; a: string; b: string }
  | { type: "left_of"; a: string; b: string }
  | { type: "between"; outer1: string; middle: string; outer2: string }
  | { type: "not_between"; outer1: string; middle: string; outer2: string }
  | { type: "before"; a: string; b: string }
  | { type: "exact_distance"; a: string; b: string; distance: number }
  | { type: "at_position"; value: string; position: number }
  | { type: "not_at_position"; value: string; position: number };

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
  | "direct"
  | "elimination"
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
  /** Singular and plural position noun. Default: `["house", "houses"]`. */
  positionNoun?: [string, string];
  /** Preposition for positional phrases. Default: `"in"`. */
  positionPreposition?: string;
}
