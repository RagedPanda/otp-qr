// HOTP (RFC 4226) and TOTP (RFC 6238) on top of Web Crypto, which browsers and Node share.

const HASH_NAMES = { SHA1: 'SHA-1', SHA256: 'SHA-256', SHA384: 'SHA-384', SHA512: 'SHA-512' };

export const ALGORITHMS = Object.keys(HASH_NAMES);

/** The 8-byte big-endian counter that HOTP signs. */
export const counterToBytes = (counter) => {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, BigInt(counter));
  return bytes;
};

/** RFC 4226 dynamic truncation: pick 31 bits from the HMAC and keep the last `digits` digits. */
export const truncate = (hmac, digits) => {
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return String(BigInt(binary) % 10n ** BigInt(digits)).padStart(digits, '0');
};

const hmac = async (algorithm, keyBytes, message, subtle) => {
  const hash = HASH_NAMES[algorithm];
  if (!hash) throw new Error(`Unsupported algorithm "${algorithm}"`);
  const key = await subtle.importKey('raw', keyBytes, { name: 'HMAC', hash }, false, ['sign']);
  return new Uint8Array(await subtle.sign('HMAC', key, message));
};

export const hotp = async (
  secretBytes,
  counter,
  { algorithm = 'SHA1', digits = 6, subtle = globalThis.crypto.subtle } = {},
) => truncate(await hmac(algorithm, secretBytes, counterToBytes(counter), subtle), digits);

export const timeStep = (timeMs, period) => Math.floor(timeMs / 1000 / period);

export const secondsRemaining = (timeMs, period) => period - (Math.floor(timeMs / 1000) % period);

export const totp = (secretBytes, timeMs, { period = 30, ...options } = {}) =>
  hotp(secretBytes, timeStep(timeMs, period), options);

/** Counters to try, nearest first: 0, -1, +1, -2, +2 … for TOTP; 0, +1, +2 … for HOTP. */
export const candidateOffsets = (window, lookBehind) =>
  [0, ...Array.from({ length: window }, (_, index) => index + 1).flatMap((step) =>
    lookBehind ? [-step, step] : [step],
  )];

/**
 * Check a code typed from an authenticator app.
 * Resolves to `{ valid, offset }`, where `offset` is how many steps away from `counter` the match was.
 */
export const verifyCode = async (
  code,
  secretBytes,
  { counter, window = 1, lookBehind = true, ...options },
) => {
  const cleaned = code.replace(/\s/g, '');
  const offsets = candidateOffsets(window, lookBehind).filter((offset) => counter + offset >= 0);
  for (const offset of offsets) {
    if ((await hotp(secretBytes, counter + offset, options)) === cleaned) return { valid: true, offset };
  }
  return { valid: false, offset: null };
};
