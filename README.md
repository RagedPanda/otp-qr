# OTP QR Studio

Make QR codes for authenticator apps, then check that the app produces the right codes. Everything runs in your browser.

**Open it: https://ragedpanda.github.io/otp-qr/**

![CI](https://github.com/RagedPanda/otp-qr/actions/workflows/ci.yml/badge.svg)

## Why

Setting up two-factor authentication by hand, for a test account, a shared service login or a server you run, means writing an `otpauth://` URI and turning it into a QR code. The usual tool for that is the [FreeOTP QR generator](https://freeotp.github.io/qrcode.html). It makes the QR code but stops there:

- **No verification.** You scan the code and hope. If the algorithm, digit count or period isn't one your app supports, or your phone's clock is off, you only find out when a real login fails.
- **Your name goes in the QR.** The account field is free text, so it usually ends up holding your email.
- **Dated UI** and a plain black-and-white QR code that you can't download.

OTP QR Studio adds a verify step that runs the same RFC 4226/6238 maths as the server would, a random account name, a styled QR code with PNG and SVG downloads, and a page that doesn't make network requests.

## Use it

1. **Account.** Enter an issuer (optional) and an account name, or press **Random** for a name like `quiet-falcon-4821`.
2. **Secret.** A random secret is generated when the page loads. Paste your own Base32 secret if you already have one, or press **New secret**.
3. **Settings.** Choose time-based (TOTP) or counter-based (HOTP), the algorithm, digit count, and period or starting counter. FreeOTP's image and lock options are under **FreeOTP extras**.
4. **Scan** the QR code with your authenticator app.
5. **Verify.** Type the code your app shows. The page tells you whether it matches:
   - **Code verified**: the app is set up correctly.
   - **Code verified, with clock drift**: the code matched the previous or next 30-second step, so your phone's clock is off by about that much. Servers usually accept this, but fix the clock.
   - **Counter moved forward** (HOTP): your app was ahead of the counter, for example because you pressed refresh a few times. The page catches up like a server would.
   - **Does not match**: you scanned a different code, or the app ignored a setting it doesn't support.

The expected code and the next one are shown under the verify box with a countdown. Click the code to hide it. For HOTP, the − and + buttons step the counter.

**Copy link** copies the `otpauth://` URI. **PNG** and **SVG** download the QR code.

### Run it locally

```sh
git clone https://github.com/RagedPanda/otp-qr.git
cd otp-qr
npm start            # serves the folder at http://localhost:3000
```

ES modules don't load from `file://`, so open the page through a local server rather than by double-clicking `index.html`.

## What it supports

| Field | Values | URI parameter |
|---|---|---|
| Type | TOTP (time), HOTP (counter) | `otpauth://totp/…`, `otpauth://hotp/…` |
| Issuer | text, optional | label prefix and `issuer` |
| Account | text, or a random name | label |
| Secret | Base32, random by default | `secret` |
| Algorithm | SHA1, SHA256, SHA384, SHA512 | `algorithm`, left out for SHA1 |
| Digits | 6, 7, 8 | `digits`, left out for 6 |
| Period | 15 s, 30 s, 60 s, 2 min | `period`, TOTP only, left out for 30 |
| Counter | 0 or more | `counter`, HOTP only, always included |
| Image | URL, optional | `image` (FreeOTP) |
| Lock | on or off | `lock=true` (FreeOTP) |

Parameters that match the defaults apps assume are left out, so the QR code stays as small as possible. The URI follows the [Key URI Format](https://github.com/google/google-authenticator/wiki/Key-Uri-Format).

Verification accepts the current TOTP step and one step on either side. For HOTP it accepts the current counter and up to 10 codes ahead, then moves the counter past the match so a code can't be used twice.

Generated secrets match the hash's output size: 160 bits for SHA1, 256 for SHA256, 384 for SHA384 and 512 for SHA512. The hint under the secret warns when a pasted one is shorter than the 128 bits RFC 4226 asks for.

## Privacy

- Secrets come from `crypto.getRandomValues`, and codes are computed with the Web Crypto API on your device.
- The page's Content Security Policy sets `connect-src 'none'`, so the browser blocks any request the page tries to send. The only thing it loads from elsewhere is the optional image URL, which your browser fetches to show the logo. That server can see the request, so leave the field empty if that matters.
- Nothing is saved except your theme choice, in `localStorage`.
- No analytics, no cookies, no dependencies loaded at runtime from a CDN.

## Good to know

- **Google Authenticator ignores algorithm, digits and period** and always uses SHA1, 6 digits and 30 seconds. If you need it to work there, keep the defaults. The verify step shows the problem straight away: the code won't match.
- **The QR code uses error-correction level H** (30% redundancy) so the logo in the middle doesn't stop scanning. A very long image URL can make the code too big; the page tells you when that happens.
- **Custom logos in PNG downloads** need the image's server to allow cross-origin use. Otherwise the PNG is saved without the logo and the page says so. SVG downloads always reference the image URL.
- **Secrets on screen.** The secret field is masked, but the QR code and the expected code are not. Clear the page when you're done if someone can see your screen.

## How it's built

Plain HTML, CSS and ES modules, with no build step.

| File | What it does |
|---|---|
| `src/base32.js` | RFC 4648 Base32 encode and decode |
| `src/otp.js` | HOTP, TOTP and code verification on Web Crypto |
| `src/uri.js` | Builds the `otpauth://` URI |
| `src/qr-svg.js` | Draws a QR module matrix as a styled SVG |
| `src/names.js` | Random account names |
| `src/display.js` | Messages, code formatting and file names |
| `src/app.js` | Connects the page to the modules above |
| `vendor/qrcode-generator.js` | QR encoder |

**One dependency:** [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) 1.4.4 by Kazuhiko Arase (MIT), vendored in `vendor/`. Writing a QR encoder (Reed–Solomon, masking, version selection) isn't worth it when this one is small and has been stable for years. Only its module matrix is used; `src/qr-svg.js` does the drawing.

### Tests

```sh
npm test             # all tests
npm run coverage     # fails below 100% line, branch or function coverage
```

The OTP code is checked against every test vector in RFC 4226 appendix D and RFC 6238 appendix B (SHA1, SHA256 and SHA512), and Base32 against RFC 4648 section 10. All modules except the DOM wiring in `src/app.js` have 100% coverage.

There's no benchmark: every operation finishes well within a frame.

## Releases

Pushing to `main` deploys the page to GitHub Pages. Versions are listed in [CHANGELOG.md](CHANGELOG.md). Pushing a `vX.Y.Z` tag creates a GitHub release with that version's changelog section.

## Related

- [FreeOTP QR generator](https://freeotp.github.io/qrcode.html): the page this one is based on. Generates the QR code but doesn't verify it.
- [FreeOTP](https://freeotp.github.io/): the authenticator app that defines the `image` and `lock` parameters.
- [otpauth](https://github.com/hectorm/otpauth): a JavaScript library for HOTP and TOTP, if you need this logic in your own code.

## License

[MIT](LICENSE)
