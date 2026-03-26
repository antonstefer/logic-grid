export interface Category {
  name: string;
  values: string[];
}

export interface Grid {
  size: number;
  categories: Category[];
}

export type Assignment = Record<string, number>;

export type Solution = Assignment[];

export type ConstraintType = Constraint["type"];

export type Constraint =
  | { type: "same_house"; a: string; b: string }
  | { type: "not_same_house"; a: string; b: string }
  | { type: "next_to"; a: string; b: string }
  | { type: "not_next_to"; a: string; b: string }
  | { type: "left_of"; a: string; b: string }
  | { type: "between"; outer1: string; middle: string; outer2: string }
  | { type: "at_position"; value: string; position: number }
  | { type: "not_at_position"; value: string; position: number };

export type Difficulty = "easy" | "medium" | "hard";

export interface Clue {
  constraint: Constraint;
  text: string;
}

export interface Puzzle {
  grid: Grid;
  constraints: Constraint[];
  clues: Clue[];
  solution: Solution;
  difficulty: Difficulty;
}

export interface GenerateOptions {
  size?: number;
  categories?: number;
  difficulty?: Difficulty;
  categoryNames?: Category[];
  seed?: number;
}
