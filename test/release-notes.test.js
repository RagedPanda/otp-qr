import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractReleaseNotes } from '../scripts/release-notes.js';

const CHANGELOG = `# Changelog

## [Unreleased]

## [1.1.0] - 2026-11-01

### Added

- Thing.

## [1.0.0] - 2026-10-27

- First.

[unreleased]: https://example.com
`;

test('extracts a section up to the next heading or link list', () => {
  assert.equal(extractReleaseNotes(CHANGELOG, '1.1.0'), '### Added\n\n- Thing.');
  assert.equal(extractReleaseNotes(CHANGELOG, '1.0.0'), '- First.');
});

test('missing or empty sections give undefined', () => {
  assert.equal(extractReleaseNotes(CHANGELOG, '9.9.9'), undefined);
  assert.equal(extractReleaseNotes(CHANGELOG, 'Unreleased'), undefined);
  assert.equal(extractReleaseNotes('## [2.0.0]\n- Last.', '2.0.0'), '- Last.');
});

test('the CLI prints the notes, or fails for a missing version', async () => {
  const { spawnSync } = await import('node:child_process');
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const script = new URL('../scripts/release-notes.js', import.meta.url).pathname;
  const directory = mkdtempSync(join(tmpdir(), 'release-notes-'));
  writeFileSync(join(directory, 'CHANGELOG.md'), CHANGELOG);
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { cwd: directory, encoding: 'utf8' });
  const found = run('1.0.0');
  assert.equal(found.status, 0);
  assert.equal(found.stdout, '- First.\n');
  const missing = run('9.9.9');
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /no entries for 9\.9\.9/);
  assert.equal(run().status, 1);
});
