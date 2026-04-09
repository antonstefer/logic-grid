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
          'Optional [positive, negative] verb phrases for same-position clues. The verb is used when this category appears as the OBJECT: "{subject} {verb} {value}". Include "the" if needed: ["owns the", "does not own the"] → "Alice owns the cat". Use ["sails", "does not sail"] when the value already reads naturally without an article.',
      },
      subjectPriority: {
        type: "number",
        description:
          'Priority for sentence subject selection in same-position clues. Higher = more likely to be the subject. Use 2 for the person category, 1 for animate categories that act on things (drinker, player, owner), 0 for neutral categories, -1 for inanimate "describer" categories like Color whose values describe the position noun. Default: 0.',
      },
      valueSuffix: {
        type: "string",
        description:
          'Optional noun appended to the value when it appears as an object. E.g. valueSuffix "strategy" makes "event-driven" render as "event-driven strategy" → "Alice uses the event-driven strategy". Use this when the value alone is an adjective or short label that needs a clarifying noun. Required for categories whose values describe the position noun (e.g. Color: valueSuffix "house" → "red house").',
      },
      positionAdjective: {
        type: "array",
        items: { type: "string" },
        minItems: 2,
        maxItems: 2,
        description:
          'Optional [positive, negative] verb pair for at_position inversion. Set this ONLY when the category\'s values are adjectives that describe the position noun directly (e.g. Color "Red" describes "house"). Inverts at_position to "{posLabel} {verb} {value}" → "The first house is red." Use ["is", "is not"] in most cases. Always pair with valueSuffix and subjectPriority -1.',
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
              'Custom phrases for ordering constraints. Keys: "left_of", "before", "next_to", "not_next_to", "between", "not_between", "exact_distance". E.g. { "before": "has a lower return than" }. Only set on the position category — these phrases describe the positional axis and apply to all ordering clues in the puzzle.',
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

## How clues are rendered

The puzzle has ${size} positions. Clues are generated mechanically from categories using these fields per category:

**\`noun\`** — labels the value: "the cat owner", "the red house". Empty string "" means bare value ("Alice"). There must be exactly one person category with noun: "".

**\`verb\`** — \`[positive, negative]\` verb pair used when this category appears as the OBJECT in a same-position clue: \`{subject} {verb} {value}\`. MUST read grammatically when concatenated with the lowercased value.
- Pet (noun: "owner", verb: ["owns the", "does not own the"]) → "Alice owns the cat." ✓
- Drink (noun: "drinker", verb: ["drinks", "does not drink"]) → "Alice drinks tea." ✓ (mass noun, no article)
- Treasure with values like "Cursed Idol", "Gold Bar" → verb MUST include "the": ["plunders the", "does not plunder the"] → "Alice plunders the cursed idol." ✓
- Wrong: ["plunders", "does not plunder"] + value "Cursed Idol" → "Alice plunders cursed idol." ✗ (missing article)
- Rule: if the value is a count noun (you'd say "a/the X"), the verb must include "the". Bare verbs only work with mass nouns ("tea", "water"), plural count nouns ("gold coins", "pearls"), or proper nouns ("Madagascar").
- CRITICAL: all values in a category must be grammatically the same shape so one verb works for all. Don't mix singular count nouns ("Cursed Idol") with plural/mass nouns ("Gold Coins") in the same category — pick verb + values that all read consistently.

**\`subjectPriority\`** — controls which value becomes the sentence subject when two categories meet. Higher = more likely subject.
- 2: person category (always subject when present)
- 1: animate categories that DO things (drinker, owner, attendee, player, fan, lover, ...)
- 0: neutral categories (default)
- -1: inanimate "describer" categories whose values describe the position noun (Color → house)

**\`valueSuffix\`** — appends a clarifying noun after the value when it appears as an object. Use this when the value alone is an adjective or short label that needs a noun.
- Strategy (valueSuffix: "strategy", verb: ["uses the", "does not use the"]) → "Alice uses the event-driven strategy."
- Color (valueSuffix: "house") → "Alice lives in the red house."

**\`positionAdjective\`** — set ONLY when the position noun is naturally modified by an adjective category, like a HOUSE has a color ("the red house"). DO NOT use this for position nouns like "dock", "ship", "fund", "station", "slot", "year" — these aren't naturally characterized by an adjective from another category. Provides a [positive, negative] verb pair (usually ["is", "is not"]) for at_position inversion: "The first house is red." MUST be paired with valueSuffix and subjectPriority -1. Use sparingly — when in doubt, don't.

## Position noun

The position noun labels ordered slots. Default ["house", "houses"] with preposition "in" → "lives in the first house". Pick a thematic alternative: ["station", "stations"] preposition "at", ["dock", "docks"] preposition "at", etc.

## Position categories (optional, advanced)

Mark ONE category isPosition: true to define the positional axis. Its values ARE the positions (sorted). Use this when the theme has a natural numeric ordering (returns, times, years, prices). The position category should also have:
- noun, verb (used for at_position rendering)
- subjectPriority: -1 (always object)
- numericValues: strictly ascending numbers matching the values
- orderingPhrases.unit: [singular, plural] for distance clues
- orderingPhrases.comparators: full-phrase overrides describing the positional ordering. **You MUST set ALL of these keys**: \`before\`, \`left_of\`, \`next_to\`, \`not_next_to\`, \`between\`, \`not_between\`, \`exact_distance\`. They apply to ALL ordering clues in the puzzle (Manager↔Strategy, City↔Strategy, etc.), not just clues involving position values. Missing keys fall through to generic "is somewhere before / adjacent to / directly before" wording, which sounds wrong in a domain like returns.
- For \`left_of\`: this means "immediately preceding in the ordering". Phrase it without assuming equidistant gaps (avoid "exactly one X less than" unless your numericValues actually are equidistant).
- For \`exact_distance\`: this is the verb prefix that goes BEFORE the distance number. E.g. \`"is exactly"\` produces "Alice is exactly 3 percentage points from Bob." Use \`"has a return exactly"\` if you want "Alice has a return exactly 3 percentage points from Bob."

## Examples

### Classic puzzle with a position-adjective category (Color)
For a "pirate adventure" theme with size 4 and 4 categories:
{
  "categories": [
    { "name": "Pirate", "values": ["Anne", "Blackbeard", "Calico", "Drake"], "noun": "", "subjectPriority": 2 },
    { "name": "Ship Color", "values": ["Crimson", "Indigo", "Emerald", "Onyx"], "noun": "ship", "subjectPriority": -1, "verb": ["sails the", "does not sail the"], "valueSuffix": "ship", "positionAdjective": ["is", "is not"] },
    { "name": "Treasure", "values": ["Gold", "Pearls", "Rubies", "Maps"], "noun": "hoarder", "subjectPriority": 1, "verb": ["hoards", "does not hoard"] },
    { "name": "Hideout", "values": ["Tortuga", "Nassau", "Madagascar", "Cuba"], "noun": "captain", "subjectPriority": 1, "verb": ["hides in", "does not hide in"] }
  ],
  "positionNoun": ["dock", "docks"],
  "positionPreposition": "at"
}

Note: Hideout has plain values ("Tortuga"), no valueSuffix needed because "hides in Tortuga" reads naturally. If values were "tortuga bay" they'd need valueSuffix: "hideout" → "hides in the tortuga bay hideout."

### Position-category puzzle (numeric axis)
For a "hedge fund" theme:
{
  "categories": [
    { "name": "Manager", "values": ["Alice", "Bob", "Clara", "Dan"], "noun": "", "subjectPriority": 2 },
    { "name": "YTD Return", "values": ["3%", "5%", "8%", "12%"], "noun": "fund", "subjectPriority": -1, "verb": ["has a return of", "does not have a return of"], "isPosition": true, "numericValues": [3, 5, 8, 12], "orderingPhrases": { "unit": ["percentage point", "percentage points"], "comparators": { "before": "has a lower return than", "left_of": "has the next lower return after", "next_to": "has an adjacent return to", "not_next_to": "does not have an adjacent return to", "between": "has a return between", "not_between": "does not have a return between", "exact_distance": "has a return exactly" } } },
    { "name": "Strategy", "values": ["Long/Short", "Macro", "Quant", "Event-Driven"], "noun": "strategist", "subjectPriority": 1, "verb": ["uses the", "does not use the"], "valueSuffix": "strategy" },
    { "name": "City", "values": ["New York", "London", "Tokyo", "Zurich"], "noun": "office", "subjectPriority": 1, "verb": ["is based in", "is not based in"] }
  ],
  "positionNoun": ["fund", "funds"],
  "positionPreposition": "at"
}

## Decision guide

For each category, ask:
1. Is it the person? → noun: "", subjectPriority: 2
2. Are its values multi-word labels that describe the position noun (like "Crimson" describes "ship")? → set valueSuffix to the position noun, positionAdjective to ["is", "is not"], subjectPriority -1
3. Are its values short labels needing a clarifying noun (like "Event-Driven" → "event-driven strategy")? → set valueSuffix, subjectPriority 1
4. Does the value read naturally without a suffix in "{subject} {verb} {value}" form (like "Alice owns the cat", "Bob drinks tea", "Carol hides in tortuga")? → no valueSuffix needed, subjectPriority 1
5. Does the theme have a numeric ordering axis (returns, times, years)? → mark ONE category isPosition with numericValues and orderingPhrases

## Your task

Generate themed categories for: "${theme}"
- ${categories} categories with ${size} values each
- Exactly one person category with noun: "" and subjectPriority: 2
- All values must be globally unique across all categories
- Values should be single words or short phrases (max ~3 words)
- Set subjectPriority on EVERY category (2 person, 1 animate, 0 neutral, -1 describer)
- Set valueSuffix when values need a clarifying noun in object position
- Verb pairs MUST read naturally in "{subject} {positive verb} {value}{valueSuffix?}"
- Pick a thematic position noun and preposition`;

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
