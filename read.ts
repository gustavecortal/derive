/**
 * Read dérive in a terminal, with the recommender the web page runs.
 *
 *   node read.ts                 pick options by number, s to save, d to dislike, q to quit
 *   node read.ts 1 3 s 2 d 1     the same moves, scripted
 *   node read.ts --seed 7 ...    seed the draw of the Far option, for repeatable sessions
 *   node read.ts --data mine     read mine/concepts.json and mine/vectors.bin instead of data/
 */

import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { loadCorpus } from './src/corpus.ts';
import { pick, start, toggleMark, type Session } from './src/reading.ts';

const LABELS = { close: 'Closest', aside: 'Other field', far: 'Far' };

/** Uniform numbers in [0, 1) from a 32-bit seed (mulberry32). */
function seeded(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const USAGE = 'Usage: node read.ts [--seed N] [--data DIR] [moves...]   moves: an option number, s (save), d (dislike), q (quit)';
let parsed;
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: { seed: { type: 'string' }, data: { type: 'string' }, help: { type: 'boolean', short: 'h' } },
  });
} catch (error) {
  console.error(`${(error as Error).message}\n${USAGE}`);
  process.exit(1);
}
const { values, positionals: moves } = parsed;
if (values.help) {
  console.log(USAGE);
  process.exit();
}
if (values.seed !== undefined && !Number.isInteger(Number(values.seed))) {
  console.error('--seed takes an integer');
  process.exit(1);
}
const random = values.seed === undefined ? Math.random : seeded(Number(values.seed));
const corpus = loadCorpus(values.data ? pathToFileURL(`${values.data}/`) : undefined);

function show(session: Session): void {
  const current = session.trail.at(-1)!;
  const { term, hook, cluster } = corpus.concepts[current]!;
  const mark = session.marks[current] ? `  [${session.marks[current]}]` : '';
  console.log(`\n${term}  (${corpus.fields[cluster]})${mark}\n${hook}\n`);
  session.options.forEach(({ way, concept }, index) =>
    console.log(`  ${index + 1}  ${LABELS[way].padEnd(11)}  ${corpus.concepts[concept]!.term}`),
  );
}

/** One move: an option's number, s, d, or q (null). */
function move(session: Session, input: string): Session | null {
  input = input.trim().toLowerCase();
  if (input === 'q') return null;
  if (input === 's') return toggleMark(session, 'saved');
  if (input === 'd') return toggleMark(session, 'disliked');
  const option = session.options[Number(input) - 1];
  if (option) return pick(corpus, session, option.concept, random);
  console.log('Type an option number, s, d or q.');
  return session;
}

let session: Session | null = start(corpus, random);
show(session);
const terminal = moves.length ? null : createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });
if (terminal) console.log('Type an option number to read it, s to save, d to dislike, q to quit.');
terminal?.prompt();
// Scripted moves, or typed ones until q or the end of input (Ctrl+D).
for await (const input of terminal ?? moves) {
  if (!terminal) console.log(`> ${input}`);
  session = move(session, input);
  if (!session) break;
  show(session);
  terminal?.prompt();
}
terminal?.close();
