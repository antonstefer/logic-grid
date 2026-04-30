export { generateTheme, ThemeGenerationError } from "./theme";
export { rewriteClues, RewriteCluesError } from "./rewrite";
export { translate, TranslationError } from "./translate";
export {
  createAnthropicClient,
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_ANTHROPIC_TEMPERATURE,
  type AnthropicClientOptions,
} from "./client";
export { validateThemeResult } from "./validation";
export { validateRewrittenClues } from "./clue-validation";
export type {
  ThemeOptions,
  ThemeResult,
  RewriteCluesOptions,
  RewriteCluesResult,
  TranslateOptions,
  TranslatedPuzzle,
  AIClient,
  JSONSchema,
  ThemeValidationCode,
  ThemeValidationError,
  RewriteCluesValidationCode,
  RewriteCluesValidationError,
  TranslationValidationCode,
  TranslationValidationError,
} from "./types";
