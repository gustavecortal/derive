/**
 * A reading session: the cards read, the options under the current card, and the reader's marks.
 * Concepts are corpus rows.
 */

import type { Corpus } from './corpus.ts';
import { tasteVector } from './taste.ts';
import { waysOut, type WayOut } from './ways.ts';

/** Only this many latest cards shape the taste, so an old curious pick fades. */
const HISTORY_CARDS = 50;
/** Options passed over on this many previous cards are not offered again for now. */
const PASSED_OVER_CARDS = 10;

export type Mark = 'saved' | 'disliked';

export interface Session {
  /** Cards in reading order: the first chosen for the reader, every other one picked. The last is on screen. */
  trail: number[];
  options: WayOut[];
  /** Options offered on the last `PASSED_OVER_CARDS` cards and not picked, newest card last. */
  passedOver: number[][];
  marks: Partial<Record<number, Mark>>;
}

/** A new session. With no history there is nothing to rank by, so every reader starts on the first concept. */
export function start(corpus: Corpus, random: () => number): Session {
  return withOptions(corpus, { trail: [0], options: [], passedOver: [], marks: {} }, random);
}

/** Read an option: it counts as liked, and the options passed over make way for others for a while. */
export function pick(corpus: Corpus, session: Session, concept: number, random: () => number): Session {
  const passed = session.options.map((option) => option.concept).filter((row) => row !== concept);
  return withOptions(
    corpus,
    {
      ...session,
      trail: [...session.trail, concept],
      passedOver: [...session.passedOver, passed].slice(-PASSED_OVER_CARDS),
    },
    random,
  );
}

/** Set or clear a mark on the current card. Saving clears a dislike, and the other way round. */
export function toggleMark(session: Session, mark: Mark): Session {
  const current = session.trail.at(-1)!;
  const marks = { ...session.marks };
  if (marks[current] === mark) delete marks[current];
  else marks[current] = mark;
  return { ...session, marks };
}

/**
 * The session with options under its current card. Concepts read, and their synonyms, are never offered. Neither
 * are recently passed-over ones, unless nothing else is left.
 */
function withOptions(corpus: Corpus, session: Session, random: () => number): Session {
  const { trail, marks } = session;
  // Picked cards count as liked, the first card only when saved. A dislike outweighs both.
  const from = Math.max(0, trail.length - HISTORY_CARDS);
  const recent = trail.slice(from).map((row, index) => ({ row, picked: from + index > 0 }));
  const disliked = recent.filter(({ row }) => marks[row] === 'disliked').map(({ row }) => row);
  const liked = recent
    .filter(({ row, picked }) => marks[row] !== 'disliked' && (picked || marks[row] === 'saved'))
    .map(({ row }) => row);
  const taste = tasteVector(corpus, liked, disliked);
  const blocked = (excluded: number[]) => {
    const mask = new Uint8Array(corpus.count);
    for (const row of [...trail, ...excluded]) mask[corpus.groups[row]!] = 1;
    return mask;
  };
  const passedOver = session.passedOver.flat();
  let options = waysOut(corpus, trail.at(-1)!, taste, blocked(passedOver), trail, random);
  if (options.length === 0 && passedOver.length > 0) options = waysOut(corpus, trail.at(-1)!, taste, blocked([]), trail, random);
  return { ...session, options };
}
