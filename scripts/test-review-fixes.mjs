#!/usr/bin/env node
// scripts/test-review-fixes.mjs
// ----------------------------------------------------------------------------
// Guard harness for the PR#1 review fixes (loop-20260705-002). Each finding's
// backlog task gates on `node scripts/test-review-fixes.mjs <finding-id>`, which
// asserts the fix's post-state by reading the source (no shell-quoting pain).
// Behavioural proof (the code actually running) lives in each task's OTHER
// acceptance_checks; this file only pins "the change is present and the old
// broken form is gone" so the check is red-before-green.
//
// Usage: node scripts/test-review-fixes.mjs <finding-1|2|5|6|7|8>
// ----------------------------------------------------------------------------
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');

function assert(cond, msg) {
  if (!cond) {
    console.error(`  FAIL  ${msg}`);
    process.exit(1);
  }
  console.log(`  PASS  ${msg}`);
}

const which = process.argv[2];
const checks = {
  'finding-1': () => {
    const s = read('scripts/check-v033-conformance-docs.mjs');
    assert(s.includes("new RegExp('v' + expectedVersion"),
      'check-v033: README version assertion is derived from expectedVersion');
    assert(!s.includes('/v0\\.3\\.3/i'),
      'check-v033: the hardcoded old /v0\\.3\\.3/i literal is gone');
  },
  'finding-2': () => {
    const s = read('scripts/wiki-news-daily.mjs');
    assert(!/run\('python'/.test(s),
      'wiki-news-daily: no bare run(\'python\') invocations remain');
    assert((s.match(/run\(python,/g) || []).length >= 5,
      'wiki-news-daily: all five python calls route through the venv `python` var');
  },
  'finding-5': () => {
    const s = read('scripts/pb.mjs');
    assert(s.includes('skillForMode(candidate.skill, candidate.mode)'),
      'pb.mjs cmdNext: display skill resolved via skillForMode(candidate.mode)');
  },
  'finding-6': () => {
    assert(existsSync(resolve(ROOT, 'scripts/lib/loop-lib.mjs')),
      'scripts/lib/loop-lib.mjs exists');
    const lib = read('scripts/lib/loop-lib.mjs');
    assert(/export\s+function\s+readActiveLoop/.test(lib),
      'loop-lib exports readActiveLoop');
    const flow = read('scripts/pb-flow.mjs');
    const mon = read('scripts/pb-daily-monitor.mjs');
    assert(/from ['"]\.\/lib\/loop-lib\.mjs['"]/.test(flow),
      'pb-flow.mjs imports the shared loop-lib');
    assert(/from ['"]\.\/lib\/loop-lib\.mjs['"]/.test(mon),
      'pb-daily-monitor.mjs imports the shared loop-lib');
    // the duplicated bodies must be gone (no local activeLoop/readActiveLoop redecl)
    assert(!/function activeLoop\s*\(/.test(flow),
      'pb-flow.mjs no longer declares its own activeLoop');
    assert(!/function readActiveLoop\s*\(/.test(mon),
      'pb-daily-monitor.mjs no longer declares its own readActiveLoop');
  },
  'finding-7': () => {
    const mon = read('scripts/pb-daily-monitor.mjs');
    assert(!/DEFAULT_MONITOR_MODE\s*=\s*'blogwatch'/.test(mon),
      'pb-daily-monitor: default monitor mode is not the hardcoded blogwatch literal');
    assert(!/WORKSPACE_PROJECTS\s*=\s*'\/Users\/river/.test(mon),
      'pb-daily-monitor: WORKSPACE_PROJECTS is not a hardcoded absolute home path');
    assert(/process\.env\./.test(mon),
      'pb-daily-monitor: reads an env override for machine-specific config');
    const chk = read('scripts/check-attention-research-mode.mjs');
    assert(!/\/Users\/river\/\.openclaw\/workspace\/projects\/attention-research/.test(chk),
      'check-attention-research-mode: no hardcoded absolute project path');
  },
  'finding-8': () => {
    const s = read('scripts/pb.mjs');
    assert(s.includes('modeSkillIdCache'),
      'pb.mjs runValidate: per-mode skill-id cache present (no per-task re-parse)');
  },
};

if (!checks[which]) {
  console.error(`Unknown finding: ${which}. Expected one of: ${Object.keys(checks).join(', ')}`);
  process.exit(2);
}
console.log(`test-review-fixes ${which}:`);
checks[which]();
console.log(`test-review-fixes ${which}: OK`);
