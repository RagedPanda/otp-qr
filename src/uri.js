// Build otpauth:// URIs in the Key URI Format, with FreeOTP's `image` and `lock` extensions.

export const DEFAULTS = Object.freeze({
  type: 'totp',
  issuer: '',
  account: '',
  secret: '',
  algorithm: 'SHA1',
  digits: 6,
  period: 30,
  counter: 0,
  image: '',
  lock: false,
});

const buildLabel = (issuer, account) =>
  issuer ? `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}` : encodeURIComponent(account);

/** Only parameters that differ from the defaults apps assume, so the QR stays small. */
const buildParams = ({ type, issuer, secret, algorithm, digits, period, counter, image, lock }) =>
  [
    ['secret', secret],
    ['issuer', issuer],
    ['algorithm', algorithm !== 'SHA1' && algorithm],
    ['digits', digits !== 6 && digits],
    ['period', type === 'totp' && period !== 30 && period],
    ['counter', type === 'hotp' && counter],
    ['image', image],
    ['lock', lock && 'true'],
  ].filter(([, value]) => value !== false && value !== '' && value !== undefined);

export const buildOtpUri = (fields) => {
  const settings = { ...DEFAULTS, ...fields };
  const query = buildParams(settings)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  return `otpauth://${settings.type}/${buildLabel(settings.issuer, settings.account)}?${query}`;
};
