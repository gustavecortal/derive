/**
 * The three ways out of a card: what the reader can read next, one concept for
 * each direction. The reader's choice among them is the main signal collected.
 */

import { similarity, vectorOf, type Corpus } from './corpus.ts';

/** Where an option leads, in the order shown: nearest to this card, the reader's taste in another field, or far from recent cards. */
export const WAYS = ['close', 'aside', 'far'] as const;
export type Way = (typeof WAYS)[number];

/** One way out of a card. */
export interface WayOut {
  way: Way;
  concept: number;
}

/** The far option is drawn at random from this many concepts least like the recent cards. */
const FAR_POOL = 30;
/** Options passed over on this many previous cards are not offered again for now. */
export const PASSED_OVER_CARDS = 10;
/** The far option keeps away from this many of the latest cards. */
const RECENT_CARDS = 10;

export interface WaysOptions {
  /** The card being read. */
  current: number;
  /** Reader vector, or null on a cold start. */
  reader: Float32Array | null;
  /** Mask over synonym groups already shown (see `usedGroups`). Not modified. */
  used: Uint8Array;
  /**
   * Concepts not to offer now, nor their synonyms: those offered on the last
   * `PASSED_OVER_CARDS` cards and not picked. Without this, an option the
   * reader keeps ignoring is offered again on every card.
   */
  excluded: ReadonlySet<number>;
  /** Cards shown, oldest first. The far option keeps away from the latest `RECENT_CARDS`. */
  shown: readonly number[];
  /** Uniform random numbers in [0, 1), injected so the function stays pure. */
  random: () => number;
}

/**
 * Choose what the reader can read after the current card.
 *
 * - `close`: the unshown concept most similar to the current card.
 * - `aside`: in a field that is neither the current card's nor the close
 *   option's, the concept most similar to the reader vector, or to the current
 *   card on a cold start.
 * - `far`: drawn at random from the `FAR_POOL` concepts whose highest
 *   similarity to the latest `RECENT_CARDS` cards is lowest. The draw keeps an
 *   outlier from being offered on every card.
 *
 * Options never repeat a shown synonym group, an excluded concept's group, or
 * each other's groups.
 *
 * Args:
 *   corpus: the corpus.
 *   options: see `WaysOptions`.
 *
 * Returns:
 *   Up to three options in the order close, aside, far. Fewer when the corpus
 *   runs out.
 */
export function waysOut(corpus: Corpus, options: WaysOptions): WayOut[] {
  const { current, reader, excluded, shown, random } = options;
  const taken = options.used.slice();
  const excludedGroups = new Set([...excluded].map((row) => corpus.groups[row]));
  const open = (row: number) =>
    !taken[corpus.groups[row]!] && !excludedGroups.has(corpus.groups[row]);
  const take = (way: Way, concept: number): WayOut => {
    taken[corpus.groups[concept]!] = 1;
    return { way, concept };
  };
  const result: WayOut[] = [];

  const currentVector = vectorOf(corpus, current);
  const close = argmax(corpus, open, (row) => similarity(corpus, row, currentVector));
  if (close !== -1) result.push(take('close', close));

  const towards = reader ?? currentVector;
  const blockedFields = new Set([
    corpus.clusters[current],
    close === -1 ? -1 : corpus.clusters[close],
  ]);
  const aside = argmax(
    corpus,
    (row) => open(row) && !blockedFields.has(corpus.clusters[row]!),
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

/**
 * The accepted row with the highest score.
 *
 * Args:
 *   corpus: the corpus whose rows are scanned.
 *   accept: whether a row may be chosen.
 *   score: a row's score.
 *
 * Returns:
 *   The row, or -1 when none is accepted.
 */
function argmax(
  corpus: Corpus,
  accept: (row: number) => boolean,
  score: (row: number) => number,
): number {
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
