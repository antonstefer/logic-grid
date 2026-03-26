import { describe, it, expect } from 'vitest';
import { renderClue } from './templates';
import { Grid } from '../types';

const grid: Grid = {
  size: 3,
  categories: [
    { name: 'Color', values: ['Red', 'Blue', 'Green'] },
    { name: 'Pet', values: ['Cat', 'Dog', 'Fish'] },
    { name: 'Drink', values: ['Tea', 'Coffee', 'Water'] },
  ],
};

describe('renderClue', () => {
  it('same_house', () => {
    const clue = renderClue({ type: 'same_house', a: 'Red', b: 'Cat' }, grid);
    expect(clue.text).toBe('The Red color is in the same house as the Cat pet.');
  });

  it('not_same_house', () => {
    const clue = renderClue({ type: 'not_same_house', a: 'Red', b: 'Dog' }, grid);
    expect(clue.text).toBe('The Red color is not in the same house as the Dog pet.');
  });

  it('next_to', () => {
    const clue = renderClue({ type: 'next_to', a: 'Blue', b: 'Cat' }, grid);
    expect(clue.text).toBe('The Blue color is next to the Cat pet.');
  });

  it('not_next_to', () => {
    const clue = renderClue({ type: 'not_next_to', a: 'Tea', b: 'Dog' }, grid);
    expect(clue.text).toBe('The Tea drink is not next to the Dog pet.');
  });

  it('left_of', () => {
    const clue = renderClue({ type: 'left_of', a: 'Blue', b: 'Green' }, grid);
    expect(clue.text).toBe('The Blue color is directly left of the Green color.');
  });

  it('between', () => {
    const clue = renderClue({ type: 'between', outer1: 'Red', middle: 'Cat', outer2: 'Blue' }, grid);
    expect(clue.text).toBe('The Cat pet is between the Red color and the Blue color.');
  });

  it('at_position (1-indexed for humans)', () => {
    const clue = renderClue({ type: 'at_position', value: 'Tea', position: 0 }, grid);
    expect(clue.text).toBe('The Tea drink is in position 1.');
  });

  it('not_at_position', () => {
    const clue = renderClue({ type: 'not_at_position', value: 'Red', position: 2 }, grid);
    expect(clue.text).toBe('The Red color is not in position 3.');
  });

  it('preserves constraint in returned clue', () => {
    const constraint = { type: 'same_house' as const, a: 'Red', b: 'Cat' };
    const clue = renderClue(constraint, grid);
    expect(clue.constraint).toBe(constraint);
  });
});
