import { test } from 'node:test';
import assert from 'node:assert/strict';
import { base32Decode, base32Encode, isValidBase32, normalizeBase32 } from '../src/base32.js';

const bytesOf = (text) => new TextEncoder().encode(text);

// RFC 4648 section 10 vectors, without padding.
const VECTORS = [
  ['', ''],
  ['f', 'MY'],
  ['fo', 'MZXQ'],
  ['foo', 'MZXW6'],
  ['foob', 'MZXW6YQ'],
  ['fooba', 'MZXW6YTB'],
  ['foobar', 'MZXW6YTBOI'],
];

test('base32Encode matches RFC 4648 vectors', () => {
  for (const [plain, encoded] of VECTORS) assert.equal(base32Encode(bytesOf(plain)), encoded);
});

test('base32Decode reverses RFC 4648 vectors', () => {
  for (const [plain, encoded] of VECTORS) assert.deepEqual(base32Decode(encoded), bytesOf(plain));
});

test('base32Decode accepts lower case, spaces, dashes and padding', () => {
  assert.deepEqual(base32Decode('mzxw 6ytb-oi======'), bytesOf('foobar'));
});

test('base32Decode rejects characters outside the alphabet', () => {
  assert.throws(() => base32Decode('MZX1'), /Invalid Base32 character "1"/);
});

test('round-trips random bytes', () => {
  const bytes = Uint8Array.from({ length: 37 }, (_, index) => (index * 97 + 13) & 0xff);
  assert.deepEqual(base32Decode(base32Encode(bytes)), bytes);
});

test('normalizeBase32 and isValidBase32', () => {
  assert.equal(normalizeBase32(' ab cd= '), 'ABCD');
  assert.equal(isValidBase32('JBSW Y3DP'), true);
  assert.equal(isValidBase32('JBSW0'), false);
  assert.equal(isValidBase32('  '), false);
});
