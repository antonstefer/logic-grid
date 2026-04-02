import type { ThemeOptions, ThemeResult, AIClient, JSONSchema } from "./types";
import { createAnthropicClient } from "./client";
import { validateThemeResult } from "./validation";

const MAX_RETRIES = 3;

function buildSchema(size: number, categories: number): JSONSchema {
  const categorySchema: JSONSchema = {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Category name, e.g. 'Ship', 'Treasure'",
      },
      values: {
        type: "array",
        items: { type: "string" },
        minItems: size,
        maxItems: size,
        description: `Exactly ${size} unique values for this category`,
      },
      noun: {
        type: "string",
        description:
          'Label noun for clue phrases. Empty string "" for the person category (bare name). E.g. "captain" → "the galleon captain".',
      },
      verb: {
        type: "array",
        items: { type: "string" },
        minItems: 2,
        maxItems: 2,
        description:
          'Optional [positive, negative] verb phrases for same-house clues. E.g. ["sails the", "does not sail the"]. Include "the" if appropriate.',
      },
      isPosition: {
        type: "boolean",
        description:
          "If true, this category defines the positional axis. Its values are the position labels (e.g. sorted returns, years, times). At most one category can be isPosition. Its assignment is identity (value[0] → position 0, etc.), so it is not a mystery.",
      },
      numericValues: {
        type: "array",
        items: { type: "number" },
        minItems: size,
        maxItems: size,
        description: `Optional numeric values for categories with ordered values. Enables value-based distance clues (e.g. "exactly 11 years apart"). Must be ${size} numbers in ascending order matching the values array.`,
      },
      orderingPhrases: {
        type: "object",
        properties: {
          unit: {
            type: "array",
            items: { type: "string" },
            minItems: 2,
            maxItems: 2,
            description:
              'Singular and plural unit for distance clues, e.g. ["percentage point", "percentage points"] or ["year", "years"].',
          },
          comparators: {
            type: "object",
            description:
              'Custom phrases for ordering constraints. Keys: "left_of", "before", "next_to", "not_next_to", "between", "not_between", "exact_distance". E.g. { "before": "has a larger return than" }.',
          },
        },
        description:
          "Domain-specific phrasing for ordering clues. Use on any category with ordered values for natural clue phrasing.",
      },
    },
    required: ["name", "values", "noun"],
  };

  return {
    type: "object",
    properties: {
      categories: {
        type: "array",
        items: categorySchema,
        minItems: categories,
        maxItems: categories,
        description: `Exactly ${categories} categories`,
      },
      positionNoun: {
        type: "array",
        items: { type: "string" },
        minItems: 2,
        maxItems: 2,
        description:
          'Singular and plural position noun, e.g. ["dock", "docks"]',
      },
      positionPreposition: {
        type: "string",
        description:
          'Preposition for positional phrases, e.g. "at" → "lives at the first dock"',
      },
    },
    required: ["categories", "positionNoun", "positionPreposition"],
  };
}

function buildPrompt(options: ThemeOptions, previousErrors?: string[]): string {
  const { theme, size, categories, constraints } = options;

  let prompt = `You are generating themed categories for a logic grid puzzle (like Einstein's riddle).

## How the puzzle works

The puzzle has ${size} positions in a row, labeled "first", "second", etc. Each position has one value from each category. The solver deduces which values go in which position using clues.

Clues use the category's noun and verb to form natural sentences. Here's how:

- A category with noun: "" is the PERSON category. Values are used bare: "Alice", "Bob". There must be exactly one person category.
- A category with noun: "owner" creates labels like "the cat owner". Verb: ["owns the", "does not own the"] produces clues like "Alice owns the cat."
- A category with noun: "house" creates labels like "the red house". Verb is optional — defaults are used if omitted.

## Position noun

The position noun labels the ordered slots. Default is "house" with preposition "in": "lives in the first house". You should pick a thematic alternative. For example, a cooking theme might use ["station", "stations"] with preposition "at": "lives at the first station".

## Position categories (optional)

You may mark ONE category as a position category by setting "isPosition": true. This category defines the positional axis — its values ARE the positions (e.g. times, years, percentages). Its assignment is identity (value[0] = position 0), so it's not a mystery the solver needs to figure out. It reduces the number of mystery categories by one but enables rich domain-specific clue phrasing.

When using a position category:
- Its values must be in sorted order and represent the ordered axis
- Add "numericValues" with the actual numeric values (enables distance clues like "exactly 2 hours apart")
- Add "orderingPhrases" with a "unit" (singular/plural) and "comparators" for natural phrasing
- The positionNoun/positionPreposition are still needed but will be secondary to the position category's phrasing

Use a position category when the theme has a natural ordering axis (times, prices, rankings, years, distances).

## Examples

### Standard puzzle (no position category)
For a "cooking competition" theme with size 4 and 4 categories:
{
  "categories": [
    { "name": "Chef", "values": ["Gordon", "Julia", "Marco", "Nigella"], "noun": "" },
    { "name": "Dish", "values": ["Risotto", "Soufflé", "Tartare", "Ramen"], "noun": "chef", "verb": ["prepares the", "does not prepare the"] },
    { "name": "Ingredient", "values": ["Truffle", "Saffron", "Wagyu", "Caviar"], "noun": "specialist", "verb": ["uses", "does not use"] },
    { "name": "Tool", "values": ["Wok", "Blowtorch", "Mandoline", "Cleaver"], "noun": "user", "verb": ["wields the", "does not wield the"] }
  ],
  "positionNoun": ["station", "stations"],
  "positionPreposition": "at"
}

This produces clues like:
- "Gordon prepares the risotto." (same_house: Chef=Gordon, Dish=Risotto)
- "The truffle specialist is at the first station." (at_position)
- "The wok user is directly left of the blowtorch user." (left_of)

### Position category puzzle
For a "hedge fund" theme with size 4 and 4 categories:
{
  "categories": [
    { "name": "Manager", "values": ["Alice", "Bob", "Clara", "Dan"], "noun": "" },
    { "name": "YTD Return", "values": ["6%", "7%", "8%", "9%"], "noun": "fund", "isPosition": true, "numericValues": [6, 7, 8, 9], "orderingPhrases": { "unit": ["percentage point", "percentage points"], "comparators": { "before": "has a larger return than", "left_of": "has a return exactly one percentage point less than" } } },
    { "name": "Strategy", "values": ["Long/Short", "Macro", "Quant", "Event-Driven"], "noun": "strategist", "verb": ["uses", "does not use"] },
    { "name": "Founded", "values": ["2005", "2010", "2015", "2020"], "noun": "fund", "verb": ["was founded in", "was not founded in"] }
  ],
  "positionNoun": ["fund", "funds"],
  "positionPreposition": "at"
}

This produces clues like:
- "The fund with a return of 6% is run by Alice." (at_position with position category)
- "Bob has a larger return than Clara." (before with custom comparator)
- "The macro strategist is exactly two percentage points from the quant strategist." (exact_distance with unit)

## Your task

Generate themed categories for: "${theme}"
- ${categories} categories with ${size} values each
- Exactly one person category with noun: ""
- All values must be globally unique across all categories
- Values should be single words or short phrases (max ~3 words)
- Verb pairs must read naturally in sentences like "{person} {positive verb} {value}"
- Pick a thematic position noun and preposition
- If the theme has a natural ordering axis, consider using a position category (isPosition: true) with numericValues and orderingPhrases`;

  if (constraints && constraints.length > 0) {
    prompt += `\n- Additional constraints: ${constraints.join(", ")}`;
  }

  if (previousErrors && previousErrors.length > 0) {
    prompt += `\n\n## Previous attempt had errors — please fix:\n${previousErrors.map((e) => `- ${e}`).join("\n")}`;
  }

  return prompt;
}

/**
 * Generate themed categories for a logic grid puzzle using AI.
 *
 * Calls the AI client to produce categories, position noun, and preposition
 * that fit the given theme. Validates the result and retries up to 3 times
 * if the AI output fails validation, feeding errors back into the prompt.
 *
 * @throws {RangeError} If size or categories is outside 3-8.
 * @throws {Error} If generation fails after all retry attempts.
 */
export async function generateTheme(
  options: ThemeOptions,
): Promise<ThemeResult> {
  const { size, categories } = options;

  if (size < 3 || size > 8) {
    throw new RangeError(`size must be 3–8, got ${size}`);
  }
  if (categories < 3 || categories > 8) {
    throw new RangeError(`categories must be 3–8, got ${categories}`);
  }

  const client: AIClient = options.client ?? createAnthropicClient();
  const schema = buildSchema(size, categories);

  let lastErrors: string[] | undefined;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const prompt = buildPrompt(options, lastErrors);
    const result = await client.completeJSON<ThemeResult>(prompt, schema);

    // Normalize: treat undefined noun as "" (person category)
    for (const cat of result.categories) {
      if (cat.noun === undefined) {
        cat.noun = "";
      }
    }

    const errors = validateThemeResult(result, size, categories);
    if (errors.length === 0) {
      return result;
    }

    lastErrors = errors;
  }

  throw new Error(
    `Theme generation failed after ${MAX_RETRIES} attempts. Last errors:\n${lastErrors!.join("\n")}`,
  );
}
