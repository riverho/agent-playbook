#!/usr/bin/env node
// Behavioral test for `pb loop run --auto --defer-blocked`.
//
// Builds a throwaway playbook fixture INSIDE the repo (so the copied pb.mjs
// resolves js-yaml via the repo's node_modules), gives it three tasks where the
// middle one's check fails, runs the auto driver with --defer-blocked, and
// asserts the run did NOT stop at the failure: t1 → done, t2 → blocked, t3 → done.
//
// This proves the deferral semantics the OpenCode adapter relies on: a faulted
// task is skipped, not fatal, and the run drains every claimable task.

import { mkdirSync, writeFileSync, readFileSync, rmSync, copyFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(SCRIPT_DIR, '..');
const FIX = join(REPO, 'scripts', '.deferfix');

function write(rel, text) {
  const abs = join(FIX, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, text, 'utf8');
}

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  try { rmSync(FIX, { recursive: true, force: true }); } catch { /* ignore */ }
  process.exit(1);
}

try {
  rmSync(FIX, { recursive: true, force: true });
} catch { /* fresh start */ }

// --- build the fixture -----------------------------------------------------
mkdirSync(join(FIX, 'scripts'), { recursive: true });
copyFileSync(join(REPO, 'scripts', 'pb.mjs'), join(FIX, 'scripts', 'pb.mjs'));

write('playbook.yaml', `name: deferfix
version: 0.0.0
north_star: fixture
paths:
  root: .
  artifacts: artifacts
  reports: artifacts/reports
index:
  memory:
    backlog: memory/backlog.yaml
    journal: memory/journal.ndjson
    cycle: memory/cycle.md
    loops: memory/loops.yaml
guardrails:
  allowed_statuses: [todo, in_progress, blocked, done]
`);

// Passing and failing check targets (no cmd-special chars in the check strings).
write('pass.mjs', 'process.exit(0);\n');
write('fail.mjs', 'process.exit(1);\n');

write('memory/backlog.yaml', `tasks:
  - id: t1
    title: first (passes)
    status: todo
    priority: 1
    acceptance_checks:
      - node pass.mjs
  - id: t2
    title: second (fails - should be deferred)
    status: todo
    priority: 2
    acceptance_checks:
      - node fail.mjs
  - id: t3
    title: third (passes - must still run after t2 fails)
    status: todo
    priority: 3
    acceptance_checks:
      - node pass.mjs
`);

write('memory/journal.ndjson', '');

write('memory/loops.yaml', `active: L1
loops:
  - id: L1
    status: active
    started_at: "2020-01-01T00:00:00.000Z"
    closed_at: null
    goal: fixture
`);

write('memory/cycle.md', `---
phase: 1
started: "2020-01-01T00:00:00.000Z"
goal: "fixture"
stop: "fixture"
---
# Cycle Brief — phase 1
## 5. Conflicts with my own (agent) memory?
None.
`);

// --- run the auto driver with deferral -------------------------------------
let out = '';
try {
  out = execFileSync(process.execPath, [join(FIX, 'scripts', 'pb.mjs'), 'loop', 'run', '--auto', '--defer-blocked', '--retry', '0'], { encoding: 'utf8' });
} catch (e) {
  out = [e.stdout, e.stderr].filter(Boolean).map(String).join('\n');
  // A non-zero exit is acceptable; we assert on the journal, not the exit code.
}

// --- assert on the journal -------------------------------------------------
const journalPath = join(FIX, 'memory', 'journal.ndjson');
if (!existsSync(journalPath)) fail('no journal produced');
const entries = readFileSync(journalPath, 'utf8')
  .split(/\r?\n/).filter((l) => l.trim())
  .map((l) => JSON.parse(l));

const statusOf = (id) => {
  const e = entries.filter((x) => x.task === id).pop();
  return e ? e.status : '(none)';
};

const expect = { t1: 'done', t2: 'blocked', t3: 'done' };
for (const [id, want] of Object.entries(expect)) {
  const got = statusOf(id);
  if (got !== want) {
    console.error('--- driver output ---\n' + out);
    fail(`task ${id}: expected ${want}, got ${got} (the run likely stopped at the blocked task instead of deferring)`);
  }
}

if (!/Status: stalled/.test(out)) {
  console.error('--- driver output ---\n' + out);
  fail('expected terminal status "stalled" (a task was deferred, so the backlog did not fully drain)');
}

rmSync(FIX, { recursive: true, force: true });
console.log('PASS: defer-blocked skips the failed task (t2 blocked) and still completes t1 and t3; run ends stalled.');
