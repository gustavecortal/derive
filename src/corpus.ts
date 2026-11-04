/**
 * The corpus as the recommender sees it: concepts are row indices, and every
 * per-concept fact the ranking needs is a typed array in data order.
 */

/** Unit-length concept vectors with the fields and synonym groups ranking needs. */
export interface Corpus {
  count: number;
  dimensions: number;
  /** `count × dimensions`, each row L2-normalized. */
  vectors: Float32Array;
  /** Field (cluster) index of each concept. */
  clusters: Uint16Array;
  /**
   * Synonym group of each concept: the index of the group's first member.
   * Concepts that share a group are one idea under different names, so
   * showing one of them uses up the others.
   */
  groups: Uint32Array;
}

/**
 * Dot product of two rows of the corpus, or of a row and a free vector.
 *
 * Args:
 *   corpus: the corpus holding the row.
 *   row: concept index.
 *   vector: a vector of `corpus.dimensions` values.
 *
 * Returns:
 *   The cosine similarity, since every row is unit length.
 */
export function similarity(corpus: Corpus, row: number, vector: Float32Array): number {
  const { vectors, dimensions } = corpus;
  const offset = row * dimensions;
  // Four independent sums let the engine overlap the additions.
  let first = 0;
  let second = 0;
  let third = 0;
  let fourth = 0;
  const aligned = dimensions - (dimensions % 4);
  let index = 0;
  for (; index < aligned; index += 4) {
    first += vectors[offset + index]! * vector[index]!;
    second += vectors[offset + index + 1]! * vector[index + 1]!;
    third += vectors[offset + index + 2]! * vector[index + 2]!;
    fourth += vectors[offset + index + 3]! * vector[index + 3]!;
  }
  for (; index < dimensions; index++) first += vectors[offset + index]! * vector[index]!;
  return first + second + third + fourth;
}

/**
 * Scale a vector to unit length in place. A zero vector is left as it is.
 *
 * Args:
 *   vector: the vector to normalize.
 *
 * Returns:
 *   The same vector, for chaining.
 */
export function normalize(vector: Float32Array): Float32Array {
  let sumOfSquares = 0;
  for (const value of vector) sumOfSquares += value * value;
  if (sumOfSquares === 0) return vector;
  const inverse = 1 / Math.sqrt(sumOfSquares);
  for (let index = 0; index < vector.length; index++) vector[index]! *= inverse;
  return vector;
}

/**
 * The vector of one concept, as a view over the corpus buffer.
 *
 * Args:
 *   corpus: the corpus.
 *   row: concept index.
 *
 * Returns:
 *   A `Float32Array` view. Writing to it changes the corpus.
 */
export function vectorOf(corpus: Corpus, row: number): Float32Array {
  return corpus.vectors.subarray(row * corpus.dimensions, (row + 1) * corpus.dimensions);
}

/**
 * Mark the synonym groups of the given concepts as used.
 *
 * Args:
 *   corpus: the corpus.
 *   rows: concept indices already shown to the reader.
 *
 * Returns:
 *   A mask indexed by concept: `mask[groups[i]] === 1` means concept `i`, or a
 *   synonym of it, has been shown.
 */
export function usedGroups(corpus: Corpus, rows: Iterable<number>): Uint8Array {
  const mask = new Uint8Array(corpus.count);
  for (const row of rows) mask[corpus.groups[row]!] = 1;
  return mask;
}
