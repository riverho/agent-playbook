#!/usr/bin/env node
// scripts/test-pack-staleness.mjs
// ----------------------------------------------------------------------------
// The bundle cache must depend on the bundle's INPUTS, not on the version number.
//
// This is a regression test for a bug that actually shipped, twice. `pack-dsh-plugin`
// judged its cached bundle up to date when `engineVersionOf(bundle) === repoVersion`.
// Editing an engine file without bumping the version therefore skipped the rebuild, and
// the tarball carried a stale copy while every gate stayed green — the plugin's bundled
// README went out two minor versions behind its own source.
//
// So the test edits a bundled input WITHOUT touching the version and requires a rebuild.
// It restores the file in a `finally`, and rebuilds afterwards so the checkout is left
// consistent even if an assertion fails.
// ----------------------------------------------------------------------------

import { copyFileSync, existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

let pass = 0;
let fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { console.log(`  PASS  ${name}`); pass++; }
  else { console.error(`  FAIL  ${name}${extra ? `\n        ${extra}` : ''}`); fail++; }
}

const REPO = resolve('.');
const PACK = join(REPO, 'scripts', 'pack-dsh-plugin.mjs');
const SOURCE = join(REPO, 'INSTALL.md');                          // a bundled input: small, stable
const BUNDLED = join(REPO, 'dsh-plugin', 'engine', 'INSTALL.md'); // its copy inside the bundle
const STAMP = join(REPO, 'dsh-plugin', '.bundle-stamp');
const MARKER = '<!-- staleness probe -->';

const pack = () => {
  const r = spawnSync(process.execPath, [PACK], { cwd: REPO, encoding: 'utf8' });
  return { status: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
};
const version = () => JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')).version;
const bundledText = () => (existsSync(BUNDLED) ? readFileSync(BUNDLED, 'utf8') : '');

// --- settle first, so the "unchanged" case is a real observation ---------------
pack();
const v0 = version();
ok('a bundle stamp is written', existsSync(STAMP), STAMP);
ok('the stamp lives OUTSIDE engine/ (so it is never published)',
  !existsSync(join(REPO, 'dsh-plugin', 'engine', '.bundle-stamp')));

{
  const r = pack();
  ok('an unchanged tree does NOT rebuild (the cache still works)',
    /sources unchanged/.test(r.out), r.out.slice(-300));
}

// --- the regression: content changes, version does not ------------------------
const original = readFileSync(SOURCE, 'utf8');
const backup = `${SOURCE}.staleness-test.bak`;
copyFileSync(SOURCE, backup);
try {
  writeFileSync(SOURCE, `${original}\n${MARKER}\n`, 'utf8');
  ok('the version is UNCHANGED for this edit (otherwise the test proves nothing)',
    version() === v0, `version=${version()}`);

  const r = pack();
  ok('editing a bundled source WITHOUT a version bump triggers a rebuild',
    /sources changed/.test(r.out), r.out.slice(-400));
  ok('the rebuilt bundle carries the edit (a stale tarball is now impossible)',
    bundledText().includes(MARKER));
} finally {
  writeFileSync(SOURCE, original, 'utf8');
  try { unlinkSync(backup); } catch { /* nothing to clean */ }
}

// --- restoring must resync the bundle, and then settle ------------------------
{
  pack();
  ok('restoring the source rebuilds the bundle back to a matching copy',
    !bundledText().includes(MARKER),
    'the bundle still carries the probe marker');
  const r = pack();
  ok('the cache settles afterwards (no rebuild loop)',
    /sources unchanged/.test(r.out), r.out.slice(-300));
  ok('the bundled copy matches the source byte for byte',
    readFileSync(SOURCE, 'utf8') === bundledText());
}

console.log(`\ntest-pack-staleness: ${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
