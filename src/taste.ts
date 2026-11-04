/**
 * The reader's taste, by Rocchio relevance feedback: the mean vector of the concepts they liked minus half the mean
 * of those they disliked. Reading time and time decay measured no better in simulation, so neither counts.
 */

import { normalize, vectorOf, type Corpus } from './corpus.ts';

/** Weight of disliked concepts against liked ones. */
const DISLIKED_WEIGHT = 0.5;

/** The taste vector, unit length, or null when nothing was liked or disliked. */
export function tasteVector(corpus: Corpus, liked: number[], disliked: number[]): Float32Array | null {
  if (liked.length === 0 && disliked.length === 0) return null;
  const taste = new Float32Array(corpus.dimensions);
  if (liked.length > 0) addScaled(taste, sum(corpus, liked), 1 / liked.length);
  if (disliked.length > 0) addScaled(taste, sum(corpus, disliked), -DISLIKED_WEIGHT / disliked.length);
  return normalize(taste);
}

function sum(corpus: Corpus, rows: number[]): Float32Array {
  const total = new Float32Array(corpus.dimensions);
  for (const row of rows) addScaled(total, vectorOf(corpus, row), 1);
  return total;
}

function addScaled(target: Float32Array, source: Float32Array, scale: number): void {
  for (let index = 0; index < target.length; index++) target[index]! += source[index]! * scale;
}
