/**
 * The reader vector: where in the corpus the reader's interest lies, from the
 * concepts they picked, saved or turned down: Rocchio relevance feedback,
 * without reading time or time decay, which measured no better in simulation
 * when the reader picks what to read next.
 */

import { normalize, vectorOf, type Corpus } from './corpus.ts';

/** Weight of disliked concepts against liked and saved ones, subtracted. */
const DISLIKED_WEIGHT = 0.5;

/** What the reader did with one concept. */
export interface Interaction {
  /** Concept index in the corpus. */
  concept: number;
  /** Picked from the options, which counts as liking it. */
  liked: boolean;
  /** Marked "not for me". */
  disliked: boolean;
  saved: boolean;
}

/**
 * Build a Rocchio reader vector from interactions.
 *
 * The vector is the mean of liked and saved concepts minus half the mean of
 * disliked ones, normalized. A concept the reader neither picked, saved nor
 * turned down does not count. Callers pass recent interactions only, which is
 * what lets the vector follow a reader whose interest moves.
 *
 * Args:
 *   corpus: the corpus the interactions refer to.
 *   interactions: the reader's recent history, in any order.
 *
 * Returns:
 *   A unit vector, or null when nothing was liked, saved or disliked.
 */
export function readerVector(
  corpus: Corpus,
  interactions: readonly Interaction[],
): Float32Array | null {
  const positive = new Float32Array(corpus.dimensions);
  const negative = new Float32Array(corpus.dimensions);
  let positiveCount = 0;
  let negativeCount = 0;
  for (const interaction of interactions) {
    if (interaction.disliked) {
      addScaled(negative, vectorOf(corpus, interaction.concept), 1);
      negativeCount += 1;
    } else if (interaction.liked || interaction.saved) {
      addScaled(positive, vectorOf(corpus, interaction.concept), 1);
      positiveCount += 1;
    }
  }
  if (positiveCount === 0 && negativeCount === 0) return null;

  const reader = new Float32Array(corpus.dimensions);
  if (positiveCount > 0) addScaled(reader, positive, 1 / positiveCount);
  if (negativeCount > 0) addScaled(reader, negative, -DISLIKED_WEIGHT / negativeCount);
  return normalize(reader);
}

/**
 * Add a scaled vector to another, in place.
 *
 * Args:
 *   target: the vector to add to.
 *   source: the vector to add.
 *   scale: the factor applied to `source`.
 */
function addScaled(target: Float32Array, source: Float32Array, scale: number): void {
  for (let index = 0; index < target.length; index++) target[index]! += source[index]! * scale;
}
