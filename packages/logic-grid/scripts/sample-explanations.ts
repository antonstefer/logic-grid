/**
 * Dump clue + deduction explanations across a few representative presets.
 * Useful for eyeballing explanation wording after changes to the deducer.
 *
 * Usage:
 *   npm run -w packages/logic-grid sample
 *
 * Covers: multi-axis (2 ordered), single ordered (Time), default House grid.
 */
import type { Category, GenerateOptions } from "../src";
import { deduce, generate } from "../src";

const hedgeFundMulti: Category[] = [
  { name: "Manager", values: ["Nadine", "Sal", "Terry", "Walter"], noun: "" },
  {
    name: "Year",
    values: ["1972", "1983", "1997", "2005"],
    noun: "fund",
    verb: ["started in", "did not start in"],
    subjectPriority: -1,
    ordered: true,
    numericValues: [1972, 1983, 1997, 2005],
    orderingPhrases: {
      unit: ["year", "years"],
      comparators: {
        before: ["started earlier than", "started later than"],
        left_of: ["started right before", "started right after"],
        next_to: "started right before or after",
        not_next_to: "did not start right before or after",
        between: "started between",
        not_between: "did not start between",
        exact_distance: "started exactly",
      },
    },
  },
  {
    name: "Return",
    values: ["6%", "7%", "8%", "9%"],
    noun: "fund",
    verb: ["has a return of", "does not have a return of"],
    subjectPriority: -1,
    ordered: true,
    orderingPhrases: {
      unit: ["percentage point", "percentage points"],
      comparators: {
        before: ["has a lower return than", "has a higher return than"],
        left_of: [
          "has the next lower return than",
          "has the next higher return than",
        ],
        next_to: "has the return right above or below",
        not_next_to: "does not have the return right above or below",
        between: "has a return between",
        not_between: "does not have a return between",
        exact_distance: "is exactly",
      },
    },
  },
  {
    name: "Fund",
    values: ["Black River", "Citizen Trust", "Pine Bay", "Silver Rock"],
    noun: "fund",
    verb: ["runs the", "does not run the"],
    valueSuffix: "fund",
  },
];

const hedgeFundSingle: Category[] = [
  { name: "Manager", values: ["Alice", "Bob", "Carol", "Dan"], noun: "" },
  {
    name: "YTD Return",
    values: ["3%", "5%", "8%", "12%"],
    noun: "fund",
    verb: ["has a return of", "does not have a return of"],
    subjectPriority: -1,
    ordered: true,
    numericValues: [3, 5, 8, 12],
    orderingPhrases: {
      unit: ["percentage point", "percentage points"],
      comparators: {
        before: ["has a lower return than", "has a higher return than"],
        left_of: [
          "has the next lower return than",
          "has the next higher return than",
        ],
        next_to: "has the return right above or below",
        not_next_to: "does not have the return right above or below",
        between: "has a return somewhere between",
        not_between: "does not have a return between",
        exact_distance: "is exactly",
      },
    },
  },
  {
    name: "Strategy",
    values: ["Long/Short", "Macro", "Quant", "Event-Driven"],
    noun: "strategist",
    subjectPriority: 1,
    lowercase: true,
    verb: ["uses the", "does not use the"],
    valueSuffix: "strategy",
  },
  {
    name: "City",
    values: ["New York", "London", "Tokyo", "Zurich"],
    noun: "office",
    subjectPriority: 1,
    verb: ["is based in", "is not based in"],
  },
];

const morningSchedule: Category[] = [
  { name: "Person", values: ["Emma", "Liam", "Noah", "Olivia"], noun: "" },
  {
    name: "Time",
    values: ["7am", "8am", "9am", "10am"],
    noun: "slot",
    verb: ["has an appointment at", "does not have an appointment at"],
    subjectPriority: -1,
    ordered: true,
    numericValues: [7, 8, 9, 10],
    orderingPhrases: {
      unit: ["hour", "hours"],
      comparators: {
        before: [
          "has an earlier appointment than",
          "has a later appointment than",
        ],
        left_of: [
          "has the appointment right before",
          "has the appointment right after",
        ],
        next_to: "has an appointment right before or after",
        not_next_to: "does not have an appointment right before or after",
        between: "has an appointment somewhere between",
        not_between: "does not have an appointment between",
        exact_distance: "has an appointment exactly",
      },
    },
  },
  {
    name: "Activity",
    values: ["Dentist", "Barber", "Therapist", "Optician"],
    noun: "attendee",
    verb: ["visits the", "does not visit the"],
  },
  {
    name: "Transport",
    values: ["Bus", "Bike", "Car", "Walk"],
    noun: "commuter",
    verb: ["takes the", "does not take the"],
  },
];

function dumpPuzzle(label: string, options: GenerateOptions): void {
  console.log("\n=================================================");
  console.log(label);
  console.log("=================================================");
  const puzzle = generate(options);
  console.log("\n--- CLUES ---");
  for (let i = 0; i < puzzle.clues.length; i++) {
    console.log(`Clue ${i + 1}: ${puzzle.clues[i].text}`);
  }
  const result = deduce(puzzle.constraints, puzzle.grid);
  console.log("\n--- DEDUCTION STEPS ---");
  for (const s of result.steps) {
    console.log(`[${s.technique}] ${s.explanation}`);
  }
  console.log(`\nComplete: ${result.complete}. Steps: ${result.steps.length}`);
}

dumpPuzzle("Hedge Fund Single-Axis (Return pinned) size=4 seed=7 medium", {
  size: 4,
  categoryNames: hedgeFundSingle,
  seed: 7,
  difficulty: "medium",
});
dumpPuzzle("Hedge Funds Multi-Axis size=4 seed=7 easy", {
  size: 4,
  categoryNames: hedgeFundMulti,
  seed: 7,
  difficulty: "easy",
});
dumpPuzzle("Hedge Funds Multi-Axis size=4 seed=12 medium", {
  size: 4,
  categoryNames: hedgeFundMulti,
  seed: 12,
  difficulty: "medium",
});
dumpPuzzle("Hedge Funds Multi-Axis size=4 seed=3 hard", {
  size: 4,
  categoryNames: hedgeFundMulti,
  seed: 3,
  difficulty: "hard",
});
dumpPuzzle("Morning Schedule size=4 seed=5 medium", {
  size: 4,
  categoryNames: morningSchedule,
  seed: 5,
  difficulty: "medium",
});
dumpPuzzle("Default (House) size=4 seed=15 medium", {
  size: 4,
  seed: 15,
  difficulty: "medium",
});
