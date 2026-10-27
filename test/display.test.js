import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  concealCode,
  describeVerification,
  fileBaseName,
  formatCode,
  missingFieldMessage,
  recommendedSecretBytes,
  secretStrength,
} from '../src/display.js';

test('recommendedSecretBytes follows the hash size', () => {
  assert.equal(recommendedSecretBytes('SHA1'), 20);
  assert.equal(recommendedSecretBytes('SHA512'), 64);
  assert.equal(recommendedSecretBytes('nope'), 20);
});

test('formatCode splits codes in two', () => {
  assert.equal(formatCode('123456'), '123 456');
  assert.equal(formatCode('1234567'), '123 4567');
  assert.equal(formatCode('12345678'), '1234 5678');
  assert.equal(concealCode(6), '••• •••');
});

test('secretStrength grades by bit length', () => {
  assert.equal(secretStrength(5).tone, 'error');
  assert.match(secretStrength(5).text, /^40-bit .*Too short/);
  assert.match(secretStrength(10).text, /^80-bit .*Weak/);
  assert.deepEqual(secretStrength(20), { tone: 'ok', text: '160-bit secret. Generated in your browser, never sent anywhere.' });
});

test('describeVerification for invalid codes', () => {
  assert.equal(describeVerification({ valid: false, offset: null }, { type: 'totp', period: 30 }).tone, 'invalid');
  assert.match(describeVerification({ valid: false, offset: null }, { type: 'totp' }).detail, /clock/);
  assert.match(describeVerification({ valid: false, offset: null }, { type: 'hotp' }).detail, /counter/);
});

test('describeVerification for exact and HOTP look-ahead matches', () => {
  assert.equal(describeVerification({ valid: true, offset: 0 }, { type: 'totp', period: 30 }).tone, 'valid');
  assert.match(describeVerification({ valid: true, offset: 1 }, { type: 'hotp' }).detail, /1 counter step ahead/);
  assert.match(describeVerification({ valid: true, offset: 3 }, { type: 'hotp' }).detail, /3 counter steps ahead/);
});

test('describeVerification flags TOTP clock drift', () => {
  const behind = describeVerification({ valid: true, offset: -1 }, { type: 'totp', period: 30 });
  assert.equal(behind.tone, 'drift');
  assert.match(behind.detail, /1 time step behind \(about 30s\)/);
  assert.match(describeVerification({ valid: true, offset: 2 }, { type: 'totp', period: 60 }).detail, /2 time steps ahead \(about 120s\)/);
});

test('fileBaseName slugs issuer and account', () => {
  assert.equal(fileBaseName('Acme Inc', 'me@x.com'), 'acme-inc-me-x-com');
  assert.equal(fileBaseName('', '--'), 'otp-qr');
  assert.equal(fileBaseName('', 'a'.repeat(80)).length, 60);
});

test('missingFieldMessage', () => {
  assert.match(missingFieldMessage({ account: 'me', secretValid: false, secretEmpty: true }), /Add a secret/);
  assert.match(missingFieldMessage({ account: 'me', secretValid: false, secretEmpty: false }), /Base32/);
  assert.match(missingFieldMessage({ account: ' ', secretValid: true, secretEmpty: false }), /account name/);
  assert.equal(missingFieldMessage({ account: 'me', secretValid: true, secretEmpty: false }), null);
});
