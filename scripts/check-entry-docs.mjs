#!/usr/bin/env node
// scripts/check-entry-docs.mjs
// ----------------------------------------------------------------------------
// The entry point (`playbook.yaml`'s `entry:`, i.e. SKILL.md) is the file every agent
// reads first. It was only ever checked for EXISTENCE, which is how it fell three
// releases behind the engine: multi-agent claims, worktree lifecycle, ownership
// flagging, lock recovery, state repair and the harness plugin were all shipped and
// documented everywhere except the one file agents actually open.
//
// A doc that can drift silently is a doc that has drifted. This turns "the entry point
// covers the engine's operating surface" into an executable gate: every command and
// concept an agent must know is required to appear, so removing the capability or
// forgetting the doc fails the suite instead of waiting to be noticed.
//
// Scope is deliberately narrow: it asserts PRESENCE of the things an operator cannot
// guess, not prose quality. Wording is free.
// ----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0;
let fail = 0;
function check(name, fn) {
  try { fn(); console.log(`  PASS  ${name}`); pass++; }
  catch (e) { console.error(`  FAIL  ${name}\n        ${e.message}`); fail++; }
}

const entry = readFileSync(resolve(ROOT, 'SKILL.md'), 'utf8');

// Each entry: [group, what must be mentioned, why an agent cannot guess it].
const REQUIRED = [
  ['multi-agent', /claim token/i, 'the claim token is how a sub-agent proves entitlement'],
  ['multi-agent', /PB_CLAIM_TOKEN|--token/, 'the flag/env that carries the token'],
  ['multi-agent', /PB_AGENT_CHAIN|delegation chain/i, 'how a descendant is authorized'],
  ['multi-agent', /ownership/, 'rows are flagged when entitlement is unproven'],
  ['multi-agent', /pb release|`release`/, 'returning a claim to the pool'],
  ['multi-agent', /repair-state/, 'rebuilding the projection from the journal'],
  ['locks', /unlock/, 'the explicit escape hatch for a leaked lock'],
  ['worktrees', /worker create/, 'opening an isolated slot'],
  ['worktrees', /worker verify/, 'running the checks inside the worktree'],
  ['worktrees', /worker merge|merge-ready/, 'the gated merge'],
  ['worktrees', /--at\b/, 'recording a done whose checks ran in the worktree'],
  ['harness', /dsh-plugin|DeepSeek Harness/i, 'where the harness integration lives'],
  ['harness', /playbook action=|`playbook` tool/i, 'the tool a harness agent drives'],
  ['loop', /--claim/, 'how work is taken'],
  ['loop', /validate --task/, 'how one task is verified'],
  ['loop', /journal\.ndjson/, 'the append-only record'],
];

for (const [group, re, why] of REQUIRED) {
  check(`[${group}] the entry point covers: ${why}`, () => {
    if (!re.test(entry)) throw new Error(`no match for ${re}`);
  });
}

// The entry point must still route rather than replace the skills it indexes.
check('the entry point still points at the skills index (it routes, it does not inline)', () => {
  if (!/skills\/index\.yaml/.test(entry)) throw new Error('no reference to skills/index.yaml');
});
check('the entry point still points at project memory', () => {
  if (!/project-memory\.md/.test(entry)) throw new Error('no reference to memory/project-memory.md');
});

// Every `pb <verb>` named in the entry point must be a verb the CLI actually accepts.
// Documentation that teaches a command which does not exist is worse than no docs.
{
  const cli = readFileSync(resolve(ROOT, 'scripts', 'pb.mjs'), 'utf8');
  const help = /function cmdHelp\(\)[\s\S]*?`\);/.exec(cli)?.[0] || '';
  const named = new Set();
  for (const m of entry.matchAll(/\bpb\s+([a-z][a-z-]+)/g)) named.add(m[1]);
  check('every `pb <verb>` the entry point names exists in the CLI help', () => {
    const unknown = [...named].filter((v) => !new RegExp(`^\\s*${v}\\b`, 'm').test(help));
    if (unknown.length) throw new Error(`not in help: ${unknown.join(', ')}`);
  });
}

console.log(`\ncheck-entry-docs: ${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
