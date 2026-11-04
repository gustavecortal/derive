import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { readCorpus } from './src/corpus-file.ts';
import { libraryOf, optionsOf, pick, startReading, toggleMark, withOptions } from './src/reading.ts';

const file = JSON.parse(readFileSync(new URL('data/concepts.json', import.meta.url), 'utf8'));
const corpus = readCorpus(file, readFileSync(new URL('data/vectors.bin', import.meta.url)));
const library = libraryOf(file);
const half = () => 0.5;

test('the first card offers what the web page offers', () => {
  const options = optionsOf(startReading(library, corpus, half), library)!;
  assert.deepEqual(
    options.map(({ way, id }) => [way, id]),
    [
      ['close', 'texas_sharpshooter_fallacy'],
      ['aside', 'synchromysticism'],
      ['far', 'hemimetabolism'],
    ],
  );
});

test('a dislike changes what Other field offers', () => {
  const read = withOptions(pick(startReading(library, corpus, half), 'synchromysticism'), library, corpus, half);
  const aside = (state: typeof read) =>
    withOptions({ ...state, options: {} }, library, corpus, half).options.synchromysticism!.find(
      (option) => option.way === 'aside',
    )!.id;
  assert.notEqual(aside(read), aside(toggleMark(read, 'disliked')));
});
