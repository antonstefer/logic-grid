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
// ["The Red color is in the same house as the Cat pet.", ...]

// Solve it
const solution = solve(puzzle.constraints, puzzle.grid);
```

## API

### `generate(options?)`

Generate a puzzle with a unique solution and minimal constraint set.

```typescript
const puzzle = generate({
  size: 5, // grid size (default: 4)
  categories: 4, // number of categories (default: 4)
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
    { name: "House", values: ["A", "B", "C"] },
    { name: "Owner", values: ["Alice", "Bob", "Carol"] },
    { name: "Pet", values: ["Cat", "Dog", "Fish"] },
  ],
});
```

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

### `renderClue(constraint, grid)`

Convert a constraint to a human-readable clue.

```typescript
import { renderClue } from "logic-grid";

const clue = renderClue(sameHouse("Red", "Cat"), grid);
// { constraint: ..., text: "The Red color is in the same house as the Cat pet." }
```

## Constraint Types

| Type               | Meaning                                        |
| ------------------ | ---------------------------------------------- |
| `same_house`       | Two values are at the same position             |
| `not_same_house`   | Two values are at different positions            |
| `next_to`          | Two values are at adjacent positions             |
| `not_next_to`      | Two values are not adjacent                      |
| `left_of`          | First value is directly left of second           |
| `between`          | Middle value is between the two outer values     |
| `at_position`      | Value is at a specific position (0-indexed)      |
| `not_at_position`  | Value is not at a specific position              |

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

3. **Generation** — a random valid solution is generated, all true constraints are enumerated, then a minimal subset is selected through constructive minimization (binary search for a sufficient set) followed by destructive minimization (batch removal of redundant constraints). An incremental solver with assumption literals avoids rebuilding the solver for each uniqueness check.

4. **Difficulty** — classified by constraint type complexity and whether the puzzle is solvable by direct elimination alone.

## Performance

Generation time by grid size (Node 24, Apple Silicon):

| Size  | Time   |
| ----- | ------ |
| 4x4   | 1ms    |
| 6x6   | 4ms    |
| 10x10 | 43ms   |
| 15x10 | 128ms  |
| 20x10 | 251ms  |
| 25x10 | 441ms  |
| 50x4  | 540ms  |

Run `npm run bench` to reproduce.

## License

MIT
