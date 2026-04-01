import { describe, it, expect, vi } from "vitest";
import { generate } from "logic-grid";
import { generateTheme } from "./theme";
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
  positionNoun: ["spot", "spots"],
  positionPreposition: "at",
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
    expect(result.positionNoun).toEqual(["spot", "spots"]);
    expect(result.positionPreposition).toBe("at");
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

  it("throws after max retries", async () => {
    const badResult: ThemeResult = {
      ...VALID_THEME,
      positionPreposition: "",
    };

    await expect(
      generateTheme({
        theme: "pirate adventure",
        size: 4,
        categories: 4,
        client: mockClient(badResult),
      }),
    ).rejects.toThrow("Theme generation failed after 3 attempts");
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
      positionNoun: theme.positionNoun,
      positionPreposition: theme.positionPreposition,
      size: 4,
      seed: 0,
    });

    expect(puzzle.grid.size).toBe(4);
    expect(puzzle.grid.categories).toHaveLength(4);
    expect(puzzle.grid.positionNoun).toEqual(["spot", "spots"]);
    expect(puzzle.grid.positionPreposition).toBe("at");
    expect(puzzle.clues.length).toBeGreaterThan(0);
    expect(puzzle.solution).toBeDefined();

    // Verify clues use the custom position noun
    const positionalClue = puzzle.clues.find((c) => c.text.includes("spot"));
    expect(positionalClue).toBeDefined();
  });
});
