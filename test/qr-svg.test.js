import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dotCoordinates, isFinderModule, logoArea, logoRect, renderQrSvg } from '../src/qr-svg.js';

const SIZE = 21;
const allDark = () => true;
const count = (text, pattern) => (text.match(pattern) ?? []).length;

test('isFinderModule covers the three corners only', () => {
  assert.equal(isFinderModule(0, 0, SIZE), true);
  assert.equal(isFinderModule(6, 20, SIZE), true);
  assert.equal(isFinderModule(20, 6, SIZE), true);
  assert.equal(isFinderModule(20, 20, SIZE), false);
  assert.equal(isFinderModule(7, 7, SIZE), false);
  assert.equal(isFinderModule(0, 10, SIZE), false);
});

test('logoArea is an odd centred square, at least 3 wide', () => {
  assert.deepEqual(logoArea(SIZE, 0.22), { start: 8, end: 13 });
  assert.deepEqual(logoArea(SIZE, 0.01), { start: 9, end: 12 });
  assert.equal(logoArea(SIZE, 0), null);
});

test('dotCoordinates skips light modules, finders and the logo area', () => {
  assert.equal(dotCoordinates(SIZE, allDark, null).length, SIZE * SIZE - 3 * 49);
  assert.equal(dotCoordinates(SIZE, allDark, { start: 8, end: 13 }).length, SIZE * SIZE - 3 * 49 - 25);
  assert.deepEqual(dotCoordinates(SIZE, (row, col) => row === 10 && col === 3, null), [[10, 3]]);
});

test('renderQrSvg draws dots, three eyes and no logo by default', () => {
  const svg = renderQrSvg({ size: SIZE, isDark: allDark });
  assert.match(svg, /^<svg [^>]*viewBox="0 0 27 27"/);
  assert.equal(count(svg, /<circle /g), SIZE * SIZE - 3 * 49);
  assert.equal(count(svg, /stroke-width="1"/g), 3);
  assert.equal(count(svg, /<image /g), 0);
});

test('renderQrSvg adds an escaped logo and clears the modules under it', () => {
  const svg = renderQrSvg({ size: SIZE, isDark: allDark }, { logoHref: 'https://x.test/a.png?a=1&b="2"', margin: 0 });
  assert.equal(count(svg, /<circle /g), SIZE * SIZE - 3 * 49 - 25);
  assert.match(svg, /<image href="https:\/\/x\.test\/a\.png\?a=1&amp;b=&quot;2&quot;"/);
  assert.match(svg, /viewBox="0 0 21 21"/);
});

test('logoRect insets the image inside the badge', () => {
  const { badge, image } = logoRect({ start: 8, end: 13 }, 3);
  assert.deepEqual(badge, { x: 11.2, y: 11.2, size: 4.6, radius: 1.4000000000000001 });
  assert.deepEqual(image, { x: 11.6, y: 11.6, size: 3.8 });
});
