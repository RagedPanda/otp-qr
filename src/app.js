// DOM wiring. Everything with logic lives in the other modules; this file reads the form,
// calls them and writes the results back to the page.

import { base32Decode, base32Encode, isValidBase32, normalizeBase32 } from './base32.js';
import {
  concealCode,
  describeVerification,
  fileBaseName,
  formatCode,
  missingFieldMessage,
  recommendedSecretBytes,
  secretStrength,
} from './display.js';
import { randomAccountName } from './names.js';
import { hotp, secondsRemaining, timeStep, verifyCode } from './otp.js';
import { logoArea, logoRect, renderQrSvg, STYLE_DEFAULTS } from './qr-svg.js';
import { buildOtpUri } from './uri.js';

const BADGE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
  '<stop offset="0" stop-color="#4f46e5"/><stop offset="1" stop-color="#9333ea"/></linearGradient></defs>' +
  '<rect width="64" height="64" rx="16" fill="url(#g)"/>' +
  '<path d="M32 13 47 19v11c0 10-6.5 17.5-15 21-8.5-3.5-15-11-15-21V19Z" fill="none" stroke="#fff" stroke-width="4" stroke-linejoin="round"/>' +
  '<rect x="25" y="29" width="14" height="11" rx="2.5" fill="#fff"/>' +
  '<path d="M28 29v-3a4 4 0 0 1 8 0v3" fill="none" stroke="#fff" stroke-width="3"/></svg>';
const BADGE_URI = `data:image/svg+xml,${encodeURIComponent(BADGE_SVG)}`;
const BLANK_URI = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
const PNG_SIZE = 1024;
const HOTP_LOOK_AHEAD = 10;

const byId = (id) => document.getElementById(id);
const elements = Object.fromEntries(
  [
    'issuer', 'account', 'secret', 'image', 'lock', 'counter', 'random-account', 'random-secret', 'toggle-secret',
    'copy-secret', 'secret-hint', 'period-field', 'counter-field', 'qr', 'qr-empty', 'qr-empty-text', 'label-account',
    'label-issuer', 'label-chips', 'copy-uri', 'download-png', 'download-svg', 'uri', 'verify-form', 'verify-code',
    'verify-result', 'ring', 'ring-progress', 'ring-label', 'expected-title', 'expected-code', 'expected-next',
    'counter-controls', 'counter-down', 'counter-up', 'theme-toggle', 'toast',
  ].map((id) => [id, byId(id)]),
);

// --- Edges: randomness, clipboard, downloads, storage ---

const randomBytes = (length) => crypto.getRandomValues(new Uint8Array(length));

/** Unbiased integer in [0, limit) via rejection sampling. */
const randomInt = (limit) => {
  const ceiling = Math.floor(0x100000000 / limit) * limit;
  for (;;) {
    const [value] = crypto.getRandomValues(new Uint32Array(1));
    if (value < ceiling) return value % limit;
  }
};

let toastTimer = 0;
const showToast = (message) => {
  elements.toast.textContent = message;
  elements.toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove('visible'), 1800);
};

const copyText = async (text, message) => {
  try {
    await navigator.clipboard.writeText(text);
    showToast(message);
  } catch {
    showToast('Copy failed: your browser blocked clipboard access');
  }
};

const downloadBlob = (blob, fileName) => {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
};

const storage = {
  get: (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Private mode or blocked storage: the theme just won't be remembered.
    }
  },
};

// --- Reading the form ---

const radioValue = (name) => document.querySelector(`input[name="${name}"]:checked`).value;

const readSettings = () => ({
  type: radioValue('type'),
  algorithm: radioValue('algorithm'),
  digits: Number(radioValue('digits')),
  period: Number(radioValue('period')),
  counter: Math.max(0, Math.floor(Number(elements.counter.value) || 0)),
  issuer: elements.issuer.value.trim(),
  account: elements.account.value.trim(),
  secret: normalizeBase32(elements.secret.value),
  image: elements.image.value.trim(),
  lock: elements.lock.checked,
});

// --- State shared by the renderers ---

const state = {
  settings: null,
  secretBytes: null,
  matrix: null,
  hotpCounter: 0,
  revealed: true,
  shownKey: '',
};

const settingsKey = (settings) => JSON.stringify(settings);

// --- QR code ---

const encodeMatrix = (text) => {
  globalThis.qrcode.stringToBytes = globalThis.qrcode.stringToBytesFuncs['UTF-8'];
  const encoder = globalThis.qrcode(0, 'H');
  encoder.addData(text, 'Byte');
  encoder.make();
  return { size: encoder.getModuleCount(), isDark: (row, col) => encoder.isDark(row, col) };
};

const logoFor = (settings) => settings.image || BADGE_URI;

const renderChips = (settings) => {
  const chips = [
    settings.type === 'totp' ? `TOTP · ${settings.period}s` : `HOTP · from ${settings.counter}`,
    settings.algorithm,
    `${settings.digits} digits`,
    ...(settings.lock ? ['Locked'] : []),
  ];
  elements['label-chips'].replaceChildren(
    ...chips.map((text) => Object.assign(document.createElement('span'), { className: 'chip', textContent: text })),
  );
};

const setQrAvailable = (available, message = '') => {
  elements.qr.hidden = !available;
  elements['qr-empty'].hidden = available;
  elements['qr-empty-text'].textContent = message;
  for (const id of ['copy-uri', 'download-png', 'download-svg', 'verify-code']) elements[id].disabled = !available;
  elements['verify-form'].querySelector('button').disabled = !available;
};

const renderSecretHint = (secretBytes, secretEmpty) => {
  const hint = elements['secret-hint'];
  const strength = secretBytes ? secretStrength(secretBytes.length) : null;
  hint.textContent = strength ? strength.text : secretEmpty ? '' : 'Not valid Base32.';
  hint.classList.toggle('error', !strength || strength.tone === 'error');
  elements.secret.setAttribute('aria-invalid', String(!secretEmpty && !secretBytes));
};

const render = () => {
  const settings = readSettings();
  const secretEmpty = settings.secret === '';
  const secretValid = isValidBase32(settings.secret);
  const secretBytes = secretValid ? base32Decode(settings.secret) : null;

  elements['period-field'].hidden = settings.type !== 'totp';
  elements['counter-field'].hidden = settings.type !== 'hotp';
  elements['counter-controls'].hidden = settings.type !== 'hotp';
  elements['verify-code'].maxLength = settings.digits + 1;
  elements['verify-code'].placeholder = '0'.repeat(settings.digits);
  elements['label-account'].textContent = settings.account || 'No account yet';
  elements['label-issuer'].textContent = settings.issuer;
  renderChips(settings);
  renderSecretHint(secretBytes, secretEmpty);

  const previous = state.settings;
  if (!previous || previous.secret !== settings.secret || previous.counter !== settings.counter ||
      previous.type !== settings.type || previous.algorithm !== settings.algorithm) {
    state.hotpCounter = settings.counter;
    elements['verify-result'].hidden = true;
  }
  state.settings = settings;
  state.secretBytes = secretBytes;

  const missing = missingFieldMessage({ account: settings.account, secretValid, secretEmpty });
  if (missing) {
    state.matrix = null;
    elements.uri.textContent = '';
    setQrAvailable(false, missing);
    return;
  }

  const uri = buildOtpUri(settings);
  elements.uri.textContent = uri;
  try {
    state.matrix = encodeMatrix(uri);
  } catch {
    state.matrix = null;
    setQrAvailable(false, 'Too much data for one QR code. Shorten the image URL, issuer or account.');
    return;
  }
  elements.qr.innerHTML = renderQrSvg(state.matrix, { logoHref: logoFor(settings) });
  setQrAvailable(true);
};

// --- Live expected code ---

const counterNow = (settings) =>
  settings.type === 'totp' ? timeStep(Date.now(), settings.period) : state.hotpCounter;

const renderRing = (settings) => {
  if (settings.type === 'totp') {
    const remaining = secondsRemaining(Date.now(), settings.period);
    elements['ring-progress'].style.strokeDashoffset = String(100 - (remaining / settings.period) * 100);
    elements['ring-label'].textContent = String(remaining);
    elements.ring.classList.toggle('low', remaining <= 5);
  } else {
    elements['ring-progress'].style.strokeDashoffset = '0';
    elements['ring-label'].textContent = `#${state.hotpCounter}`;
    elements.ring.classList.remove('low');
  }
};

const renderExpected = async () => {
  const { settings, secretBytes } = state;
  if (!settings) return;
  renderRing(settings);
  const counter = counterNow(settings);
  const key = `${settingsKey(settings)}|${counter}|${state.revealed}|${Boolean(secretBytes)}`;
  if (key === state.shownKey) return;
  state.shownKey = key;

  const options = { algorithm: settings.algorithm, digits: settings.digits };
  elements['expected-title'].textContent = settings.type === 'totp' ? 'Expected code now' : `Expected code at counter ${counter}`;
  if (!secretBytes) {
    elements['expected-code'].textContent = concealCode(settings.digits);
    elements['expected-next'].textContent = 'Needs a valid secret.';
    return;
  }
  const [current, next] = await Promise.all([hotp(secretBytes, counter, options), hotp(secretBytes, counter + 1, options)]);
  if (key !== state.shownKey) return;
  elements['expected-code'].textContent = state.revealed ? formatCode(current) : concealCode(settings.digits);
  elements['expected-code'].classList.toggle('concealed', !state.revealed);
  elements['expected-next'].textContent = state.revealed
    ? `${settings.type === 'totp' ? 'Next' : 'Then'}: ${formatCode(next)}`
    : 'Hidden. Click to show.';
};

// --- Verification ---

const RESULT_ICONS = {
  valid: '<path d="M5 12.5 10 17 19 7"/>',
  drift: '<path d="M12 7v6M12 17h.01"/><circle cx="12" cy="12" r="9"/>',
  invalid: '<path d="M7 7l10 10M17 7 7 17"/>',
};

const showResult = ({ tone, title, detail }) => {
  const box = elements['verify-result'];
  box.className = `verify-result ${tone}`;
  box.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${RESULT_ICONS[tone]}</svg><div><strong></strong><span class="detail"></span></div>`;
  box.querySelector('strong').textContent = title;
  box.querySelector('.detail').textContent = detail;
  box.hidden = false;
};

const verify = async () => {
  const { settings, secretBytes } = state;
  const code = elements['verify-code'].value.replace(/\s/g, '');
  if (!secretBytes || !settings) return;
  if (!new RegExp(`^\\d{${settings.digits}}$`).test(code)) {
    showResult({ tone: 'invalid', title: `Enter all ${settings.digits} digits`, detail: 'Type the code exactly as your app shows it.' });
    return;
  }
  const isTotp = settings.type === 'totp';
  const result = await verifyCode(code, secretBytes, {
    counter: counterNow(settings),
    window: isTotp ? 1 : HOTP_LOOK_AHEAD,
    lookBehind: isTotp,
    algorithm: settings.algorithm,
    digits: settings.digits,
  });
  if (result.valid && !isTotp) state.hotpCounter += result.offset + 1;
  showResult(describeVerification(result, settings));
  if (result.valid) elements['verify-code'].value = '';
  renderExpected();
};

// --- Downloads ---

const loadImage = (source, crossOrigin) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    if (crossOrigin) image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = source;
  });

const svgForExport = (settings, logoHref) =>
  renderQrSvg(state.matrix, { logoHref }).replace('<svg ', `<svg width="${PNG_SIZE}" height="${PNG_SIZE}" `);

/** A custom logo can't load inside an SVG drawn to canvas, so it is drawn on top separately when CORS allows. */
const drawCustomLogo = async (context, settings) => {
  const area = logoArea(state.matrix.size, STYLE_DEFAULTS.logoRatio);
  const { image } = logoRect(area, STYLE_DEFAULTS.margin);
  const scale = PNG_SIZE / (state.matrix.size + STYLE_DEFAULTS.margin * 2);
  const box = image.size * scale;
  try {
    const logo = await loadImage(settings.image, true);
    const aspect = logo.naturalWidth / logo.naturalHeight || 1;
    const width = box * Math.min(1, aspect);
    const height = box * Math.min(1, 1 / aspect);
    context.drawImage(logo, image.x * scale + (box - width) / 2, image.y * scale + (box - height) / 2, width, height);
    return true;
  } catch {
    return false;
  }
};

const downloadPng = async () => {
  const { settings } = state;
  if (!state.matrix) return;
  const custom = Boolean(settings.image);
  const svg = svgForExport(settings, custom ? BLANK_URI : BADGE_URI);
  const canvas = Object.assign(document.createElement('canvas'), { width: PNG_SIZE, height: PNG_SIZE });
  const context = canvas.getContext('2d');
  context.drawImage(await loadImage(`data:image/svg+xml,${encodeURIComponent(svg)}`), 0, 0);
  const logoDrawn = custom ? await drawCustomLogo(context, settings) : true;
  canvas.toBlob((blob) => {
    downloadBlob(blob, `${fileBaseName(settings.issuer, settings.account)}.png`);
    showToast(logoDrawn ? 'PNG downloaded' : 'PNG downloaded without the logo: its server blocks cross-origin use');
  }, 'image/png');
};

const downloadSvg = () => {
  const { settings } = state;
  if (!state.matrix) return;
  const blob = new Blob([svgForExport(settings, logoFor(settings))], { type: 'image/svg+xml' });
  downloadBlob(blob, `${fileBaseName(settings.issuer, settings.account)}.svg`);
  showToast('SVG downloaded');
};

// --- Actions ---

const newSecret = () => {
  elements.secret.value = base32Encode(randomBytes(recommendedSecretBytes(radioValue('algorithm'))));
  render();
};

const setSecretVisible = (visible) => {
  elements.secret.type = visible ? 'text' : 'password';
  elements['toggle-secret'].setAttribute('aria-pressed', String(visible));
  elements['toggle-secret'].title = visible ? 'Hide secret' : 'Show secret';
};

const applyTheme = (theme) => {
  if (theme) document.documentElement.dataset.theme = theme;
};

const toggleTheme = () => {
  const current =
    document.documentElement.dataset.theme ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  storage.set('otp-qr-theme', next);
};

const stepCounter = (delta) => {
  state.hotpCounter = Math.max(0, state.hotpCounter + delta);
  renderExpected();
};

// --- Wiring ---

const listen = (element, event, handler) => element.addEventListener(event, handler);

for (const input of document.querySelectorAll('input:not(#verify-code)')) listen(input, 'input', render);
listen(elements['random-account'], 'click', () => {
  elements.account.value = randomAccountName(randomInt);
  render();
});
listen(elements['random-secret'], 'click', newSecret);
listen(elements['toggle-secret'], 'click', () => setSecretVisible(elements.secret.type === 'password'));
listen(elements['copy-secret'], 'click', () => {
  if (state.settings.secret) copyText(state.settings.secret, 'Secret copied');
});
listen(elements['copy-uri'], 'click', () => copyText(elements.uri.textContent, 'otpauth:// link copied'));
listen(elements['download-png'], 'click', downloadPng);
listen(elements['download-svg'], 'click', downloadSvg);
listen(elements['verify-form'], 'submit', (event) => {
  event.preventDefault();
  verify();
});
listen(elements['verify-code'], 'input', () => {
  const digits = elements['verify-code'].value.replace(/\D/g, '');
  elements['verify-code'].value = digits;
  if (state.settings && digits.length === state.settings.digits) verify();
});
listen(elements['expected-code'], 'click', () => {
  state.revealed = !state.revealed;
  renderExpected();
});
listen(elements['counter-down'], 'click', () => stepCounter(-1));
listen(elements['counter-up'], 'click', () => stepCounter(1));
listen(elements['theme-toggle'], 'click', toggleTheme);

applyTheme(storage.get('otp-qr-theme'));
newSecret();
setInterval(renderExpected, 250);
renderExpected();
