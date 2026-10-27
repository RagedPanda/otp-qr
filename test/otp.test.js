import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALGORITHMS,
  candidateOffsets,
  counterToBytes,
  hotp,
  secondsRemaining,
  timeStep,
  totp,
  truncate,
  verifyCode,
} from '../src/otp.js';

const asciiKey = (text) => new TextEncoder().encode(text);
const SHA1_KEY = asciiKey('12345678901234567890');
const SHA256_KEY = asciiKey('12345678901234567890123456789012');
const SHA512_KEY = asciiKey('1234567890123456789012345678901234567890123456789012345678901234');

test('hotp matches RFC 4226 appendix D', async () => {
  const expected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
  const actual = await Promise.all(expected.map((_, counter) => hotp(SHA1_KEY, counter)));
  assert.deepEqual(actual, expected);
});

// RFC 6238 appendix B: [unix seconds, SHA1, SHA256, SHA512], 8 digits, 30 s period.
const TOTP_VECTORS = [
  [59, '94287082', '46119246', '90693936'],
  [1111111109, '07081804', '68084774', '25091201'],
  [1111111111, '14050471', '67062674', '99943326'],
  [1234567890, '89005924', '91819424', '93441116'],
  [2000000000, '69279037', '90698825', '38618901'],
  [20000000000, '65353130', '77737706', '47863826'],
];

test('totp matches RFC 6238 appendix B for SHA1, SHA256 and SHA512', async () => {
  for (const [seconds, sha1, sha256, sha512] of TOTP_VECTORS) {
    const timeMs = seconds * 1000;
    assert.equal(await totp(SHA1_KEY, timeMs, { digits: 8 }), sha1);
    assert.equal(await totp(SHA256_KEY, timeMs, { digits: 8, algorithm: 'SHA256' }), sha256);
    assert.equal(await totp(SHA512_KEY, timeMs, { digits: 8, algorithm: 'SHA512' }), sha512);
  }
});

test('SHA384 is supported and every listed algorithm produces a code', async () => {
  assert.deepEqual(ALGORITHMS, ['SHA1', 'SHA256', 'SHA384', 'SHA512']);
  for (const algorithm of ALGORITHMS) assert.match(await hotp(SHA1_KEY, 1, { algorithm }), /^\d{6}$/);
});

test('hotp rejects unknown algorithms', async () => {
  await assert.rejects(hotp(SHA1_KEY, 0, { algorithm: 'MD5' }), /Unsupported algorithm "MD5"/);
});

test('truncate pads with leading zeros and supports 10 digits', () => {
  const hmac = new Uint8Array(20);
  hmac[3] = 7;
  assert.equal(truncate(hmac, 6), '000007');
  hmac.fill(0xff, 0, 4);
  assert.equal(truncate(hmac, 10), '2147483647');
});

test('counterToBytes is 8-byte big-endian', () => {
  assert.deepEqual([...counterToBytes(258)], [0, 0, 0, 0, 0, 0, 1, 2]);
});

test('timeStep and secondsRemaining', () => {
  assert.equal(timeStep(59_000, 30), 1);
  assert.equal(secondsRemaining(59_000, 30), 1);
  assert.equal(secondsRemaining(60_000, 30), 30);
  assert.equal(secondsRemaining(61_500, 60), 59);
});

test('candidateOffsets orders nearest first', () => {
  assert.deepEqual(candidateOffsets(2, true), [0, -1, 1, -2, 2]);
  assert.deepEqual(candidateOffsets(3, false), [0, 1, 2, 3]);
  assert.deepEqual(candidateOffsets(0, true), [0]);
});

test('verifyCode accepts the current, previous and next TOTP step', async () => {
  const counter = timeStep(1111111111 * 1000, 30);
  const previous = await hotp(SHA1_KEY, counter - 1);
  const next = await hotp(SHA1_KEY, counter + 1);
  assert.deepEqual(await verifyCode(await hotp(SHA1_KEY, counter), SHA1_KEY, { counter }), { valid: true, offset: 0 });
  assert.deepEqual(await verifyCode(previous, SHA1_KEY, { counter }), { valid: true, offset: -1 });
  assert.deepEqual(await verifyCode(` ${next.slice(0, 3)} ${next.slice(3)} `, SHA1_KEY, { counter }), {
    valid: true,
    offset: 1,
  });
});

test('verifyCode rejects codes outside the window and wrong codes', async () => {
  const twoAhead = await hotp(SHA1_KEY, 12);
  assert.deepEqual(await verifyCode(twoAhead, SHA1_KEY, { counter: 10 }), { valid: false, offset: null });
  assert.deepEqual(await verifyCode('000000', SHA1_KEY, { counter: 10, window: 0 }), { valid: false, offset: null });
});

test('verifyCode looks ahead only for HOTP and never below counter 0', async () => {
  assert.deepEqual(await verifyCode('287082', SHA1_KEY, { counter: 0, window: 3, lookBehind: false }), {
    valid: true,
    offset: 1,
  });
  assert.deepEqual(await verifyCode('755224', SHA1_KEY, { counter: 1, window: 3, lookBehind: false }), {
    valid: false,
    offset: null,
  });
  assert.deepEqual(await verifyCode('755224', SHA1_KEY, { counter: 0, window: 1 }), { valid: true, offset: 0 });
});
