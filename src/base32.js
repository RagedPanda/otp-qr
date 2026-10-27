// RFC 4648 Base32, the encoding used for otpauth:// secrets.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Strip spaces, dashes and padding, and upper-case, so pasted secrets work. */
export const normalizeBase32 = (text) => text.replace(/[\s=-]/g, '').toUpperCase();

export const isValidBase32 = (text) => {
  const normalized = normalizeBase32(text);
  return normalized.length > 0 && /^[A-Z2-7]+$/.test(normalized);
};

/** Encode bytes as unpadded Base32, which is what authenticator apps expect. */
export const base32Encode = (bytes) => {
  let output = '';
  let buffer = 0;
  let bitCount = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bitCount += 8;
    while (bitCount >= 5) {
      output += ALPHABET[(buffer >>> (bitCount - 5)) & 31];
      bitCount -= 5;
    }
  }
  if (bitCount > 0) output += ALPHABET[(buffer << (5 - bitCount)) & 31];
  return output;
};

/** Decode Base32 to bytes. Throws on characters outside the alphabet. */
export const base32Decode = (text) => {
  const normalized = normalizeBase32(text);
  const bytes = [];
  let buffer = 0;
  let bitCount = 0;
  for (const character of normalized) {
    const value = ALPHABET.indexOf(character);
    if (value === -1) throw new Error(`Invalid Base32 character "${character}"`);
    buffer = ((buffer << 5) | value) & 0xffff;
    bitCount += 5;
    if (bitCount >= 8) {
      bytes.push((buffer >>> (bitCount - 8)) & 0xff);
      bitCount -= 8;
    }
  }
  return Uint8Array.from(bytes);
};
