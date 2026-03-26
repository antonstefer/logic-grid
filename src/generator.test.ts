import { describe, it, expect } from 'vitest';
import { generate } from './generator';
import { hasUniqueSolution, solve } from './solver';

describe('generate', () => {
  it('returns a valid puzzle with defaults', () => {
    const puzzle = generate();

    expect(puzzle.grid.size).toBe(4);
    expect(puzzle.grid.categories.length).toBe(4);
    expect(puzzle.constraints.length).toBeGreaterThan(0);
    expect(puzzle.clues.length).toBe(puzzle.constraints.length);
    expect(puzzle.solution.length).toBe(4);
    expect(['easy', 'medium', 'hard']).toContain(puzzle.difficulty);
  });

  it('solution is a valid permutation', () => {
    const puzzle = generate();

    for (const assignment of puzzle.solution) {
      const positions = Object.values(assignment);
      expect(positions.length).toBe(puzzle.grid.size);
      expect(new Set(positions).size).toBe(puzzle.grid.size);
      for (const p of positions) {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThan(puzzle.grid.size);
      }
    }
  });

  it('constraints are consistent with the solution', () => {
    const puzzle = generate();
    const posOf = new Map<string, number>();
    for (const assignment of puzzle.solution) {
      for (const [val, pos] of Object.entries(assignment)) {
        posOf.set(val, pos);
      }
    }

    for (const c of puzzle.constraints) {
      switch (c.type) {
        case 'same_house':
          expect(posOf.get(c.a)).toBe(posOf.get(c.b));
          break;
        case 'not_same_house':
          expect(posOf.get(c.a)).not.toBe(posOf.get(c.b));
          break;
        case 'next_to':
          expect(Math.abs(posOf.get(c.a)! - posOf.get(c.b)!)).toBe(1);
          break;
        case 'not_next_to':
          expect(Math.abs(posOf.get(c.a)! - posOf.get(c.b)!)).not.toBe(1);
          break;
        case 'left_of':
          expect(posOf.get(c.b)! - posOf.get(c.a)!).toBe(1);
          break;
        case 'between': {
          const lo = Math.min(posOf.get(c.outer1)!, posOf.get(c.outer2)!);
          const hi = Math.max(posOf.get(c.outer1)!, posOf.get(c.outer2)!);
          expect(posOf.get(c.middle)!).toBeGreaterThan(lo);
          expect(posOf.get(c.middle)!).toBeLessThan(hi);
          break;
        }
        case 'at_position':
          expect(posOf.get(c.value)).toBe(c.position);
          break;
        case 'not_at_position':
          expect(posOf.get(c.value)).not.toBe(c.position);
          break;
      }
    }
  });

  it('puzzle has a unique solution', () => {
    const puzzle = generate();
    expect(hasUniqueSolution(puzzle.constraints, puzzle.grid)).toBe(true);
  });

  it('solver finds the same solution', () => {
    const puzzle = generate({ seed: 42 });
    const solved = solve(puzzle.constraints, puzzle.grid);
    expect(solved).not.toBeNull();

    // Verify every value maps to the same position
    for (let ci = 0; ci < puzzle.solution.length; ci++) {
      for (const [val, pos] of Object.entries(puzzle.solution[ci])) {
        expect(solved![ci][val]).toBe(pos);
      }
    }
  });

  it('seeded generation is deterministic', () => {
    const p1 = generate({ seed: 123 });
    const p2 = generate({ seed: 123 });

    expect(p1.solution).toEqual(p2.solution);
    expect(p1.constraints).toEqual(p2.constraints);
  });

  it('generates 3x3 puzzles', () => {
    const puzzle = generate({ size: 3, categories: 3 });
    expect(puzzle.grid.size).toBe(3);
    expect(puzzle.grid.categories.length).toBe(3);
    expect(hasUniqueSolution(puzzle.constraints, puzzle.grid)).toBe(true);
  });

  it('generates 5x5 puzzles', () => {
    const puzzle = generate({ size: 5, categories: 5 });
    expect(puzzle.grid.size).toBe(5);
    expect(puzzle.grid.categories.length).toBe(5);
    expect(hasUniqueSolution(puzzle.constraints, puzzle.grid)).toBe(true);
  });

  it('generates 6x6 puzzles', () => {
    const puzzle = generate({ size: 6, categories: 6, seed: 42 });
    expect(puzzle.grid.size).toBe(6);
    expect(puzzle.grid.categories.length).toBe(6);
    expect(hasUniqueSolution(puzzle.constraints, puzzle.grid)).toBe(true);
  });

  it('generates 8x8 puzzles', () => {
    const puzzle = generate({ size: 8, categories: 8, seed: 42 });
    expect(puzzle.grid.size).toBe(8);
    expect(puzzle.grid.categories.length).toBe(8);
    expect(hasUniqueSolution(puzzle.constraints, puzzle.grid)).toBe(true);
  });

  it('generates 10x6 puzzles', () => {
    const puzzle = generate({ size: 10, categories: 6, seed: 42 });
    expect(puzzle.grid.size).toBe(10);
    expect(puzzle.grid.categories.length).toBe(6);
    expect(hasUniqueSolution(puzzle.constraints, puzzle.grid)).toBe(true);
  });

  it('generates 15x4 puzzles', () => {
    const puzzle = generate({ size: 15, categories: 4, seed: 42 });
    expect(puzzle.grid.size).toBe(15);
    expect(puzzle.grid.categories.length).toBe(4);
    expect(hasUniqueSolution(puzzle.constraints, puzzle.grid)).toBe(true);
  });

  it('accepts custom categories', () => {
    const puzzle = generate({
      size: 3,
      categoryNames: [
        { name: 'House', values: ['A', 'B', 'C'] },
        { name: 'Owner', values: ['X', 'Y', 'Z'] },
        { name: 'Car', values: ['BMW', 'Audi', 'VW'] },
      ],
    });
    expect(puzzle.grid.categories[0].name).toBe('House');
    expect(puzzle.grid.categories[0].values).toEqual(['A', 'B', 'C']);
    expect(hasUniqueSolution(puzzle.constraints, puzzle.grid)).toBe(true);
  });

  it('respects difficulty easy', () => {
    const puzzle = generate({ size: 3, categories: 3, difficulty: 'easy', seed: 1 });
    expect(puzzle.difficulty).toBe('easy');
    // Only easy constraint types
    for (const c of puzzle.constraints) {
      expect(['same_house', 'not_same_house', 'at_position', 'not_at_position']).toContain(c.type);
    }
  });
});
