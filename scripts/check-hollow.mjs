#!/usr/bin/env node
// pb lint:checks — detect HOLLOW acceptance_checks: a "done" gate that tests
// only playbook *structure* (pb validate) and not the task's actual work.
// Exit 1 if any actionable (todo/in_progress) task has a hollow gate.
import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';
const ROOT = process.argv[2] || '.';
const bl = yaml.load(readFileSync(ROOT + '/memory/backlog.yaml', 'utf8')) || {};
const structuralOnly = (c) =>
  /(^|\s)(node\s+scripts\/pb\.mjs|pb(\.mjs)?|npm\s+run)\s+validate\b/.test(c.trim()) && !/--task/.test(c);
let hollow = 0, actionableHollow = 0;
console.log('  ID     STATUS        GATE QUALITY               TITLE');
console.log('  ' + '-'.repeat(74));
for (const t of bl.tasks || []) {
  const checks = (t.acceptance_checks || []).filter((c) => typeof c === 'string' && c.trim());
  let cls;
  if (!checks.length) cls = 'NONE   (honor-only)     ';
  else if (checks.every(structuralOnly)) {
    cls = 'HOLLOW (structural-only)'; hollow++;
    if (['todo', 'in_progress'].includes(t.status)) actionableHollow++;
  } else cls = 'REAL   (tests the work) ';
  console.log(`  ${String(t.id).padEnd(6)} ${String(t.status).padEnd(13)} ${cls}  ${(t.title || '').slice(0, 38)}`);
}
console.log('  ' + '-'.repeat(74));
console.log(`  ${hollow} hollow gate(s) total; ${actionableHollow} on actionable tasks.`);
process.exit(actionableHollow ? 1 : 0);
