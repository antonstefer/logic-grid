import type { Category, Clue } from "logic-grid";

/** Options for AI-powered theme generation. */
export interface ThemeOptions {
  /** Theme description, e.g. "pirate adventure", "solar system". */
  theme: string;
  /** Number of values per category (3–8). */
  size: number;
  /** Number of categories (3–8). */
  categories: number;
  /** Optional constraints, e.g. "kid-friendly", "educational". */
  constraints?: string[];
  /** Optional AI client override. Defaults to Anthropic SDK using ANTHROPIC_API_KEY. */
  client?: AIClient;
}

/** Result of theme generation. */
export interface ThemeResult {
  categories: Category[];
}

/** Minimal AI client interface. */
export interface AIClient {
  /** Send a prompt and get back structured JSON matching the given schema. */
  completeJSON<T>(prompt: string, schema: JSONSchema): Promise<T>;
}

/** Options for AI-powered clue rewriting. */
export interface RewriteCluesOptions {
  /** The clues to rewrite. Each must have a constraint and original text. */
  clues: Clue[];
  /** Optional writing style, e.g. "formal", "casual", "pirate storytelling". */
  style?: string;
  /** Optional AI client override. Defaults to Anthropic SDK using ANTHROPIC_API_KEY. */
  client?: AIClient;
}

/** Raw AI output shape for clue rewriting. */
export interface RewriteCluesResult {
  clues: string[];
}

/** JSON Schema subset used for structured output. */
export interface JSONSchema {
  type: string;
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  required?: string[];
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  enum?: string[];
  description?: string;
}

/**
 * Structured validation error for AI-generated theme output.
 * `code` is stable and machine-readable; `message` is human-readable.
 * `category` is the offending category name when the error is scoped to one.
 */
export type ThemeValidationCode =
  | "wrong_category_count"
  | "empty_category_name"
  | "long_category_name"
  | "duplicate_category_name"
  | "wrong_value_count"
  | "empty_value"
  | "long_value"
  | "duplicate_value"
  | "positional_word_value"
  | "whitespace_noun"
  | "duplicate_noun"
  | "invalid_verb"
  | "empty_verb"
  | "missing_verb"
  | "invalid_numeric_values"
  | "non_ascending_numeric_values"
  | "invalid_ordering_phrases"
  | "symmetric_comparator_tuple"
  | "invalid_value_suffix"
  | "invalid_position_adjective"
  | "missing_value_suffix"
  | "invalid_subject_priority"
  | "no_person_category"
  | "multiple_person_categories"
  | "no_ordered_category";

export interface ThemeValidationError {
  code: ThemeValidationCode;
  message: string;
  category?: string;
}

/** Structured validation error for AI-rewritten clues. */
export type RewriteCluesValidationCode =
  | "wrong_clue_count"
  | "non_string_clue"
  | "empty_clue"
  | "long_clue"
  | "duplicate_clue";

export interface RewriteCluesValidationError {
  code: RewriteCluesValidationCode;
  message: string;
  /** 1-indexed clue position when the error is scoped to a single clue. */
  clueIndex?: number;
}
