import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOtpUri } from '../src/uri.js';

test('TOTP with defaults keeps the URI minimal', () => {
  assert.equal(
    buildOtpUri({ issuer: 'Sarv', account: 'ankur@example.com', secret: 'JBSWY3DPEHPK3PXP' }),
    'otpauth://totp/Sarv:ankur%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Sarv',
  );
});

test('TOTP with every option set', () => {
  assert.equal(
    buildOtpUri({
      issuer: 'Acme Co',
      account: 'me',
      secret: 'ABC',
      algorithm: 'SHA256',
      digits: 8,
      period: 60,
      image: 'https://example.com/a b.png',
      lock: true,
    }),
    'otpauth://totp/Acme%20Co:me?secret=ABC&issuer=Acme%20Co&algorithm=SHA256&digits=8&period=60' +
      '&image=https%3A%2F%2Fexample.com%2Fa%20b.png&lock=true',
  );
});

test('HOTP always carries the counter, even 0, and never the period', () => {
  assert.equal(
    buildOtpUri({ type: 'hotp', account: 'me', secret: 'ABC', period: 60 }),
    'otpauth://hotp/me?secret=ABC&counter=0',
  );
  assert.equal(buildOtpUri({ type: 'hotp', account: 'me', secret: 'ABC', counter: 5 }), 'otpauth://hotp/me?secret=ABC&counter=5');
});

test('label without an issuer and colons escaped inside parts', () => {
  assert.equal(buildOtpUri({ account: 'a:b', secret: 'ABC' }), 'otpauth://totp/a%3Ab?secret=ABC');
});
