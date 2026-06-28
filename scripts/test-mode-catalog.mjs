#!/usr/bin/env node
// scripts/test-mode-catalog.mjs
// ----------------------------------------------------------------------------
// Behavioral test for the mode catalog + two-level menu (epoch loop-20260628-001,
// task mode-catalog). Runs the REAL CLI against the real repo so the catalog is
// tested against the real playbook.yaml modes: map.
//
// Asserts:
//   1. `pb list modes` lists every mode in playbook.yaml's modes: map, each with
//      a non-empty abstract (the "which streamline set?" view).
//   2. `pb mode show <id>` prints THAT mode's resolved skill+process menu — e.g.
//      blogwatch's pack-local watch-feeds — even when it is not the active mode
//      (the "what's inside?" view).
//   3. A deliberately DESYNCED catalog (one mode dropped) makes `pb validate`
//      exit non-zero — the menu may never silently disagree with the master.
// ----------------------------------------------------------------------------

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import yaml from 'js-yaml';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const PB = resolve(root, 'scripts/pb.mjs');
const CATALOG = resolve(root, 'modes/index.yaml');

let pass = 0, fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { console.log(`  PASS  ${name}`); pass++; }
  else { console.error(`  FAIL  ${name}${extra ? `\n        ${extra}` : ''}`); fail++; }
}
function run(args) {
  try {
    const out = execSync(`node "${PB}" ${args}`, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
    return { out, code: 0 };
  } catch (e) {
    return { out: `${e.stdout || ''}${e.stderr || ''}`, code: e.status == null ? 1 : e.status };
  }
}

const master = yaml.load(readFileSync(resolve(root, 'playbook.yaml'), 'utf8'));
const masterModeIds = Object.keys(master.modes || {});
const catalog = yaml.load(readFileSync(CATALOG, 'utf8'));
const catModeIds = (catalog.modes || []).map((m) => m.id);

// 0. catalog and master agree (sanity, mirrors the validate guardrail) -----------
ok('catalog mode ids == master modes: keys',
  masterModeIds.length > 0 &&
  masterModeIds.every((id) => catModeIds.includes(id)) &&
  catModeIds.every((id) => masterModeIds.includes(id)),
  `master=[${masterModeIds}] catalog=[${catModeIds}]`);

// every catalog entry carries a non-empty abstract --------------------------------
ok('every catalog mode has a non-empty abstract',
  (catalog.modes || []).every((m) => typeof m.abstract === 'string' && m.abstract.trim()),
  JSON.stringify((catalog.modes || []).map((m) => [m.id, !!(m.abstract && m.abstract.trim())])));

// 1. pb list modes lists every registered mode -----------------------------------
const list = run('list modes');
ok('`pb list modes` exits 0', list.code === 0, `code=${list.code}`);
for (const id of masterModeIds) {
  ok(`\`pb list modes\` lists "${id}"`, new RegExp(`\\b${id}\\b`).test(list.out), list.out.trim());
}

// 2. pb mode show <id> shows that mode's pack-local menu --------------------------
const showBlog = run('mode show blogwatch');
ok('`pb mode show blogwatch` exits 0', showBlog.code === 0, `code=${showBlog.code}`);
ok('`pb mode show blogwatch` names the mode header', /Mode: blogwatch/.test(showBlog.out), showBlog.out.trim());
ok('`pb mode show blogwatch` lists pack-local skill watch-feeds',
  /watch-feeds/.test(showBlog.out), showBlog.out.trim());
ok('`pb mode show blogwatch` prints a Skills section', /Skills \(\d+\)/.test(showBlog.out), showBlog.out.trim());
ok('`pb mode show blogwatch` prints a Processes section', /Processes \(\d+\)/.test(showBlog.out), showBlog.out.trim());

// a non-active mode shown without changing the active mode (no loop mutation) -----
const showFable = run('mode show fable-5');
ok('`pb mode show fable-5` shows the named mode, not the active one',
  /Mode: fable-5/.test(showFable.out), showFable.out.trim());

// 3. a desynced catalog makes `pb validate` fail ---------------------------------
const original = readFileSync(CATALOG, 'utf8');
try {
  // Drop the first mode entry from the catalog -> catalog no longer matches master.
  const desynced = yaml.load(original);
  const dropped = desynced.modes.shift();
  writeFileSync(CATALOG, yaml.dump(desynced), 'utf8');
  const v = run('validate');
  ok(`desynced catalog (dropped "${dropped.id}") makes \`pb validate\` exit non-zero`,
    v.code !== 0, `code=${v.code}\n${v.out.trim()}`);
  ok('the validate failure names the missing mode',
    new RegExp(`${dropped.id}`).test(v.out), v.out.trim());
} finally {
  writeFileSync(CATALOG, original, 'utf8');
}
// catalog restored -> validate green again ---------------------------------------
const vAfter = run('validate');
ok('catalog restored -> `pb validate` is green again', vAfter.code === 0, `code=${vAfter.code}\n${vAfter.out.trim()}`);

console.log(`\ntest-mode-catalog: ${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
