# logic-grid

Generate and solve logic grid puzzles (zebra puzzles / Einstein's riddles). Zero dependencies. TypeScript-first.

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
// ["Alice owns the dog.", "The red house has a cat.", ...]

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
  difficulty: "hard", // "easy" | "medium" | "hard" (optional)
  seed: 42, // random seed for reproducibility (optional)
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
const puzzle = generate({
  size: 3,
  categoryNames: [
    { name: "Name", values: ["Alice", "Bob", "Carol"] },
    {
      name: "Vehicle",
      values: ["Toyota", "BMW", "Honda"],
      noun: "driver", // → "the toyota driver"
      verb: ["drives the", "does not drive the"], // → "Alice drives the toyota."
    },
    { name: "Pet", values: ["Cat", "Dog", "Fish"] },
  ],
});
```

The `noun` controls how values appear in clue phrases (`"owner"` → "the cat owner", `""` → bare value like "Alice"). The `verb` controls same-house phrasing as `[positive, negative]`. Both are optional — built-in defaults exist for Name, Color, Pet, Drink, Food, Hobby, Music, and Sport.

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
classify(puzzle.constraints, puzzle.grid); // "easy" | "medium" | "hard"
```

### Constraint Factories

Build constraints programmatically:

```typescript
import {
  sameHouse,
  notSameHouse,
  nextTo,
  notNextTo,
  leftOf,
  between,
  notBetween,
  before,
  exactDistance,
  atPosition,
  notAtPosition,
} from "logic-grid";

const constraints = [
  sameHouse("Red", "Cat"), // Red and Cat are at the same position
  nextTo("Alice", "Bob"), // Alice is adjacent to Bob
  leftOf("Blue", "Green"), // Blue is directly left of Green
  between("Alice", "Bob", "Carol"), // Bob is between Alice and Carol
  atPosition("Red", 0), // Red is at position 0
];
```

### `deduce(constraints, grid)`

Solve a puzzle step-by-step using human-style deduction. Returns each logical step with technique, clue references, and a human-readable explanation. Returns partial results if deduction stalls (e.g. on custom puzzles that require guessing).

```typescript
import { deduce } from "logic-grid";

const result = deduce(puzzle.constraints, puzzle.grid);
// result.complete — whether the puzzle was fully solved
// result.steps — ordered deduction steps

for (const step of result.steps) {
  console.log(step.explanation);
  // "Red is in the first house."
  // "Red and Cat are in the same house: the first house."
  // "Blue must be in the second house, so no other Color can be there."
}
```

Each step includes:
- `technique` — which deduction technique was used (see below)
- `clueIndices` — which constraints were involved
- `eliminations` — positions ruled out
- `assignments` — values pinned to positions
- `explanation` — human-readable string

Techniques:

| Technique              | Description                                                              |
|------------------------|--------------------------------------------------------------------------|
| `direct`               | Value forced to a specific position by `at_position`                     |
| `elimination`          | Position ruled out by `not_at_position`                                  |
| `same_house`           | Two values share possible positions — intersect them                     |
| `not_same_house`       | Pinned value excludes its position from the other                        |
| `next_to`              | Positions incompatible with adjacency are removed                        |
| `not_next_to`          | Pinned value excludes its neighbors from the other                       |
| `left_of`              | Value directly left of another — constrain both                          |
| `before`               | Value somewhere left of another — constrain range                        |
| `between`              | Middle must lie strictly between two outers                              |
| `not_between`          | Middle cannot lie between two pinned outers                              |
| `exact_distance`       | Two values must be exactly N positions apart                             |
| `naked_single`         | One value is the only candidate for a position in its category           |
| `hidden_single`        | One position is the only candidate for a value in its category           |
| `naked_pair`           | Two values share the same two positions — exclude others                 |
| `naked_triple`         | Three values share three positions — exclude others                      |
| `hidden_pair`          | Two positions are exclusively reachable by two values                    |
| `hidden_triple`        | Three positions are exclusively reachable by three values                |
| `contradiction`        | Placing a value at a position leads to an impossible state               |

### `hint(constraints, grid, known?)`

Get the next logical deduction from a partial state. Pass `known` as a map of value names to assigned positions to represent what the user has figured out so far.

> **Note:** `hint()` re-runs the full deduction engine internally. For interactive use, prefer calling `deduce()` once and iterating over its steps.

```typescript
import { hint } from "logic-grid";

const h = hint(puzzle.constraints, puzzle.grid, { Red: 0, Cat: 0 });
// h.explanation — "Blue is directly left of Green."
// h.technique — "left_of"
// h.clueIndices — [2]
```

Returns `null` when no more deductions can be made.

### `renderClue(constraint, grid)`

Convert a constraint to a human-readable clue. Produces natural English phrasing based on category names (e.g. "Alice owns the dog" for Name+Pet, "The red house has a cat" for Color+Pet).

```typescript
import { renderClue, sameHouse } from "logic-grid";

const clue = renderClue(sameHouse("Red", "Cat"), grid);
// { constraint: ..., text: "The red house has a cat." }
```

## Constraint Types

| Type              | Meaning                                      |
|-------------------|----------------------------------------------|
| `same_house`      | Two values are at the same position          |
| `not_same_house`  | Two values are at different positions        |
| `next_to`         | Two values are at adjacent positions         |
| `not_next_to`     | Two values are not adjacent                  |
| `left_of`         | First value is directly left of second       |
| `between`         | Middle value is somewhere between two outers |
| `not_between`     | Middle value is not between two outers       |
| `before`          | First value is somewhere left of second      |
| `exact_distance`  | Two values are exactly N positions apart     |
| `at_position`     | Value is at a specific position (0-indexed)  |
| `not_at_position` | Value is not at a specific position          |

## Types

```typescript
type Difficulty = "easy" | "medium" | "hard";

interface Grid {
  size: number;
  categories: Category[];
}

interface Category {
  name: string;
  values: string[];
  noun?: string; // label noun for clues
  verb?: [string, string]; // [positive, negative] verb phrases
}

type Solution = Assignment[]; // one per category
type Assignment = Record<string, number>; // value → position (0-indexed)

interface Clue {
  constraint: Constraint;
  text: string;
}
```

## How It Works

1. **SAT encoding** — each puzzle is encoded as a boolean satisfiability problem (CNF). Variable `x(v, p)` represents "value v is at position p". At-least-one and at-most-one constraints ensure valid assignments.

2. **DPLL solver** — a minimal DPLL SAT solver with watched literals and flat `Int32Array` storage. No external dependencies.

3. **Generation** — a random valid solution is generated, all true constraints are enumerated, then a minimal diverse subset is selected through constructive round-robin minimization: constraints are added one per type in rotation until uniqueness is achieved, then redundant ones are trimmed. An incremental solver with assumption literals avoids rebuilding the solver for each uniqueness check.

4. **Difficulty** — classified by constraint type complexity and whether the puzzle is solvable by direct elimination alone.

## Performance

Generation time by grid size (Node 24, Apple Silicon):

| Size | Time  |
|------|-------|
| 3×3  | <1ms  |
| 4×4  | ~5ms  |
| 5×5  | ~10ms |
| 6×6  | ~15ms |
| 8×8  | ~80ms |

Supported sizes: 3-8 entities, 3-8 categories.

Run `npm run bench` to reproduce.

## License

MIT
