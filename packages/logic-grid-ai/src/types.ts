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
