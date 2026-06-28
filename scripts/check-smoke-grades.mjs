#!/usr/bin/env node
// scripts/check-smoke-grades.mjs
// ----------------------------------------------------------------------------
// Completeness check for the graded smoke tests (epoch loop-20260628-001, task
// grade-smoke-tests). Asserts each agent submission was actually marked: a
// Teacher's Grade mark sheet scoring all 12 scenarios, and a hardening
// recommendations section. Content judgment is the teacher's; this gates that
// no file was left ungraded.
// ----------------------------------------------------------------------------

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
let pass = 0, fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { console.log(`  PASS  ${name}`); pass++; }
  else { console.error(`  FAIL  ${name}${extra ? `\n        ${extra}` : ''}`); fail++; }
}

const files = ['SMOKE_TEST_CODEX.md', 'SMOKE_TEST_TY.md', 'SMOKE_TEST_OPENCODE.md'];
const answerKey = 'SMOKE_TEST_ANSWER.md';

ok(`answer key exists: ${answerKey}`, existsSync(resolve(root, answerKey)));

for (const f of files) {
  const p = resolve(root, f);
  if (!existsSync(p)) { ok(`${f} exists`, false); continue; }
  const md = readFileSync(p, 'utf8');
  ok(`${f}: has a Teacher's Grade mark sheet`, /Teacher's Grade/.test(md));
  // The mark sheet must score every scenario S1..S12 as a table row.
  const rows = new Set((md.match(/^\|\s*S(\d{1,2})\s*\|/gm) || []).map((m) => m.match(/S(\d{1,2})/)[1]));
  const allTwelve = Array.from({ length: 12 }, (_, i) => String(i + 1)).every((n) => rows.has(n));
  ok(`${f}: mark sheet scores all 12 scenarios (found ${rows.size})`, allTwelve);
  ok(`${f}: has a hardening-guardrails recommendations section`, /Recommendations — hardening guardrails/.test(md));
  ok(`${f}: recommends the triage skill/process`, /triage/i.test(md) && /backlog/i.test(md));
}

console.log(`\ncheck-smoke-grades: ${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
