import type { Category, Clue, Puzzle } from "logic-grid";

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
 * `category` is the asserted category name when the error is scoped to one,
 * regardless of whether that name is itself valid (e.g. for `long_category_name`,
 * `category` echoes the over-long name so callers can group errors by it).
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

/** Options for AI-powered puzzle translation. */
export interface TranslateOptions {
  /**
   * Source puzzle. The `constraints` and `grid.categories` are the ground
   * truth that validation compares against; rendered clue `text` is shown
   * to the translator as a stylistic hint but may have already drifted
   * (e.g. via {@link rewriteClues}).
   */
  puzzle: Puzzle;
  /**
   * Target locale. Free-form string passed verbatim into the prompt — both
   * BCP-47 codes ("de-DE", "ja-JP") and plain language names ("German",
   * "Japanese") work. Empty string is rejected.
   */
  locale: string;
  /** Translator client. Defaults to Anthropic SDK using ANTHROPIC_API_KEY. */
  client?: AIClient;
  /**
   * Validator client. Strongly recommended to pass a client backed by a
   * different model than the translator — single-model validation has
   * correlated blind spots. Defaults to `client` if omitted; if both are
   * omitted, a separate Anthropic client with `temperature: 0` is created
   * for deterministic verdicts.
   */
  validator?: AIClient;
}

/**
 * Result of translating a puzzle.
 *
 * Constraints and the canonical `grid` are NOT modified — the engine
 * continues to operate on the original English keys. The renderer composes
 * the original puzzle with these maps to display localized strings.
 */
export interface TranslatedPuzzle {
  /** Localized clue text, in the same order as `puzzle.clues`. */
  clues: Clue[];
  /**
   * Map from canonical category name → localized display name.
   * E.g. `{ "House": "Haus", "Color": "Farbe" }`.
   */
  categoryNames: Record<string, string>;
  /**
   * Map from canonical value (across all categories) → localized label.
   * Values are globally unique in a logic-grid puzzle, so a flat map is
   * unambiguous. Proper nouns map to themselves verbatim.
   * E.g. `{ "Yellow": "Gelb", "Cat": "Katze", "Alice": "Alice" }`.
   */
  valueLabels: Record<string, string>;
}

/**
 * Structured validation error for AI-translated puzzles.
 *
 * Codes split into two tiers:
 * - Structural (cheap, deterministic): wrong counts, non-strings, empties,
 *   over-length, duplicates, missing keys.
 * - Semantic (AI-driven): constraint type drift incl. polarity, direction
 *   flip on asymmetric comparators, numeric / unit drift, proper-noun drop.
 */
export type TranslationValidationCode =
  | "wrong_clue_count"
  | "non_string_clue"
  | "empty_translation"
  | "long_translation"
  | "duplicate_translation"
  | "missing_category_name"
  | "empty_category_name"
  | "missing_value_label"
  | "empty_value_label"
  | "constraint_type_mismatch"
  | "direction_flip"
  | "numeric_changed"
  | "proper_noun_dropped";

export interface TranslationValidationError {
  code: TranslationValidationCode;
  message: string;
  /** 1-indexed clue position when the error is scoped to a single clue. */
  clueIndex?: number;
  /** Canonical category or value name when the error is scoped to one. */
  key?: string;
}
