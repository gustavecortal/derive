/**
 * A reading session: the cards read, the options offered under each, and the
 * reader's marks. Pure state moves over concept ids.
 */

import type { ConceptRecord, CorpusFile } from './corpus-file.ts';
import { usedGroups, type Corpus } from './corpus.ts';
import { readerVector, type Interaction } from './reader.ts';
import { PASSED_OVER_CARDS, waysOut, type Way } from './ways.ts';

/** Only this many latest cards shape the reader vector, so an old curious pick fades. */
const HISTORY_CARDS = 50;

/** A reader's mark on a card: kept for later, or disliked. */
export type Mark = 'saved' | 'disliked';

export interface ReadingState {
  /** Concept ids in reading order. The first was chosen for the reader, and every other one was picked. */
  trail: string[];
  /** Index into `trail` of the card on screen. */
  position: number;
  /** Options offered under each card, by card id, so a reopened card offers what it did. */
  options: Record<string, Offered[]>;
  /** Options offered on the last `PASSED_OVER_CARDS` cards and not picked, newest card last. */
  passedOver: string[][];
  /** Marks by card id, in the order they were made. */
  marks: Record<string, Mark>;
}

/** The corpus text with its ids, enough for every state move except offering options. */
export interface Library {
  file: CorpusFile;
  rowOf: ReadonlyMap<string, number>;
}

/** An option as stored: the concept, and which of the three ways it is */
export interface Offered {
  id: string;
  way: Way;
}

/** One option under the card on screen. */
export interface Option extends Offered {
  /** Already in the trail: picking it reopens that card. */
  read: boolean;
}

/**
 * Index a corpus file by concept id.
 *
 * Args:
 *   file: parsed `concepts.json`.
 *
 * Returns:
 *   The library.
 */
export function libraryOf(file: CorpusFile): Library {
  return { file, rowOf: new Map(file.concepts.map((concept, row) => [concept.id, row])) };
}

/**
 * The corpus record of a concept.
 *
 * Args:
 *   library: the corpus text.
 *   id: a concept id the corpus holds.
 *
 * Returns:
 *   Its record: term, hook, field and synonym group.
 */
export function conceptOf(library: Library, id: string): ConceptRecord {
  return library.file.concepts[library.rowOf.get(id)!]!;
}

/**
 * The name a reader sees for a concept's field.
 *
 * Args:
 *   library: the corpus text.
 *   id: a concept id the corpus holds.
 *
 * Returns:
 *   The field's label.
 */
export function fieldOf(library: Library, id: string): string {
  return library.file.clusterLabels[conceptOf(library, id).cluster]!;
}

/**
 * A new reader's state: the first concept in data order, and its options.
 * With no history there is nothing to rank by, so every new reader starts on
 * the same card.
 *
 * Args:
 *   library: the corpus text.
 *   corpus: the corpus vectors.
 *   random: uniform numbers in [0, 1), for the far option.
 *
 * Returns:
 *   The state.
 */
export function startReading(library: Library, corpus: Corpus, random: () => number): ReadingState {
  const first = library.file.concepts[0]!.id;
  const state: ReadingState = {
    trail: [first],
    position: 0,
    options: {},
    passedOver: [],
    marks: {},
  };
  return withOptions(state, library, corpus, random);
}

/**
 * The card on screen.
 *
 * Args:
 *   state: the reading state.
 *
 * Returns:
 *   Its concept id.
 */
export function currentCard(state: ReadingState): string {
  return state.trail[state.position]!;
}

/**
 * Offer options under the card on screen, unless it already has some the
 * reader can see. Options all hidden since, because their synonyms were read,
 * are replaced.
 *
 * Args:
 *   state: the reading state.
 *   library: the corpus text.
 *   corpus: the corpus vectors.
 *   random: uniform numbers in [0, 1), for the far option.
 *
 * Returns:
 *   The state with options for the current card. An empty list means the
 *   corpus is used up: when only passed-over concepts are left, they are
 *   offered again. An empty list is computed again on the next call, which
 *   costs one pass and lets a larger corpus offer more.
 */
export function withOptions(
  state: ReadingState,
  library: Library,
  corpus: Corpus,
  random: () => number,
): ReadingState {
  const current = currentCard(state);
  if ((optionsOf(state, library) ?? []).length > 0) return state;
  const rowOf = (id: string) => library.rowOf.get(id)!;
  const shown = state.trail.map(rowOf);
  const reader = readerVector(corpus, interactionsOf(state, library));
  const used = usedGroups(corpus, shown);
  const offer = (excluded: Set<number>) =>
    waysOut(corpus, { current: rowOf(current), reader, used, excluded, shown, random });
  const passedOver = new Set(state.passedOver.flat().map(rowOf));
  let ways = offer(passedOver);
  if (ways.length === 0 && passedOver.size > 0) ways = offer(new Set());
  const offered = ways.map(({ way, concept }) => ({ way, id: library.file.concepts[concept]!.id }));
  return { ...state, options: { ...state.options, [current]: offered } };
}

/**
 * The options under the card on screen, as the reader sees them.
 *
 * An option whose synonym was read since it was offered is left out, so the
 * reader never meets one idea twice.
 *
 * Args:
 *   state: the reading state.
 *   library: the corpus text.
 *
 * Returns:
 *   The options; an empty list when the corpus is used up; null when none
 *   have been offered, or every one offered is hidden, so new ones are due.
 */
export function optionsOf(state: ReadingState, library: Library): Option[] | null {
  const offered = state.options[currentCard(state)];
  if (!offered) return null;
  const groupOf = (id: string) => conceptOf(library, id).group;
  const read = new Set(state.trail);
  const readGroups = new Set(state.trail.map(groupOf));
  const visible = offered
    .map((option) => ({ ...option, read: read.has(option.id) }))
    .filter((option) => option.read || !readGroups.has(groupOf(option.id)));
  return visible.length === 0 && offered.length > 0 ? null : visible;
}

/**
 * Read an option. One already read reopens its card. Any other joins the
 * trail, counts as liked, and the options passed over make way for others for
 * the next `PASSED_OVER_CARDS` cards.
 *
 * Args:
 *   state: the reading state.
 *   id: the option picked.
 *
 * Returns:
 *   The new state, with no options yet for the new card.
 */
export function pick(state: ReadingState, id: string): ReadingState {
  const position = state.trail.indexOf(id);
  if (position !== -1) return reopen(state, position);
  const offered = (state.options[currentCard(state)] ?? []).map((option) => option.id);
  const passedOver = offered.filter((option) => option !== id && !state.trail.includes(option));
  return {
    ...state,
    trail: [...state.trail, id],
    position: state.trail.length,
    passedOver: [...state.passedOver, passedOver].slice(-PASSED_OVER_CARDS),
  };
}

/**
 * Show a card of the trail again, with the options it had.
 *
 * Args:
 *   state: the reading state.
 *   position: index into the trail.
 *
 * Returns:
 *   The new state.
 */
export function reopen(state: ReadingState, position: number): ReadingState {
  if (!(position >= 0 && position < state.trail.length))
    throw new RangeError(`no card ${position} in the trail`);
  return { ...state, position };
}

/**
 * Set or clear a mark on the card on screen. Saving clears a dislike, and
 * the other way round.
 *
 * Args:
 *   state: the reading state.
 *   mark: the mark to toggle.
 *
 * Returns:
 *   The new state.
 */
export function toggleMark(state: ReadingState, mark: Mark): ReadingState {
  const current = currentCard(state);
  const { [current]: previous, ...marks } = state.marks;
  return { ...state, marks: previous === mark ? marks : { ...marks, [current]: mark } };
}

/**
 * The reader's latest `HISTORY_CARDS` cards as interactions: picked cards are
 * liked, and marks count as saved or disliked.
 *
 * Args:
 *   state: the reading state.
 *   library: the corpus text.
 *
 * Returns:
 *   Interactions, oldest first.
 */
export function interactionsOf(state: ReadingState, library: Library): Interaction[] {
  const start = Math.max(0, state.trail.length - HISTORY_CARDS);
  return state.trail.slice(start).map((id, index) => ({
    concept: library.rowOf.get(id)!,
    liked: start + index > 0,
    disliked: state.marks[id] === 'disliked',
    saved: state.marks[id] === 'saved',
  }));
}

