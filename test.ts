import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadCorpus } from './src/corpus.ts';
import { pick, start, toggleMark } from './src/reading.ts';

const corpus = loadCorpus();
const half = () => 0.5;
const row = (id: string) => corpus.concepts.findIndex((concept) => concept.id === id);
const ids = (options: { way: string; concept: number }[]) =>
  options.map(({ way, concept }) => [way, corpus.concepts[concept]!.id]);

test('the first card offers what the web page offers', () => {
  assert.deepEqual(ids(start(corpus, half).options), [
    ['close', 'texas_sharpshooter_fallacy'],
    ['aside', 'synchromysticism'],
    ['far', 'hemimetabolism'],
  ]);
});

test('a dislike changes what Other field offers on the next card', () => {
  const read = pick(corpus, start(corpus, half), row('synchromysticism'), half);
  const aside = (session: typeof read) =>
    pick(corpus, session, session.options[0]!.concept, half).options.find((option) => option.way === 'aside')!.concept;
  assert.notEqual(aside(read), aside(toggleMark(read, 'disliked')));
});
