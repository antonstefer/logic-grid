import type { Category } from "logic-grid";

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
  positionNoun: [string, string];
  positionPreposition: string;
}

/** Minimal AI client interface. */
export interface AIClient {
  /** Send a prompt and get back structured JSON matching the given schema. */
  completeJSON<T>(prompt: string, schema: JSONSchema): Promise<T>;
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
