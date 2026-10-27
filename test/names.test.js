import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ADJECTIVES, ANIMALS, randomAccountName } from '../src/names.js';

test('randomAccountName joins an adjective, an animal and a 4-digit number', () => {
  assert.equal(randomAccountName(() => 0), 'amber-badger-1000');
  assert.equal(randomAccountName((limit) => limit - 1), 'zesty-yak-9999');
});

test('word lists hold unique lower-case words', () => {
  for (const words of [ADJECTIVES, ANIMALS]) {
    assert.equal(new Set(words).size, words.length);
    for (const word of words) assert.match(word, /^[a-z]+$/);
  }
});
