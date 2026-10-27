// Text the page shows, kept out of the DOM code so it can be tested.

const SECRET_BYTES = { SHA1: 20, SHA256: 32, SHA384: 48, SHA512: 64 };

/** RFC 4226 asks for at least 128 bits and recommends 160; match the hash's block output. */
export const recommendedSecretBytes = (algorithm) => SECRET_BYTES[algorithm] ?? 20;

/** "123456" -> "123 456", "12345678" -> "1234 5678", "1234567" -> "123 4567". */
export const formatCode = (code) => {
  const half = Math.floor(code.length / 2);
  return `${code.slice(0, half)} ${code.slice(half)}`;
};

export const concealCode = (digits) => formatCode('•'.repeat(digits));

export const secretStrength = (byteLength) => {
  const bits = byteLength * 8;
  if (bits < 80) return { tone: 'error', text: `${bits}-bit secret. Too short: use at least 128 bits.` };
  if (bits < 128) return { tone: 'error', text: `${bits}-bit secret. Weak: RFC 4226 asks for at least 128 bits.` };
  return { tone: 'ok', text: `${bits}-bit secret. Generated in your browser, never sent anywhere.` };
};

const stepWord = (type, steps) =>
  type === 'totp' ? `${steps} time step${steps === 1 ? '' : 's'}` : `${steps} counter step${steps === 1 ? '' : 's'}`;

/** Turn a `verifyCode` result into what the user sees. */
export const describeVerification = ({ valid, offset }, { type, period }) => {
  if (!valid) {
    return {
      tone: 'invalid',
      title: 'That code does not match',
      detail:
        type === 'totp'
          ? "Check that you scanned this QR code and that your phone's clock is set automatically."
          : 'Check that you scanned this QR code. Codes from far ahead of the counter are not accepted.',
    };
  }
  if (offset === 0) return { tone: 'valid', title: 'Code verified', detail: 'Your app is set up correctly.' };
  if (type === 'hotp') {
    return {
      tone: 'valid',
      title: 'Code verified',
      detail: `Your app was ${stepWord(type, offset)} ahead, so the counter moved forward to match it.`,
    };
  }
  const direction = offset < 0 ? 'behind' : 'ahead';
  const seconds = Math.abs(offset) * period;
  return {
    tone: 'drift',
    title: 'Code verified, with clock drift',
    detail: `It matched the code from ${stepWord(type, Math.abs(offset))} ${direction} (about ${seconds}s). Servers usually allow this, but check your clock.`,
  };
};

/** Safe, readable file name for downloads. */
export const fileBaseName = (issuer, account) =>
  [issuer, account]
    .filter(Boolean)
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'otp-qr';

/** Why the QR can't be drawn yet, or null when it can. */
export const missingFieldMessage = ({ account, secretValid, secretEmpty }) => {
  if (secretEmpty) return 'Add a secret, or press "New secret", to make a QR code.';
  if (!secretValid) return 'The secret must be Base32: letters A–Z and digits 2–7.';
  if (!account.trim()) return 'Add an account name, or press "Random", to make a QR code.';
  return null;
};
