/**
 * The three ways out of a card: what the reader can read next, one concept for each direction.
 */

import { similarity, vectorOf, type Corpus } from './corpus.ts';

/** Nearest to this card, the reader's taste in another field, or far from recent cards. */
export type Way = 'close' | 'aside' | 'far';

export interface WayOut {
  way: Way;
  concept: number;
}

/** Far is drawn at random from this many concepts least like the recent cards. */
const FAR_POOL = 30;
/** Far keeps away from this many of the latest cards. */
const RECENT_CARDS = 10;

/**
 * Up to three options after the current card, in the order close, aside, far.
 *
 * - close: the open concept most similar to the current card.
 * - aside: in a field that is neither the current card's nor close's, the open concept most similar to the taste
 *   vector, or to the current card before any taste.
 * - far: drawn at random from the `FAR_POOL` open concepts whose highest similarity to the latest `RECENT_CARDS`
 *   cards is lowest. The draw keeps an outlier from being offered on every card.
 *
 * Args:
 *   corpus: the corpus.
 *   current: the card being read.
 *   taste: the taste vector, or null.
 *   blocked: a mask over synonym groups that may not be offered. Not modified.
 *   shown: cards read, oldest first.
 *   random: uniform numbers in [0, 1).
 */
export function waysOut(
  corpus: Corpus,
  current: number,
  taste: Float32Array | null,
  blocked: Uint8Array,
  shown: readonly number[],
  random: () => number,
): WayOut[] {
  const taken = blocked.slice();
  const open = (row: number) => !taken[corpus.groups[row]!];
  const take = (way: Way, concept: number): WayOut => {
    taken[corpus.groups[concept]!] = 1;
    return { way, concept };
  };
  const result: WayOut[] = [];

  const currentVector = vectorOf(corpus, current);
  const close = argmax(corpus, open, (row) => similarity(corpus, row, currentVector));
  if (close !== -1) result.push(take('close', close));

  const towards = taste ?? currentVector;
  const fields = new Set([corpus.clusters[current], close === -1 ? -1 : corpus.clusters[close]]);
  const aside = argmax(
    corpus,
    (row) => open(row) && !fields.has(corpus.clusters[row]!),
    (row) => similarity(corpus, row, towards),
  );
  if (aside !== -1) result.push(take('aside', aside));

  const recent = shown.slice(-RECENT_CARDS).map((row) => vectorOf(corpus, row));
  const distances: Array<[number, number]> = [];
  for (let row = 0; row < corpus.count; row++) {
    if (!open(row)) continue;
    let nearest = -Infinity;
    for (const vector of recent) nearest = Math.max(nearest, similarity(corpus, row, vector));
    distances.push([nearest, row]);
  }
  distances.sort((first, second) => first[0] - second[0]);
  const pool = distances.slice(0, FAR_POOL);
  if (pool.length > 0) result.push(take('far', pool[Math.floor(random() * pool.length)]![1]));
  return result;
}

/** The accepted row with the highest score, or -1 when none is accepted. */
function argmax(corpus: Corpus, accept: (row: number) => boolean, score: (row: number) => number): number {
  let best = -1;
  let bestScore = -Infinity;
  for (let row = 0; row < corpus.count; row++) {
    if (!accept(row)) continue;
    const value = score(row);
    if (value > bestScore) {
      bestScore = value;
      best = row;
    }
  }
  return best;
}
