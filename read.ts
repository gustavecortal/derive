/**
 * Read dérive in a terminal, with the recommender the web page runs.
 *
 *   node read.ts                 pick options by number, s to save, d to dislike, q to quit
 *   node read.ts 1 3 s 2 d 1     the same moves, scripted
 *   node read.ts --seed 7 ...    seed the draw of the Far option, for repeatable sessions
 */

import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { readCorpus, type CorpusFile } from './src/corpus-file.ts';
import {
  conceptOf,
  currentCard,
  fieldOf,
  libraryOf,
  optionsOf,
  pick,
  startReading,
  toggleMark,
  withOptions,
  type ReadingState,
} from './src/reading.ts';

const LABELS = { close: 'Closest', aside: 'Other field', far: 'Far' } as const;

/** Uniform numbers in [0, 1) from a 32-bit seed (mulberry32). */
function seeded(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const args = process.argv.slice(2);
const seedAt = args.indexOf('--seed');
const random = seedAt === -1 ? Math.random : seeded(Number(args.splice(seedAt, 2)[1]));
const scripted = args.length > 0 ? args : null;

const file: CorpusFile = JSON.parse(readFileSync(new URL('data/concepts.json', import.meta.url), 'utf8'));
const corpus = readCorpus(file, readFileSync(new URL('data/vectors.bin', import.meta.url)));
const library = libraryOf(file);

function show(state: ReadingState): void {
  const id = currentCard(state);
  const { term, hook } = conceptOf(library, id);
  const mark = state.marks[id] ? `  [${state.marks[id]}]` : '';
  console.log(`\n${term}  (${fieldOf(library, id)})${mark}\n${hook}\n`);
  (optionsOf(state, library) ?? []).forEach(({ id: option, way }, index) =>
    console.log(`  ${index + 1}  ${LABELS[way].padEnd(11)}  ${conceptOf(library, option).term}`),
  );
}

/** Apply one move: an option's number, s, or d. Returns null on q. */
function move(state: ReadingState, input: string): ReadingState | null {
  if (input === 'q') return null;
  if (input === 's') return toggleMark(state, 'saved');
  if (input === 'd') return toggleMark(state, 'disliked');
  const option = (optionsOf(state, library) ?? [])[Number(input) - 1];
  if (!option) {
    console.log('Type an option number, s, d or q.');
    return state;
  }
  return withOptions(pick(state, option.id), library, corpus, random);
}

let state: ReadingState | null = startReading(library, corpus, random);
show(state);
const terminal = scripted ? null : createInterface({ input: process.stdin, output: process.stdout });
for (const input of scripted ?? []) {
  state = move(state, input);
  if (!state) break;
  console.log(`> ${input}`);
  show(state);
}
while (terminal && state) {
  state = move(state, (await terminal.question('> ')).trim().toLowerCase());
  if (state) show(state);
}
terminal?.close();
