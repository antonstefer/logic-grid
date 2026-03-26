import { describe, it, expect } from 'vitest';
import {
  generate, solve, hasUniqueSolution, classify,
  sameHouse, nextTo, leftOf, atPosition,
} from './index';

describe('public API integration', () => {
  it('generate → solve → verify solution matches', () => {
    const puzzle = generate({ seed: 77 });

    const solved = solve(puzzle.constraints, puzzle.grid);
    expect(solved).not.toBeNull();

    // Every value should map to the same position in both solutions
    for (let ci = 0; ci < puzzle.solution.length; ci++) {
      for (const [val, pos] of Object.entries(puzzle.solution[ci])) {
        expect(solved![ci][val]).toBe(pos);
      }
    }
  });

  it('generate → classify → difficulty matches', () => {
    const puzzle = generate({ seed: 88 });
    const difficulty = classify(puzzle.constraints, puzzle.grid);
    expect(difficulty).toBe(puzzle.difficulty);
  });

  it('generate → hasUniqueSolution confirms uniqueness', () => {
    const puzzle = generate({ seed: 99 });
    expect(hasUniqueSolution(puzzle.constraints, puzzle.grid)).toBe(true);
  });

  it('constraint factories work with solve', () => {
    const grid = {
      size: 3,
      categories: [
        { name: 'Color', values: ['Red', 'Blue', 'Green'] },
        { name: 'Pet', values: ['Cat', 'Dog', 'Fish'] },
      ],
    };
    const constraints = [
      atPosition('Red', 0),
      sameHouse('Red', 'Cat'),
      leftOf('Blue', 'Green'),
    ];
    const solution = solve(constraints, grid);
    expect(solution).not.toBeNull();
    expect(solution![0]['Red']).toBe(0);
    expect(solution![1]['Cat']).toBe(0);
  });

  it('renderClue produces text for generated puzzles', () => {
    const puzzle = generate({ seed: 55 });
    for (const clue of puzzle.clues) {
      expect(clue.text.length).toBeGreaterThan(0);
      expect(clue.text.endsWith('.')).toBe(true);
    }
  });

  it('all constraint factories are exported', () => {
    expect(typeof sameHouse).toBe('function');
    expect(typeof nextTo).toBe('function');
    expect(typeof leftOf).toBe('function');
    expect(typeof atPosition).toBe('function');
  });
});
