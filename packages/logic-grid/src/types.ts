/** A named group of values that occupy positions in the grid. */
export interface Category {
  name: string;
  values: string[];
  /** Noun for clue phrases. `"owner"` → "the cat owner". Empty string = bare value ("Alice"). */
  noun?: string;
  /** Verb phrases for same-house clues: `[positive, negative]`. Include "the" if appropriate. E.g. `["drives the", "does not drive the"]`. */
  verb?: [string, string];
}

/** The puzzle board: `size` positions and one or more categories. */
export interface Grid {
  size: number;
  categories: Category[];
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
  | { type: "same_house"; a: string; b: string }
  | { type: "not_same_house"; a: string; b: string }
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
export type Difficulty = "easy" | "medium" | "hard";

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
}
