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

describe("describeResult", () => {
  it("describes assignments", () => {
    const result = describeResult(grid, [{ value: "Alice", position: 0 }], []);
    expect(result).toBe("Alice lives in the first house");
  });

  it("describes eliminations", () => {
    const result = describeResult(grid, [], [{ value: "Bob", position: 1 }]);
    expect(result).toBe("Bob does not live in the second house");
  });

  it("combines assignments and eliminations", () => {
    const result = describeResult(
      grid,
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
    // The pluralizer only special-cases consonant+y ([^aeiou]y$). "day" has
    // "ay" (vowel+y) so it doesn't match and falls through to `word + "s"`.
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
