// Render a QR module matrix as a styled SVG: dot modules, rounded finder eyes and a centre badge.
// The matrix comes from any encoder; this file only draws, so it stays pure and testable.

const FINDER_SIZE = 7;

export const STYLE_DEFAULTS = Object.freeze({
  margin: 3,
  background: '#ffffff',
  colorFrom: '#1e1b4b',
  colorTo: '#6d28d9',
  eyeColor: '#4c1d95',
  logoRatio: 0.22,
  logoHref: '',
});

/** True for modules inside one of the three 7x7 finder patterns, which are drawn separately. */
export const isFinderModule = (row, col, size) => {
  const nearStart = (index) => index < FINDER_SIZE;
  const nearEnd = (index) => index >= size - FINDER_SIZE;
  return (
    (nearStart(row) && nearStart(col)) ||
    (nearStart(row) && nearEnd(col)) ||
    (nearEnd(row) && nearStart(col))
  );
};

/** The odd-sized square of modules in the centre that the logo covers, or null without a logo. */
export const logoArea = (size, logoRatio) => {
  if (!logoRatio) return null;
  const span = Math.max(3, Math.round(size * logoRatio) | 1);
  const start = Math.floor((size - span) / 2);
  return { start, end: start + span };
};

const insideArea = (row, col, area) =>
  area !== null && row >= area.start && row < area.end && col >= area.start && col < area.end;

export const dotCoordinates = (size, isDark, area) =>
  Array.from({ length: size * size }, (_, index) => [Math.floor(index / size), index % size]).filter(
    ([row, col]) => isDark(row, col) && !isFinderModule(row, col, size) && !insideArea(row, col, area),
  );

const escapeAttribute = (value) =>
  String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const finderEye = (x, y, color) =>
  `<rect x="${x + 0.5}" y="${y + 0.5}" width="6" height="6" rx="2" fill="none" stroke="${color}" stroke-width="1"/>` +
  `<rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx="1" fill="${color}"/>`;

/** Where the badge and the logo image sit, in SVG user units (one unit per module). */
export const logoRect = (area, margin) => {
  const span = area.end - area.start;
  const origin = area.start + margin;
  const inset = span * 0.12;
  return {
    badge: { x: origin + 0.2, y: origin + 0.2, size: span - 0.4, radius: span * 0.28 },
    image: { x: origin + inset, y: origin + inset, size: span - inset * 2 },
  };
};

const logoBadge = (area, margin, href) => {
  const { badge, image } = logoRect(area, margin);
  return (
    `<rect x="${badge.x}" y="${badge.y}" width="${badge.size}" height="${badge.size}" rx="${badge.radius}" fill="#ffffff"/>` +
    `<image href="${escapeAttribute(href)}" x="${image.x}" y="${image.y}" width="${image.size}" height="${image.size}" preserveAspectRatio="xMidYMid meet"/>`
  );
};

export const renderQrSvg = ({ size, isDark }, options = {}) => {
  const style = { ...STYLE_DEFAULTS, ...options };
  const area = style.logoHref ? logoArea(size, style.logoRatio) : null;
  const total = size + style.margin * 2;
  const offset = style.margin;
  const dots = dotCoordinates(size, isDark, area)
    .map(([row, col]) => `<circle cx="${col + offset + 0.5}" cy="${row + offset + 0.5}" r="0.44"/>`)
    .join('');
  const eyes = [
    [0, 0],
    [size - FINDER_SIZE, 0],
    [0, size - FINDER_SIZE],
  ]
    .map(([x, y]) => finderEye(x + offset, y + offset, style.eyeColor))
    .join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="geometricPrecision" role="img" aria-label="QR code">` +
    `<defs><linearGradient id="qr-fill" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${style.colorFrom}"/><stop offset="1" stop-color="${style.colorTo}"/>` +
    `</linearGradient></defs>` +
    `<rect width="${total}" height="${total}" rx="${style.margin}" fill="${style.background}"/>` +
    `<g fill="url(#qr-fill)">${dots}</g>${eyes}` +
    (area ? logoBadge(area, offset, style.logoHref) : '') +
    `</svg>`
  );
};
