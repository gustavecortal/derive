/**
 * The corpus. data/concepts.json holds each concept's term, one-sentence description, field and synonym group.
 * data/vectors.bin, written by embed.py, holds one float32 scale per concept followed by every embedding as int8,
 * row `i` belonging to concept `i`. int8 keeps 99.6% of the float32 neighbours at a quarter of the size.
 */

import { readFileSync } from 'node:fs';

export interface Concept {
  id: string;
  term: string;
  hook: string;
  /** Index of its field. */
  cluster: number;
  /** Index of the first concept of its synonym group (itself when alone). */
  group: number;
}

export interface Corpus {
  concepts: Concept[];
  /** Field names, by index. */
  fields: string[];
  count: number;
  dimensions: number;
  /** `count × dimensions`, each row L2-normalized. */
  vectors: Float32Array;
  /** Field of each concept. */
  clusters: Uint16Array;
  /**
   * Synonym group of each concept. Concepts that share a group are one idea under different names, so showing one
   * of them uses up the others.
   */
  groups: Uint32Array;
}

/** Read both files of `dir` and dequantize the vectors, renormalized once so ranking works on float32. */
export function loadCorpus(dir = new URL('../data/', import.meta.url)): Corpus {
  const file = JSON.parse(readFileSync(new URL('concepts.json', dir), 'utf8'));
  const bytes = readFileSync(new URL('vectors.bin', dir));
  const { concepts, dimensions } = file as { concepts: Concept[]; dimensions: number };
  const count = concepts.length;
  if (bytes.byteLength !== count * (4 + dimensions)) {
    throw new Error(`vectors.bin has ${bytes.byteLength} bytes, expected ${count * (4 + dimensions)} for ${count} concepts`);
  }
  const scales = new Float32Array(bytes.buffer, bytes.byteOffset, count);
  const values = new Int8Array(bytes.buffer, bytes.byteOffset + count * 4, count * dimensions);
  const vectors = new Float32Array(count * dimensions);
  for (let row = 0; row < count; row++) {
    for (let index = 0; index < dimensions; index++) {
      vectors[row * dimensions + index] = values[row * dimensions + index]! * scales[row]!;
    }
    normalize(vectors.subarray(row * dimensions, (row + 1) * dimensions));
  }
  return {
    concepts,
    fields: file.clusterLabels,
    count,
    dimensions,
    vectors,
    clusters: Uint16Array.from(concepts, (concept) => concept.cluster),
    groups: Uint32Array.from(concepts, (concept) => concept.group),
  };
}

/**
 * Cosine similarity of a concept and a unit vector. The four running sums add in the same order as the web page,
 * so rankings match it exactly.
 */
export function similarity(corpus: Corpus, row: number, vector: Float32Array): number {
  const { vectors, dimensions } = corpus;
  const offset = row * dimensions;
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

/** Scale a vector to unit length in place. A zero vector is left as it is. */
export function normalize(vector: Float32Array): Float32Array {
  let sumOfSquares = 0;
  for (const value of vector) sumOfSquares += value * value;
  if (sumOfSquares === 0) return vector;
  const inverse = 1 / Math.sqrt(sumOfSquares);
  for (let index = 0; index < vector.length; index++) vector[index]! *= inverse;
  return vector;
}

/** A concept's vector, as a view over the corpus. */
export function vectorOf(corpus: Corpus, row: number): Float32Array {
  return corpus.vectors.subarray(row * corpus.dimensions, (row + 1) * corpus.dimensions);
}
