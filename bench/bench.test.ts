import { it } from 'vitest';
import { runBench } from './profile';

it('benchmark', () => {
  runBench();
}, 120000);
