# Adding 2FA to your application

How to add authenticator-app two-factor authentication (TOTP, the six-digit codes from Google Authenticator, Microsoft Authenticator, Authy, FreeOTP, 1Password and the rest) to your own login, following the standards:

- [RFC 4226](https://www.rfc-editor.org/rfc/rfc4226): HOTP, the HMAC-based one-time password.
- [RFC 6238](https://www.rfc-editor.org/rfc/rfc6238): TOTP, HOTP with a counter taken from the clock.
- [RFC 4648](https://www.rfc-editor.org/rfc/rfc4648#section-6): Base32, the encoding used for the secret.
- The [Key URI Format](https://github.com/google/google-authenticator/wiki/Key-Uri-Format): the `otpauth://` link inside the QR code. It isn't an RFC, but every authenticator app reads it.

The code below is complete and runs as-is: Node.js (built-in `node:crypto`) and Python 3.10+ (standard library only). Both are checked against the RFC 4226 and RFC 6238 test vectors. You can use [OTP QR Studio](https://ragedpanda.github.io/otp-qr/) to check your server: paste the secret your server generated, scan the QR, and compare codes.

## Contents

1. [How it works](#how-it-works)
2. [The settings to use](#the-settings-to-use)
3. [Enrolment](#enrolment)
4. [Login](#login)
5. [Code: Node.js](#code-nodejs)
6. [Code: Python](#code-python)
7. [HOTP (counter-based)](#hotp-counter-based)
8. [Recovery and account management](#recovery-and-account-management)
9. [Security checklist](#security-checklist)
10. [Testing your implementation](#testing-your-implementation)

## How it works

The server and the user's app share one secret key. Neither side sends the code anywhere except when the user types it in.

```
HOTP(K, C) = Truncate(HMAC-SHA1(K, C)) mod 10^digits      RFC 4226 section 5.3
TOTP(K)    = HOTP(K, floor(unix_time / 30))                RFC 6238 section 4
```

1. **HMAC** the counter `C`, written as 8 bytes big-endian, with the key `K`.
2. **Dynamic truncation**: take the low 4 bits of the last HMAC byte as an offset, read 4 bytes from that offset as a big-endian integer, and clear the top bit.
3. **Reduce** it modulo 10^6 and left-pad with zeros to 6 digits.

For TOTP the counter is the number of 30-second steps since the Unix epoch (RFC 6238 calls them `X = 30` and `T0 = 0`). Both sides compute the same number as long as their clocks roughly agree.

## The settings to use

| Setting | Use | Why |
|---|---|---|
| Type | TOTP | Codes expire on their own, and there's no counter to keep in sync. |
| Algorithm | SHA1 | Google Authenticator and several other apps ignore the `algorithm` parameter and always use SHA1. HMAC-SHA1 is still sound for this use; the known SHA1 collision attacks don't apply to HMAC. |
| Digits | 6 | The value every app supports. |
| Period | 30 seconds | RFC 6238's recommended default, and the only value some apps support. |
| Secret | 20 random bytes (160 bits) | RFC 4226 section 4 requires at least 128 bits and recommends 160. |

Only change these if you control the app as well. If you do use SHA256 or SHA512, use a secret as long as the hash output (32 or 64 bytes).

## Enrolment

```
User                         Your server                           Database
 |  "Turn on 2FA"  ------->  generate 20-byte secret (CSPRNG)
 |                           store it as *pending*  -------------> otp_secret_pending
 |  <-- QR + secret text --  build otpauth:// URI, render QR
 |  scans, types code ---->  verify code against the pending secret
 |                           on success: move pending -> active --> otp_secret, otp_enabled_at
 |  <-- recovery codes ----  generate, store hashed  ------------> recovery_codes
```

1. **Generate the secret** on the server with a cryptographically secure random generator (`crypto.randomBytes`, `secrets.token_bytes`, `SecureRandom`, `random_bytes`), never `Math.random` or `random.random`. Base32-encode it for the user.
2. **Store it encrypted.** The server needs the secret itself to compute codes, so it can't be hashed like a password. Encrypt it with a key kept outside the database (a KMS, or an environment secret), so a database dump alone doesn't hand out every user's second factor. Keep it as *pending* until step 5.
3. **Build the `otpauth://` URI** and show it as a QR code:
   ```
   otpauth://totp/Acme%20Inc:alice%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Acme%20Inc
   ```
   - The label is `issuer:account`, each part percent-encoded. The colon between them stays as is.
   - Always set the `issuer` parameter as well as the label prefix. Apps use it to group and name the entry.
   - Leave out `algorithm`, `digits` and `period` when they are the defaults (SHA1, 6, 30). Some apps reject URIs that set them even to the default values.
   - Render the QR on the server or in the page's own code. Don't send the URI to a third-party QR image service: the secret is in it.
4. **Show the secret as text too**, grouped in fours (`JBSW Y3DP EHPK 3PXP`), for users who can't scan.
5. **Confirm before enabling.** Ask for the current code and verify it against the pending secret. Only then make it the active secret. This catches a failed scan, an app that ignored a setting, or a phone with the wrong time, before the user is locked out.
6. **Issue recovery codes** (see [below](#recovery-and-account-management)).
7. Send the user an email saying 2FA was turned on.

Never show the QR or secret again after enrolment. To move to a new phone, the user re-enrols, which creates a new secret.

## Login

1. Check the password first, as usual. Don't say whether the password was right until the second factor is done, or say it the same way either way, so an attacker can't use the 2FA prompt to confirm a password.
2. **Rate-limit** the code check per account, not only per IP address (RFC 4226 section 7.3). A 6-digit code has a million values and the window below accepts three of them, so an unthrottled attacker gets in after about 330,000 guesses on average. Five failures, then a delay or a lock that grows with each further failure, is typical.
3. **Accept a small window.** Allow the previous and the next time step as well as the current one, to cover clock drift and the time the user takes to type (RFC 6238 section 5.2). One step either side, ±30 seconds, is the usual value. Don't go wider without a reason: every extra step is another valid code for an attacker to guess.
4. **Reject reused codes.** RFC 6238 section 5.2 says the verifier must not accept the second attempt of a code that was already accepted. Store the time step of the last code that succeeded and only accept a step greater than it. Do the check and the update atomically (one `UPDATE ... WHERE last_used_step < ?` or a row lock), so two simultaneous requests with the same code can't both pass.
5. **Compare in constant time** (`crypto.timingSafeEqual`, `hmac.compare_digest`) so response timing doesn't leak how many leading digits were right. The loop in the examples stops at the first step that matches, so timing can still hint at *which* step matched. That only tells an attacker about a code that was already correct, so it gives nothing away, but you can check every step before returning if you'd rather not have the difference.
6. Treat the code as a string. Strip spaces, and keep leading zeros: `012345` is not `12345`.

If the matched step is the previous or next one, the user's clock is off. You can store the offset and centre the next check on it (RFC 6238 section 6), but with NTP-synced phones the ±1 window is usually enough. Keep your own servers on NTP too: a server clock that drifts locks everyone out.

## Code: Node.js

`otp.mjs`, using only `node:crypto`:

```js
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(text) {
  const bytes = [];
  let bits = 0;
  let value = 0;
  for (const char of text.replace(/[\s=-]/g, '').toUpperCase()) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) throw new Error('Invalid Base32 secret');
    value = ((value << 5) | index) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

// RFC 4226 section 4: 160-bit secret from a CSPRNG.
export const generateSecret = () => base32Encode(randomBytes(20));

// RFC 4226 section 5.3: HMAC the 8-byte counter, then dynamic truncation.
export function hotp(key, counter, digits = 6, algorithm = 'sha1') {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac(algorithm, key).update(message).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** digits).padStart(digits, '0');
}

// RFC 6238 section 4: the counter is the number of 30-second steps since the Unix epoch.
export const timeStep = (nowMs = Date.now(), period = 30) => Math.floor(nowMs / 1000 / period);

const sameCode = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Returns the matched time step, or null. Store the step and pass it back as lastUsedStep
 * so the same code can't be used twice (RFC 6238 section 5.2).
 */
export function verifyTotp(key, code, lastUsedStep, { nowMs = Date.now(), period = 30, window = 1 } = {}) {
  const current = timeStep(nowMs, period);
  for (let step = current - window; step <= current + window; step++) {
    if (step > lastUsedStep && sameCode(hotp(key, step), code)) return step;
  }
  return null;
}

export function otpauthUri({ issuer, account, secret }) {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  // Percent-encode with encodeURIComponent, not URLSearchParams: the Key URI Format wants
  // spaces as %20, and URLSearchParams writes them as +, which some apps show literally.
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;
}
```

Using it:

```js
import { base32Decode, generateSecret, otpauthUri, verifyTotp } from './otp.mjs';

// Enrolment
const secret = generateSecret();                       // store encrypted, as pending
const uri = otpauthUri({ issuer: 'Acme Inc', account: user.email, secret });
// render `uri` as a QR code, show `secret` as text, then verify a first code

// Login, after the password check and the rate limit
const step = verifyTotp(base32Decode(user.otpSecret), submittedCode.replace(/\s/g, ''), user.lastUsedStep);
if (step === null) return reject();
await db.query(
  'UPDATE users SET last_used_step = $1 WHERE id = $2 AND last_used_step < $1',
  [step, user.id],
); // zero rows updated means another request used this code first: reject
```

Start `lastUsedStep` at `-1` for a newly enrolled user, or at the step of the enrolment code so that code can't be used to log in.

## Code: Python

`otp.py`, standard library only. It needs Python 3.10 or later for the `int | None` type hints.

```python
import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote


def generate_secret(num_bytes: int = 20) -> str:
    """RFC 4226 section 4: 160-bit secret from a CSPRNG, Base32 without padding."""
    return base64.b32encode(secrets.token_bytes(num_bytes)).decode().rstrip("=")


def decode_secret(secret: str) -> bytes:
    cleaned = "".join(secret.split()).replace("-", "").rstrip("=").upper()
    return base64.b32decode(cleaned + "=" * (-len(cleaned) % 8))


def hotp(key: bytes, counter: int, digits: int = 6, digest=hashlib.sha1) -> str:
    """RFC 4226 section 5.3: HMAC the 8-byte counter, then dynamic truncation."""
    mac = hmac.new(key, struct.pack(">Q", counter), digest).digest()
    offset = mac[-1] & 0x0F
    binary = struct.unpack(">I", mac[offset:offset + 4])[0] & 0x7FFFFFFF
    return str(binary % 10**digits).zfill(digits)


def time_step(now: float | None = None, period: int = 30) -> int:
    """RFC 6238 section 4: number of 30-second steps since the Unix epoch."""
    return int((time.time() if now is None else now) // period)


def verify_totp(key: bytes, code: str, last_used_step: int, now: float | None = None,
                period: int = 30, window: int = 1) -> int | None:
    """Return the matched time step, or None. Store it as last_used_step to block replays."""
    current = time_step(now, period)
    for step in range(current - window, current + window + 1):
        if step > last_used_step and hmac.compare_digest(hotp(key, step), code):
            return step
    return None


def otpauth_uri(issuer: str, account: str, secret: str) -> str:
    label = f"{quote(issuer)}:{quote(account)}"
    return f"otpauth://totp/{label}?secret={secret}&issuer={quote(issuer)}"
```

`hmac.compare_digest` is the constant-time comparison. `secrets` is the CSPRNG; don't use `random`.

## HOTP (counter-based)

Use HOTP only when the device has no clock, such as some hardware tokens. Each press of the button on the token moves its counter forward, and your server has to keep up:

- **Look ahead.** Users press the button without logging in, so the token gets ahead of the server. Check the next few counter values (RFC 4226 section 7.4 calls this the look-ahead window `s`). 10 is a common value.
- **Resync.** When a code matches at counter `c`, store `c + 1` as the next counter. That also stops replay, because no older counter is ever checked again.
- **Don't look behind.** Codes for counters below the stored one have either been used or skipped, and accepting them would allow replay.
- The look-ahead window adds valid codes the same way the TOTP window does, so keep it small and keep the rate limit.

```js
// Returns the next counter to store, or null.
function verifyHotp(key, code, counter, lookAhead = 10) {
  for (let candidate = counter; candidate <= counter + lookAhead; candidate++) {
    if (sameCode(hotp(key, candidate), code)) return candidate + 1;
  }
  return null;
}
```

If the token gets further ahead than the window, RFC 4226 section 7.4 suggests asking for two or three consecutive codes and searching a wider range for that sequence.

The URI uses `hotp` and must include the starting counter: `otpauth://hotp/Acme:alice?secret=...&issuer=Acme&counter=0`.

## Recovery and account management

Phones get lost. Without a recovery path, 2FA becomes a support queue or a permanent lockout.

- **Recovery codes.** At enrolment, generate about 10 single-use codes, each with at least 50 bits of randomness (for example 10 characters from a 32-character alphabet, shown as `k7mq-x2fp-9d`). Show them once, tell the user to save them, and store only their hashes, like passwords. Accept one in place of a TOTP code, mark it used, and count it against the same rate limit. Let the user regenerate the set, which invalidates the old one.
- **Re-authenticate for changes.** Ask for the password and a current code (or a recovery code) before turning 2FA off, re-enrolling, or regenerating recovery codes.
- **Notify.** Email the user whenever 2FA is turned on or off, re-enrolled, or a recovery code is used.
- **Support resets** are the weakest point of the whole scheme. Decide in advance what proof you need before support removes a user's 2FA, and log every reset.
- **Remember this device**, if you offer it, should set a signed, expiring, per-device token. Don't skip 2FA based on IP address.

## Security checklist

- [ ] Secret from a CSPRNG, at least 128 bits, 160 recommended (RFC 4226 section 4)
- [ ] Secret encrypted at rest, with the key outside the database
- [ ] QR code rendered on your own server or page, never by a third-party service
- [ ] 2FA only enabled after the user enters a correct code
- [ ] Window of ±1 time step, no wider (RFC 6238 section 5.2)
- [ ] Each code accepted at most once, with an atomic check and update (RFC 6238 section 5.2)
- [ ] Rate limit and lockout per account (RFC 4226 section 7.3)
- [ ] Constant-time comparison
- [ ] Codes handled as strings, leading zeros kept
- [ ] Server clock synced with NTP
- [ ] Hashed, single-use recovery codes
- [ ] Re-authentication and email notice for every 2FA change
- [ ] Secrets and codes kept out of logs, error reports and analytics

## Testing your implementation

**RFC test vectors.** The secret is the ASCII string `12345678901234567890` (Base32 `GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ`).

HOTP, 6 digits, from RFC 4226 appendix D:

| Counter | Code |
|---|---|
| 0 | 755224 |
| 1 | 287082 |
| 2 | 359152 |
| 3 | 969429 |
| 4 | 338314 |
| 5 | 254676 |
| 6 | 287922 |
| 7 | 162583 |
| 8 | 399871 |
| 9 | 520489 |

TOTP, SHA1, 8 digits, 30-second period, from RFC 6238 appendix B:

| Unix time | Code |
|---|---|
| 59 | 94287082 |
| 1111111109 | 07081804 |
| 1111111111 | 14050471 |
| 1234567890 | 89005924 |
| 2000000000 | 69279037 |
| 20000000000 | 65353130 |

The SHA256 and SHA512 vectors use longer keys: the same digits repeated to 32 and 64 bytes. At time 59 they give `46119246` and `90693936`. The last row (year 2603) checks that your counter doesn't overflow 32 bits.

**Against a real app.** Generate a secret on your server, paste it into [OTP QR Studio](https://ragedpanda.github.io/otp-qr/) and scan the QR with the authenticator app you expect users to use. The code your server accepts, the app's code and the page's expected code should all agree. If the app's code differs from both, the app ignored one of your settings (see [The settings to use](#the-settings-to-use)).

**Tests to write:**

- The current, previous and next step are accepted; two steps away is rejected.
- The same code is rejected the second time, including two requests at the same moment.
- A code with a leading zero is accepted.
- After five wrong codes, even the correct code is refused until the lock ends.
- A used recovery code can't be used again.
