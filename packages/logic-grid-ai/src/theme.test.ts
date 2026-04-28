import { describe, it, expect, vi } from "vitest";
import { generate } from "logic-grid";
import { generateTheme, ThemeGenerationError } from "./theme";
import type { AIClient, ThemeResult } from "./types";
import * as clientModule from "./client";

function mockClient(result: ThemeResult): AIClient {
  return {
    completeJSON: <T>() => Promise.resolve(result as T),
  };
}

const VALID_THEME: ThemeResult = {
  categories: [
    {
      name: "Pirate",
      values: ["Blackbeard", "Anne Bonny", "Calico Jack", "Mary Read"],
      noun: "",
    },
    {
      name: "Ship",
      values: ["Galleon", "Brigantine", "Sloop", "Frigate"],
      noun: "captain",
      verb: ["sails the", "does not sail the"],
      ordered: true,
      orderingPhrases: {
        comparators: {
          before: ["sails before", "sails after"],
          left_of: ["sails right before", "sails right after"],
          next_to: "sails right next to",
          not_next_to: "does not sail right next to",
          between: "sails between",
          not_between: "does not sail between",
          exact_distance: "sails exactly",
        },
      },
    },
    {
      name: "Treasure",
      values: ["Gold", "Jewels", "Maps", "Rum"],
      noun: "seeker",
      verb: ["seeks", "does not seek"],
    },
    {
      name: "Weapon",
      values: ["Cutlass", "Pistol", "Cannon", "Dagger"],
      noun: "wielder",
      verb: ["wields the", "does not wield the"],
    },
  ],
};

describe("generateTheme", () => {
  it("returns valid categories from a mock client", async () => {
    const result = await generateTheme({
      theme: "pirate adventure",
      size: 4,
      categories: 4,
      client: mockClient(VALID_THEME),
    });

    expect(result.categories).toHaveLength(4);
    expect(result.categories[0].noun).toBe("");
  });

  it("uses default Anthropic client when none provided", async () => {
    const spy = vi
      .spyOn(clientModule, "createAnthropicClient")
      .mockReturnValue(mockClient(VALID_THEME));

    const result = await generateTheme({
      theme: "pirate adventure",
      size: 4,
      categories: 4,
    });

    expect(spy).toHaveBeenCalledOnce();
    expect(result.categories).toHaveLength(4);
    spy.mockRestore();
  });

  it("passes constraints to the AI prompt", async () => {
    let capturedPrompt = "";
    const client: AIClient = {
      completeJSON: <T>(prompt: string) => {
        capturedPrompt = prompt;
        return Promise.resolve(VALID_THEME as T);
      },
    };

    await generateTheme({
      theme: "pirate adventure",
      size: 4,
      categories: 4,
      constraints: ["kid-friendly", "educational"],
      client,
    });

    expect(capturedPrompt).toContain("kid-friendly, educational");
  });

  it("retries on validation failure", async () => {
    let callCount = 0;
    const badResult: ThemeResult = {
      ...VALID_THEME,
      categories: [
        ...VALID_THEME.categories.slice(0, 3),
        {
          name: "Weapon",
          values: ["Cutlass", "Pistol", "Cannon"], // wrong count!
          noun: "wielder",
        },
      ],
    };

    const client: AIClient = {
      completeJSON: <T>() => {
        callCount++;
        if (callCount < 3) return Promise.resolve(badResult as T);
        return Promise.resolve(VALID_THEME as T);
      },
    };

    const result = await generateTheme({
      theme: "pirate adventure",
      size: 4,
      categories: 4,
      client,
    });

    expect(callCount).toBe(3);
    expect(result.categories).toHaveLength(4);
  });

  it("throws ThemeGenerationError with structured errors after max retries", async () => {
    // No ordered category → validation fails with code "no_ordered_category"
    const badResult: ThemeResult = {
      categories: VALID_THEME.categories.map((c) => ({
        name: c.name,
        values: c.values,
        noun: c.noun,
        verb: c.verb,
      })),
    };

    let caught: unknown;
    try {
      await generateTheme({
        theme: "pirate adventure",
        size: 4,
        categories: 4,
        client: mockClient(badResult),
      });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(ThemeGenerationError);
    const err = caught as ThemeGenerationError;
    expect(err.message).toContain("Theme generation failed after 3 attempts");
    expect(err.errors.some((e) => e.code === "no_ordered_category")).toBe(true);
  });

  it("throws on invalid size", async () => {
    await expect(
      generateTheme({
        theme: "test",
        size: 2,
        categories: 3,
        client: mockClient(VALID_THEME),
      }),
    ).rejects.toThrow("size must be 3–8");
  });

  it("throws on invalid category count", async () => {
    await expect(
      generateTheme({
        theme: "test",
        size: 3,
        categories: 9,
        client: mockClient(VALID_THEME),
      }),
    ).rejects.toThrow("categories must be 3–8");
  });

  it("normalizes undefined noun to empty string", async () => {
    const noNounResult: ThemeResult = {
      ...VALID_THEME,
      categories: VALID_THEME.categories.map((c, i) => ({
        ...c,
        noun: i === 0 ? undefined : c.noun,
      })),
    };

    const result = await generateTheme({
      theme: "pirate adventure",
      size: 4,
      categories: 4,
      client: mockClient(noNounResult),
    });

    expect(result.categories[0].noun).toBe("");
  });

  it("result integrates with generate()", async () => {
    const theme = await generateTheme({
      theme: "pirate adventure",
      size: 4,
      categories: 4,
      client: mockClient(VALID_THEME),
    });

    const puzzle = generate({
      categoryNames: theme.categories,
      size: 4,
      seed: 0,
    });

    expect(puzzle.grid.size).toBe(4);
    expect(puzzle.grid.categories).toHaveLength(4);
    expect(puzzle.clues.length).toBeGreaterThan(0);
    expect(puzzle.solution).toBeDefined();

    // Verify clues render with the Ship category's verb/comparators
    const sailClue = puzzle.clues.find((c) => c.text.includes("sail"));
    expect(sailClue).toBeDefined();
  });
});
