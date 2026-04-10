import { describe, it, expect } from "vitest";
import {
  orderedCategories,
  resolveAxis,
  axisRank,
  displayAxisCategory,
  validateConstraints,
} from "./axis";
import { makeGrid, TEST_COMPARATORS } from "./test-helpers";

const grid = makeGrid({
  size: 3,
  categories: [
    { name: "Name", values: ["Alice", "Bob", "Carol"], noun: "" },
    {
      name: "Year",
      values: ["2020", "2021", "2022"],
      noun: "fund",
      verb: ["started in", "did not start in"],
      ordered: true,
      orderingPhrases: { comparators: TEST_COMPARATORS },
    },
    {
      name: "Return",
      values: ["5%", "6%", "7%"],
      noun: "fund",
      verb: ["has a return of", "does not have a return of"],
      ordered: true,
      orderingPhrases: { comparators: TEST_COMPARATORS },
    },
  ],
});

describe("orderedCategories", () => {
  it("returns only ordered categories", () => {
    const ordered = orderedCategories(grid);
    expect(ordered.map((c) => c.name)).toEqual(["Year", "Return"]);
  });
});

describe("resolveAxis", () => {
  it("returns the named ordered category", () => {
    expect(resolveAxis(grid, "Year").name).toBe("Year");
    expect(resolveAxis(grid, "Return").name).toBe("Return");
  });

  it("throws for unknown category name", () => {
    expect(() => resolveAxis(grid, "Nope")).toThrow("Unknown axis");
  });

  it("throws for non-ordered category", () => {
    expect(() => resolveAxis(grid, "Name")).toThrow(
      "must reference an ordered category",
    );
  });
});

describe("axisRank", () => {
  it("returns the index of the value in the ordered category", () => {
    const year = resolveAxis(grid, "Year");
    expect(axisRank(year, "2020")).toBe(0);
    expect(axisRank(year, "2022")).toBe(2);
  });

  it("throws for non-ordered category", () => {
    const name = grid.categories.find((c) => c.name === "Name")!;
    expect(() => axisRank(name, "Alice")).toThrow("is not ordered");
  });

  it("throws for value not in the category", () => {
    const year = resolveAxis(grid, "Year");
    expect(() => axisRank(year, "Alice")).toThrow("is not a member");
  });
});

describe("displayAxisCategory", () => {
  it("returns first ordered category by default", () => {
    expect(displayAxisCategory(grid).name).toBe("Year");
  });

  it("respects grid.displayAxis when set", () => {
    const g = { ...grid, displayAxis: "Return" };
    expect(displayAxisCategory(g).name).toBe("Return");
  });

  it("throws when no ordered category exists", () => {
    const noOrdered = makeGrid({
      size: 3,
      categories: [
        { name: "Name", values: ["Alice", "Bob", "Carol"], noun: "" },
      ],
    });
    // makeGrid auto-adds House, so strip it for this test
    const bare = {
      ...noOrdered,
      categories: noOrdered.categories.filter((c) => c.ordered !== true),
    };
    expect(() => displayAxisCategory(bare)).toThrow(
      "no ordered category to use as display axis",
    );
  });
});

describe("validateConstraints", () => {
  it("passes for valid constraints", () => {
    expect(() =>
      validateConstraints(
        [{ type: "before", a: "Alice", b: "Bob", axis: "Year" }],
        grid,
      ),
    ).not.toThrow();
  });

  it("throws for constraint referencing unknown axis", () => {
    expect(() =>
      validateConstraints(
        [{ type: "before", a: "Alice", b: "Bob", axis: "Nope" }],
        grid,
      ),
    ).toThrow("Unknown axis");
  });

  it("throws for constraint referencing non-ordered axis", () => {
    expect(() =>
      validateConstraints(
        [{ type: "next_to", a: "Alice", b: "Bob", axis: "Name" }],
        grid,
      ),
    ).toThrow("must reference an ordered category");
  });

  it("ignores non-axis constraints", () => {
    expect(() =>
      validateConstraints(
        [{ type: "same_position", a: "Alice", b: "Bob" }],
        grid,
      ),
    ).not.toThrow();
  });
});
