/**
 * The two files the browser downloads, and how to read them back.
 *
 * `concepts.json` holds the text and metadata. `vectors.bin` holds one float32
 * scale per concept followed by every vector as int8, row `i` belonging to
 * concept `i`. int8 keeps 99.6% of the float32 neighbours at a quarter of the
 * size. research/concept-space/embed.py writes both.
 */

import { normalize, type Corpus } from './corpus.ts';

/** File format version, raised on any incompatible change. */
export const CORPUS_FILE_VERSION = 1;

/** One concept as the interface shows it. */
export interface ConceptRecord {
  /** Stable identifier, kept in readers' browsers: never reuse or rename one. */
  id: string;
  term: string;
  hook: string;
  /** Index into `CorpusFile.clusters`. */
  cluster: number;
  /** Index of the first concept of its synonym group (itself when alone). */
  group: number;
}

/** Contents of `concepts.json`. */
export interface CorpusFile {
  version: number;
  /** The embedding model the vectors came from. embed.py holds the rest of the recipe. */
  model: string;
  dimensions: number;
  /** Field identifiers, in index order. */
  clusters: string[];
  /** The name a reader sees for each field, in the same order. */
  clusterLabels: string[];
  concepts: ConceptRecord[];
}

/**
 * Read both files into the recommender's corpus.
 *
 * Vectors are dequantized and renormalized once, so ranking works on float32
 * and costs nothing extra per comparison.
 *
 * Args:
 *   file: parsed `concepts.json`.
 *   vectorBytes: contents of `vectors.bin`.
 *
 * Returns:
 *   The corpus.
 *
 * Throws:
 *   Error when the version is unknown or the two files disagree on size.
 */
export function readCorpus(file: CorpusFile, vectorBytes: Uint8Array): Corpus {
  if (file.version !== CORPUS_FILE_VERSION) {
    throw new Error(`concepts.json is version ${file.version}, expected ${CORPUS_FILE_VERSION}`);
  }
  const count = file.concepts.length;
  const { dimensions } = file;
  if (vectorBytes.byteLength !== count * (4 + dimensions)) {
    throw new Error(
      `vectors.bin has ${vectorBytes.byteLength} bytes, expected ${count * (4 + dimensions)} for ${count} concepts`,
    );
  }
  // A copy starts at offset 0, which Float32Array needs. Buffer#slice would not copy.
  const aligned = vectorBytes.byteOffset % 4 === 0 ? vectorBytes : new Uint8Array(vectorBytes);
  const scales = new Float32Array(aligned.buffer, aligned.byteOffset, count);
  const values = new Int8Array(aligned.buffer, aligned.byteOffset + count * 4, count * dimensions);
  const vectors = new Float32Array(count * dimensions);
  for (let row = 0; row < count; row++) {
    for (let index = 0; index < dimensions; index++) {
      vectors[row * dimensions + index] = values[row * dimensions + index]! * scales[row]!;
    }
    normalize(vectors.subarray(row * dimensions, (row + 1) * dimensions));
  }
  return {
    count,
    dimensions,
    vectors,
    clusters: Uint16Array.from(file.concepts, (concept) => concept.cluster),
    groups: Uint32Array.from(file.concepts, (concept) => concept.group),
  };
}
