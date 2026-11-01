import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import svelte from "eslint-plugin-svelte";

export default defineConfig(
  {
    files: ["src/**/*.ts", "src/**/*.svelte"],
    extends: [tseslint.configs.recommended, svelte.configs.recommended],
    languageOptions: {
      parserOptions: {
        // svelte-eslint-parser parses .svelte and .svelte.ts files and hands
        // their TypeScript to this parser.
        parser: tseslint.parser,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
  prettier,
  svelte.configs.prettier,
);
