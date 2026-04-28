# logic-grid

Generate and solve logic grid puzzles (zebra puzzles / Einstein's riddles). Zero dependencies. TypeScript-first. Runs in Node and the browser.

[![npm](https://img.shields.io/npm/v/logic-grid)](https://www.npmjs.com/package/logic-grid)
[![bundle size](https://img.shields.io/bundlephobia/minzip/logic-grid)](https://bundlephobia.com/package/logic-grid)
[![license](https://img.shields.io/npm/l/logic-grid)](../../LICENSE)

## Install

```bash
npm install logic-grid
```

## Quick Start

```typescript
import { generate, solve } from "logic-grid";

// Generate a puzzle
const puzzle = generate({ size: 4, categories: 4, difficulty: "medium" });

console.log(puzzle.clues.map((c) => c.text));
// ["Alice owns the dog.", "The fish owner lives in the red house.", ...]

// Solve it
const solution = solve(puzzle.constraints, puzzle.grid);
```

## API

### `generate(options?)`

Generate a puzzle with a unique solution and minimal constraint set.

```typescript
const puzzle = generate({
  size: 5, // 3-8 (default: 4)
  categories: 4, // 3-8 (default: 4)
  difficulty: "hard", // "easy" | "medium" | "hard" | "expert" (optional)
  seed: 42, // random seed for reproducibility (optional)
  displayAxis: "Year", // optional — name of an ordered category to use as the display anchor
});
```

Returns a `Puzzle`:

```typescript
interface Puzzle {
  grid: Grid;
  constraints: Constraint[];
  clues: Clue[]; // human-readable clue strings
  solution: Solution;
  difficulty: Difficulty;
}
```

Custom categories:

```typescript
import { generate, defaultHouseCategory } from "logic-grid";

const puzzle = generate({
  size: 3,
  categoryNames: [
    defaultHouseCategory(3), // ordered positional axis (required)
    {
      name: "Name",
      values: ["Alice", "Bob", "Carol"],
      verb: ["is", "is not"],
    },
    {
      name: "Vehicle",
      values: ["Toyota", "BMW", "Honda"],
      noun: "driver", // → "the Toyota driver"
      verb: ["drives the", "does not drive the"], // → "Alice drives the Toyota."
    },
    {
      name: "Pet",
      values: ["Cat", "Dog", "Fish"],
      noun: "owner",
      verb: ["owns the", "does not own the"],
    },
  ],
});
```

`categoryNames` must include at least one category with `ordered: true` so comparator constraints (`before`, `next_to`, `between`, …) can reference an axis. Use `defaultHouseCategory(size)` for a generic positional axis when the theme has no natural ordering, or mark a domain-relevant category as `ordered: true` (see below). The `noun` controls how values appear in clue phrases (`"owner"` → "the cat owner", `""` → bare value like "Alice"). The `verb` controls same-position phrasing as `[positive, negative]` and is required when the value participates in a same-position clue. Set `lowercase: true` for adjective-like categories where values should render in lowercase (e.g. Color → "the red house" rather than "the Red house"). The classic Einstein-style preset (Name, Color, Pet, Drink, Food, Hobby, Music, Sport) is exported as `DEFAULT_CATEGORIES` and used automatically when `categoryNames` is omitted.

### Ordered categories and multi-axis puzzles

Categories with `ordered: true` define a canonical ordering on their values. Comparative constraints (`before`, `left_of`, `next_to`, etc.) reference an ordered category by name via the `axis` field. A puzzle can have multiple ordered axes — e.g. both Year and Return:

```typescript
const puzzle = generate({
  size: 4,
  categoryNames: [
    {
      name: "Manager",
      values: ["Nadine", "Sal", "Terry", "Walter"],
      verb: ["is", "is not"],
    },
    {
      name: "Year",
      values: ["1972", "1983", "1997", "2005"],
      noun: "fund",
      verb: ["started in", "did not start in"],
      ordered: true,
      numericValues: [1972, 1983, 1997, 2005],
      orderingPhrases: {
        unit: ["year", "years"],
        comparators: {
          // All 7 are required on every ordered category.
          before: ["started earlier than", "started later than"],
          left_of: ["started right before", "started right after"],
          next_to: "started right next to",
          not_next_to: "did not start right next to",
          between: "started somewhere between",
          not_between: "did not start somewhere between",
          exact_distance: "started exactly",
        },
      },
    },
    {
      name: "Return",
      values: ["6%", "7%", "8%", "9%"],
      noun: "fund",
      verb: ["has a return of", "does not have a return of"],
      ordered: true,
      orderingPhrases: {
        unit: ["percentage point", "percentage points"],
        comparators: {
          before: ["has a lower return than", "has a higher return than"],
          left_of: ["scored right below", "scored right above"],
          next_to: "scored right next to",
          not_next_to: "did not score right next to",
          between: "scored somewhere between",
          not_between: "did not score somewhere between",
          exact_distance: "scored exactly",
        },
      },
    },
    {
      name: "Fund",
      values: ["Black River", "Citizen Trust", "Pine Bay", "Silver Rock"],
      noun: "fund",
      verb: ["runs", "does not run"],
      valueSuffix: "fund",
    },
  ],
});
```

Every ordered category requires all 7 entries in `orderingPhrases.comparators` (`before`, `left_of`, `next_to`, `not_next_to`, `between`, `not_between`, `exact_distance`). `numericValues` enables value-based distance for `exact_distance` ("exactly 25 years from"). When `categoryNames` is omitted, the built-in default pool prepends a House category automatically; when it's provided, you must include at least one ordered category yourself (use `defaultHouseCategory(size)` for a generic one). For AI-generated themed categories that satisfy this contract automatically, see [`logic-grid-ai`](../logic-grid-ai#readme).

### `solve(constraints, grid)`

Solve a puzzle. Returns the solution or `null` if unsatisfiable.

```typescript
const solution = solve(puzzle.constraints, puzzle.grid);
// Solution = Assignment[] (one per category)
// Assignment = Record<string, number> (value name → position)
```

### `hasUniqueSolution(constraints, grid)`

Check if a constraint set produces exactly one solution.

```typescript
hasUniqueSolution(puzzle.constraints, puzzle.grid); // true
```

### `classify(constraints, grid?)`

Classify puzzle difficulty based on constraint types and deduction depth.

```typescript
classify(puzzle.constraints, puzzle.grid); // "easy" | "medium" | "hard" | "expert"
```

### Constraint Factories

Build constraints programmatically:

```typescript
import {
  samePosition,
  notSamePosition,
  nextTo,
  notNextTo,
  leftOf,
  between,
  notBetween,
  before,
  exactDistance,
} from "logic-grid";

const constraints = [
  samePosition("Red", "Cat"), // Red and Cat are at the same position
  nextTo("Alice", "Bob", "House"), // Alice is adjacent to Bob on the House axis
  leftOf("Blue", "Green", "House"), // Blue is directly left of Green
  between("Alice", "Bob", "Carol", "House"), // Bob is between Alice and Carol
  before("Alice", "Bob", "Year"), // Alice's Year rank < Bob's Year rank
  exactDistance("1972", "2005", 33, "Year"), // Exactly 33 years apart on Year
];
```

Comparative constraints (`nextTo`, `leftOf`, `between`, `notBetween`, `before`, `notNextTo`, `exactDistance`) take a required `axis` parameter naming an `ordered: true` category.

### `deduce(constraints, grid)`

Solve a puzzle step-by-step using human-style deduction. Returns each logical step with technique, clue references, and a human-readable explanation. Returns partial results if deduction stalls (e.g. on custom puzzles that require guessing).

```typescript
import { deduce } from "logic-grid";

const result = deduce(puzzle.constraints, puzzle.grid);
// result.complete — whether the puzzle was fully solved
// result.steps — ordered deduction steps

for (const step of result.steps) {
  console.log(step.explanation);
  // "Clue 2: Dave lives in the first house."
  // "Clue 3: The fish owner lives in the third house."
  // "Carol lives in the fourth house (no other house possible)."
}
```

Each step includes:

- `technique` — which deduction technique was used (see below)
- `clueIndices` — which constraints were involved
- `eliminations` — positions ruled out
- `assignments` — values pinned to positions
- `explanation` — human-readable string

Techniques:

| Technique           | Description                                                    |
| ------------------- | -------------------------------------------------------------- |
| `same_position`     | Two values share possible positions — intersect them           |
| `not_same_position` | Pinned value excludes its position from the other              |
| `next_to`           | Positions incompatible with adjacency are removed              |
| `not_next_to`       | Pinned value excludes its neighbors from the other             |
| `left_of`           | Value directly left of another — constrain both                |
| `before`            | Value somewhere left of another — constrain range              |
| `between`           | Middle must lie strictly between two outers                    |
| `not_between`       | Middle cannot lie between two pinned outers                    |
| `exact_distance`    | Two values must be exactly N apart on the axis                 |
| `naked_single`      | One value is the only candidate for a position in its category |
| `hidden_single`     | One position is the only candidate for a value in its category |
| `naked_pair`        | Two values share the same two positions — exclude others       |
| `naked_triple`      | Three values share three positions — exclude others            |
| `hidden_pair`       | Two positions are exclusively reachable by two values          |
| `hidden_triple`     | Three positions are exclusively reachable by three values      |
| `contradiction`     | Placing a value at a position leads to an impossible state     |

### `renderClue(constraint, grid)`

Convert a constraint to a human-readable clue. Produces natural English phrasing based on category names and per-axis `orderingPhrases`.

```typescript
import { renderClue, samePosition } from "logic-grid";

const clue = renderClue(samePosition("Red", "Cat"), grid);
// { constraint: ..., text: "The cat owner lives in the red house." }
```

## Constraint Types

| Type                | Meaning                                                |
| ------------------- | ------------------------------------------------------ |
| `same_position`     | Two values are at the same position                    |
| `not_same_position` | Two values are at different positions                  |
| `next_to`           | Two values are rank-adjacent on the named axis         |
| `not_next_to`       | Two values are not rank-adjacent                       |
| `left_of`           | First value's rank is exactly one less than second's   |
| `between`           | Middle value's rank is strictly between two outers     |
| `not_between`       | Middle value's rank is not between two outers          |
| `before`            | First value's rank is strictly less than second's      |
| `exact_distance`    | Two values are exactly N apart (rank steps or numeric) |

## Types

```typescript
type Difficulty = "easy" | "medium" | "hard" | "expert";

interface Grid {
  size: number;
  categories: Category[];
  displayAxis?: string; // presentation hint: which ordered category for column headers
}

type Category = CategoryCore & OrderednessFields & ValueSuffixFields;

// See types.ts for the full discriminated union. Key fields:
interface CategoryCore {
  name: string;
  values: string[];
  noun?: string; // "owner" → "the cat owner"; "" = bare value
  verb?: [string, string]; // [positive, negative] for same-position clues
  subjectPriority?: number; // higher → preferred as sentence subject in same-position clues
  lowercase?: boolean; // lowercase values in clues (e.g. Color → "the red house")
}
// ordered: true requires orderingPhrases with all 7 comparators.
// valueSuffix enables positionAdjective.

type Solution = Assignment[]; // one per category
type Assignment = Record<string, number>; // value → position (0-indexed)

interface Clue {
  constraint: Constraint;
  text: string;
}
```

## How It Works

1. **SAT encoding** — each puzzle is encoded as a boolean satisfiability problem (CNF). Variable `x(v, p)` represents "value v is at position p". At-least-one and at-most-one constraints ensure valid assignments. Comparative constraints on non-identity-pinned axes use rank-forbidding clauses.

2. **DPLL solver** — a minimal DPLL SAT solver with watched literals and flat `Int32Array` storage. No external dependencies.

3. **Generation** — a random valid solution is generated, all true constraints are enumerated per ordered axis, then a minimal diverse subset is selected through constructive round-robin minimization: constraints are added one per type in rotation until uniqueness is achieved, then redundant ones are trimmed. An incremental solver with assumption literals avoids rebuilding the solver for each uniqueness check.

4. **Difficulty** — classified by constraint type complexity and whether the puzzle is solvable by direct elimination alone.

## Performance

Generation time by grid size (Node 24, Apple Silicon):

| Size | Time  |
| ---- | ----- |
| 3×3  | <1ms  |
| 4×4  | ~1ms  |
| 5×5  | ~2ms  |
| 6×6  | ~5ms  |
| 7×7  | ~11ms |
| 8×8  | ~18ms |

Supported sizes: 3-8 entities, 3-8 categories.

Run `npm run bench` to reproduce.

## License

MIT
