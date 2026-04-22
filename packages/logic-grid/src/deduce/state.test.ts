import { describe, it, expect } from "vitest";
import { describeResult, describeKnown, createState } from "./state";
import { makeGrid } from "../test-helpers";

const grid = makeGrid({
  size: 3,
  categories: [
    { name: "Name", values: ["Alice", "Bob", "Carol"] },
    { name: "Color", values: ["Red", "Blue", "Green"] },
  ],
});

const terms = createState(grid).terms;

describe("describeResult", () => {
  it("describes assignments", () => {
    const result = describeResult(
      grid,
      terms,
      [{ value: "Alice", position: 0 }],
      [],
    );
    expect(result).toBe("Alice lives in the first house");
  });

  it("describes eliminations", () => {
    const result = describeResult(
      grid,
      terms,
      [],
      [{ value: "Bob", position: 1 }],
    );
    expect(result).toBe("Bob does not live in the second house");
  });

  it("combines assignments and eliminations", () => {
    const result = describeResult(
      grid,
      terms,
      [{ value: "Alice", position: 0 }],
      [{ value: "Bob", position: 2 }],
    );
    expect(result).toBe(
      "Alice lives in the first house; Bob does not live in the third house",
    );
  });
});

describe("createState invariant", () => {
  it("throws when grid has no ordered category", () => {
    const bare = {
      size: 3,
      categories: [
        { name: "A", values: ["a1", "a2", "a3"] },
        { name: "B", values: ["b1", "b2", "b3"] },
      ],
    };
    expect(() => createState(bare)).toThrow("no ordered category");
  });
});

describe("axisTerms fallback", () => {
  it("uses 'position' when ordered category has no noun", () => {
    const noNounGrid = {
      size: 2,
      categories: [
        {
          name: "Idx",
          values: ["A", "B"],
          ordered: true as const,
          verb: ["is", "is not"] as [string, string],
          orderingPhrases: {
            comparators: {
              before: ["is before", "is after"] as [string, string],
              left_of: ["is left of", "is right of"] as [string, string],
              next_to: "is next to",
              not_next_to: "is not next to",
              between: "is between",
              not_between: "is not between",
              exact_distance: "is exactly",
            },
          },
        },
        { name: "X", values: ["x1", "x2"] },
      ],
    };
    const state = createState(noNounGrid);
    expect(state.terms.noun).toBe("position");
    expect(state.terms.posLabel(0)).toBe("A");
  });
});

describe("axisNames pluralizer", () => {
  it("pluralizes consonant+y as ies (bounty → bounties)", () => {
    const bountyGrid = {
      size: 2,
      categories: [
        {
          name: "Bounty",
          values: ["500", "1000"],
          noun: "fugitive",
          ordered: true as const,
          verb: ["has a bounty of", "does not have a bounty of"] as [
            string,
            string,
          ],
          orderingPhrases: {
            comparators: {
              before: ["is before", "is after"] as [string, string],
              left_of: ["is left of", "is right of"] as [string, string],
              next_to: "is next to",
              not_next_to: "is not next to",
              between: "is between",
              not_between: "is not between",
              exact_distance: "is exactly",
            },
          },
        },
        { name: "Pirate", values: ["Anne", "Blackbeard"] },
      ],
    };
    const state = createState(bountyGrid);
    expect(state.terms.axisName).toBe("bounty");
    expect(state.terms.axisNames).toBe("bounties");
  });

  it("pluralizes vowel+y as ys (day → days)", () => {
    const dayGrid = {
      size: 2,
      categories: [
        {
          name: "Day",
          values: ["Mon", "Tue"],
          noun: "slot",
          ordered: true as const,
          verb: ["meets on", "does not meet on"] as [string, string],
          orderingPhrases: {
            comparators: {
              before: ["is before", "is after"] as [string, string],
              left_of: ["is left of", "is right of"] as [string, string],
              next_to: "is next to",
              not_next_to: "is not next to",
              between: "is between",
              not_between: "is not between",
              exact_distance: "is exactly",
            },
          },
        },
        { name: "Person", values: ["A", "B"] },
      ],
    };
    // "day" ends in vowel+y, should become "days" (naive pluralizer keeps -y + s)
    // But our rule says "vowel+y → y+s". Let me check: /[^aeiou]y$/ tests
    // consonant+y. "day" has "ay" (a is vowel) so doesn't match → falls to
    // "word + s" = "days".
    const state = createState(dayGrid);
    expect(state.terms.axisName).toBe("day");
    expect(state.terms.axisNames).toBe("days");
  });
});

describe("describeKnown", () => {
  // makeGrid auto-prepends a House category; Name is now categories[1].
  it("describes assigned value", () => {
    const state = createState(grid);
    state.possible[1][0].clear();
    state.possible[1][0].add(0);
    expect(describeKnown(state, "Alice")).toBe(
      "Alice lives in the first house",
    );
  });

  it("describes possible positions", () => {
    const state = createState(grid);
    state.possible[1][1].clear();
    state.possible[1][1].add(0);
    state.possible[1][1].add(2);
    expect(describeKnown(state, "Bob")).toBe(
      "Bob lives in the first or third house",
    );
  });
});
