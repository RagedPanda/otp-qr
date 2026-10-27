# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- A [2FA integration guide](docs/2fa-integration-guide.md) for developers adding authenticator-app login to their own application, following RFC 4226 and RFC 6238, with tested Node.js and Python code, a security checklist and the RFC test vectors.
- Search and social metadata: a descriptive title and description, a canonical URL, Open Graph and Twitter cards with a preview image, schema.org structured data and a sitemap, so the page is easier to find and shows a proper preview when the link is shared.

### Changed

- The account field starts filled in with `ragedpanda.github.io/otp-qr`, so a QR code and a working verify step are ready on the first visit. Replace it, or press Random, for your own entry.
- A code is only checked when you press Verify (or Enter), not as soon as the last digit is typed. Editing the code clears the previous result, so an old "Code verified" never sits next to a different code.

## [1.0.0] - 2026-10-27

### Added

- QR codes for `otpauth://` URIs (TOTP and HOTP), drawn as SVG with dot modules, rounded finder eyes and a centre logo badge, at error-correction level H so the logo never stops a scan.
- A verify step: type the code your authenticator app shows and the page checks it against RFC 4226/6238, allowing one time step of clock drift for TOTP and a 10-code look-ahead with counter resync for HOTP.
- A live expected code with a countdown ring, the next code, and counter controls for HOTP.
- A "Random" button for the account name, so the QR doesn't have to carry your real name or email.
- Secrets generated with `crypto.getRandomValues`, sized to the chosen hash (160 bits for SHA1 up to 512 bits for SHA512), with a strength hint.
- SHA1, SHA256, SHA384 and SHA512; 6, 7 or 8 digits; 15 s to 2 min periods; FreeOTP's `image` and `lock` parameters.
- PNG and SVG downloads, and copying the `otpauth://` link or the secret.
- Light and dark themes, and a layout that works on phones.
- A Content Security Policy that blocks every network request except the optional logo image.

[unreleased]: https://github.com/RagedPanda/otp-qr/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/RagedPanda/otp-qr/releases/tag/v1.0.0
