#!/usr/bin/env node
// scripts/check-smoke-survey.mjs
// ----------------------------------------------------------------------------
// Structural check for SMOKE_TEST.md (epoch loop-20260628-001, task
// smoke-test-survey). Asserts the survey is complete enough to be usable: at
// least 8 numbered scenarios, an answer + feedback field on each, an overall
// feedback section, and a detachable grader rubric (answer key).
// ----------------------------------------------------------------------------

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
let pass = 0, fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { console.log(`  PASS  ${name}`); pass++; }
  else { console.error(`  FAIL  ${name}${extra ? `\n        ${extra}` : ''}`); fail++; }
}

const p = resolve(root, 'SMOKE_TEST.md');
ok('SMOKE_TEST.md exists', existsSync(p));
const md = existsSync(p) ? readFileSync(p, 'utf8') : '';

const scenarios = (md.match(/^### S\d+\b/gm) || []).length;
ok(`has >= 8 scenarios (found ${scenarios})`, scenarios >= 8);

const answers = (md.match(/\*\*Your answer:\*\*/g) || []).length;
ok(`every scenario has a "Your answer" field (${answers} >= ${scenarios})`, answers >= scenarios && scenarios > 0);

const feedback = (md.match(/\*\*Your feedback/g) || []).length;
ok(`every scenario has a "Your feedback" field (${feedback} >= ${scenarios})`, feedback >= scenarios && scenarios > 0);

ok('has an overall feedback section', /##\s*Overall feedback/i.test(md));
ok('has a detachable grader rubric (answer key)', /Appendix A\b[\s\S]*Grader rubric/i.test(md) && /DETACH/i.test(md));
ok('rubric scores every scenario (>= 8 bullet lines)', (md.match(/^- \*\*S\d+\*\*/gm) || []).length >= 8);

console.log(`\ncheck-smoke-survey: ${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
