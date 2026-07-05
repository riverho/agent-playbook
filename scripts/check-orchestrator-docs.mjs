#!/usr/bin/env node
// scripts/check-orchestrator-docs.mjs
// ----------------------------------------------------------------------------
// Doc-conformance check (epoch loop-20260628-001, task docs-orchestrator-flow).
// Asserts ORCHESTRATOR.md and INSTALL.md teach the REAL, shipped command surface
// of the mode-agnostic orchestrator + flows — so agents look up the proper way —
// and that the machinery those docs reference actually exists. Keeps the docs
// from drifting back into blogwatch-only prose.
// ----------------------------------------------------------------------------

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
let pass = 0, fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { console.log(`  PASS  ${name}`); pass++; }
  else { console.error(`  FAIL  ${name}${extra ? `\n        ${extra}` : ''}`); fail++; }
}
function read(rel) {
  const p = resolve(root, rel);
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

const ORCH = read('ORCHESTRATOR.md');
const INSTALL = read('INSTALL.md');
const PROMPTS = read('PROMPT_BOOK.md');
ok('ORCHESTRATOR.md exists', ORCH != null);
ok('INSTALL.md exists', INSTALL != null);
ok('PROMPT_BOOK.md exists', PROMPTS != null);

// ORCHESTRATOR.md must teach the generic surface (not just blogwatch). ----------
const orchMust = [
  ['the mode menu (pb list modes)', /pb\.mjs list modes/],
  ['mode show', /mode show <id>/],
  ['the --mode runner', /pb-daily-monitor\.mjs --mode/],
  ['the scaffold descriptor', /scaffold descriptor|`scaffold`/],
  ['capability gaps -> proposals', /orchestrator-iterations\.ndjson/],
  ['the flow runner', /pb-flow\.mjs --flow/],
  ['flows directory', /flows\//],
  ['artifact-dir handoff', /handoff/i],
  ['fail-fast semantics', /fail-fast/i],
  ['one epoch per flow', /one loop epoch|one epoch/i],
  ['check-flow', /check-flow\.mjs/],
  ['the triage route for proposals', /triage/i],
];
for (const [label, re] of (ORCH ? orchMust : [])) {
  ok(`ORCHESTRATOR.md mentions ${label}`, re.test(ORCH), 'doc is out of sync with the shipped surface');
}

// INSTALL.md must point agents to the menu + the orchestrator guide. ------------
const installMust = [
  ['pb list modes', /pb\.mjs list modes/],
  ['the --mode runner', /pb-daily-monitor\.mjs --mode/],
  ['the flow runner', /pb-flow\.mjs --flow/],
  ['a pointer to ORCHESTRATOR.md', /ORCHESTRATOR\.md/],
  ['the triage skill for prose intake', /triage/i],
];
for (const [label, re] of (INSTALL ? installMust : [])) {
  ok(`INSTALL.md mentions ${label}`, re.test(INSTALL), 'install guide does not route agents to the orchestrator');
}

// PROMPT_BOOK.md must give the user NL prompts for the new surface (no raw CLI). -
const promptMust = [
  ['list modes', /list modes/i],
  ['show mode', /show mode/i],
  ['a monitor prompt', /agent-playbook monitor/i],
  ['a run-flow prompt', /run flow/i],
  ['a review-proposals prompt', /review proposals/i],
  ['a triage prompt', /agent-playbook triage/i],
];
for (const [label, re] of (PROMPTS ? promptMust : [])) {
  ok(`PROMPT_BOOK.md offers ${label}`, re.test(PROMPTS), 'prompt book is missing a prompt for the new surface');
}

// The machinery the docs reference must actually exist. -------------------------
for (const f of [
  'scripts/pb-daily-monitor.mjs', 'scripts/pb-flow.mjs', 'scripts/check-flow.mjs',
  'modes/index.yaml', 'flows/example-digest.yaml',
]) {
  ok(`referenced file exists: ${f}`, existsSync(resolve(root, f)));
}

console.log(`\ncheck-orchestrator-docs: ${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
