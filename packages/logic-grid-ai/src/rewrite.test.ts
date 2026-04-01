import { describe, it, expect, vi } from "vitest";
import { rewriteClues } from "./rewrite";
import type { AIClient, RewriteCluesResult } from "./types";
import type { Clue } from "logic-grid";
import * as clientModule from "./client";

const SAMPLE_CLUES: Clue[] = [
  {
    constraint: { type: "same_house", a: "Alice", b: "Coffee" },
    text: "Alice drinks coffee.",
  },
  {
    constraint: { type: "next_to", a: "Cat", b: "Red" },
    text: "The cat lives next to the red house.",
  },
  {
    constraint: { type: "at_position", value: "Bob", position: 0 },
    text: "Bob lives in the first house.",
  },
];

const VALID_RESULT: RewriteCluesResult = {
  clues: [
    "It is Alice who savors a warm cup of coffee.",
    "Right beside the red house, the cat resides.",
    "Bob has made the first house his home.",
  ],
};

function mockClient(result: RewriteCluesResult): AIClient {
  return {
    completeJSON: <T>() => Promise.resolve(result as T),
  };
}

describe("rewriteClues", () => {
  it("returns rewritten clues from a mock client", async () => {
    const result = await rewriteClues({
      clues: SAMPLE_CLUES,
      client: mockClient(VALID_RESULT),
    });

    expect(result).toHaveLength(3);
    expect(result[0].text).toBe(VALID_RESULT.clues[0]);
    expect(result[1].text).toBe(VALID_RESULT.clues[1]);
    expect(result[2].text).toBe(VALID_RESULT.clues[2]);
  });

  it("preserves original constraints in returned clues", async () => {
    const result = await rewriteClues({
      clues: SAMPLE_CLUES,
      client: mockClient(VALID_RESULT),
    });

    for (let i = 0; i < SAMPLE_CLUES.length; i++) {
      expect(result[i].constraint).toBe(SAMPLE_CLUES[i].constraint);
    }
  });

  it("uses default Anthropic client when none provided", async () => {
    const spy = vi
      .spyOn(clientModule, "createAnthropicClient")
      .mockReturnValue(mockClient(VALID_RESULT));

    const result = await rewriteClues({ clues: SAMPLE_CLUES });

    expect(spy).toHaveBeenCalledOnce();
    expect(result).toHaveLength(3);
    spy.mockRestore();
  });

  it("includes style in the AI prompt", async () => {
    let capturedPrompt = "";
    const client: AIClient = {
      completeJSON: <T>(prompt: string) => {
        capturedPrompt = prompt;
        return Promise.resolve(VALID_RESULT as T);
      },
    };

    await rewriteClues({
      clues: SAMPLE_CLUES,
      style: "pirate storytelling",
      client,
    });

    expect(capturedPrompt).toContain("pirate storytelling");
  });

  it("includes constraint JSON in the AI prompt", async () => {
    let capturedPrompt = "";
    const client: AIClient = {
      completeJSON: <T>(prompt: string) => {
        capturedPrompt = prompt;
        return Promise.resolve(VALID_RESULT as T);
      },
    };

    await rewriteClues({ clues: SAMPLE_CLUES, client });

    expect(capturedPrompt).toContain('"type":"same_house"');
    expect(capturedPrompt).toContain('"type":"next_to"');
    expect(capturedPrompt).toContain('"type":"at_position"');
  });

  it("retries on validation failure", async () => {
    let callCount = 0;
    const badResult: RewriteCluesResult = {
      clues: ["Good clue one.", ""], // empty second clue
    };

    const client: AIClient = {
      completeJSON: <T>() => {
        callCount++;
        if (callCount < 3) return Promise.resolve(badResult as T);
        return Promise.resolve(VALID_RESULT as T);
      },
    };

    const result = await rewriteClues({ clues: SAMPLE_CLUES, client });

    expect(callCount).toBe(3);
    expect(result[0].text).toBe(VALID_RESULT.clues[0]);
  });

  it("returns original clues after max retries", async () => {
    const badResult: RewriteCluesResult = {
      clues: ["Only one clue."],
    };

    const result = await rewriteClues({
      clues: SAMPLE_CLUES,
      client: mockClient(badResult),
    });

    expect(result).toBe(SAMPLE_CLUES);
  });

  it("returns original clues on client error", async () => {
    const client: AIClient = {
      completeJSON: () => Promise.reject(new Error("Network error")),
    };

    const result = await rewriteClues({ clues: SAMPLE_CLUES, client });

    expect(result).toBe(SAMPLE_CLUES);
  });

  it("returns empty array for empty clues input", async () => {
    let called = false;
    const client: AIClient = {
      completeJSON: <T>() => {
        called = true;
        return Promise.resolve(VALID_RESULT as T);
      },
    };

    const result = await rewriteClues({ clues: [], client });

    expect(result).toEqual([]);
    expect(called).toBe(false);
  });

  it("feeds validation errors back into retry prompt", async () => {
    const prompts: string[] = [];
    let callCount = 0;
    const badResult: RewriteCluesResult = {
      clues: ["Clue one.", ""], // empty second clue triggers error
    };

    const client: AIClient = {
      completeJSON: <T>(prompt: string) => {
        prompts.push(prompt);
        callCount++;
        if (callCount < 3) return Promise.resolve(badResult as T);
        return Promise.resolve(VALID_RESULT as T);
      },
    };

    await rewriteClues({ clues: SAMPLE_CLUES, client });

    // Second prompt should contain error feedback from first attempt
    expect(prompts[1]).toContain("Previous attempt had errors");
    expect(prompts[1]).toContain("Clue 2 is empty");
  });
});
