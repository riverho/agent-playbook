#!/usr/bin/env node
// scripts/check-triage-skill.mjs
// ----------------------------------------------------------------------------
// Structural + content check for the triage skill (epoch loop-20260628-001,
// task triage-skill). Asserts the skill + process exist, parse, are registered
// and resolve, the process encodes the five discipline points (not just empty
// files), the skill points at the process, and the project-memory granularity
// rule is present. pb validate covers generic skill->process resolution; this
// gates that the triage route actually carries its discipline.
// ----------------------------------------------------------------------------

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'js-yaml';

const root = process.cwd();
let pass = 0, fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { console.log(`  PASS  ${name}`); pass++; }
  else { console.error(`  FAIL  ${name}${extra ? `\n        ${extra}` : ''}`); fail++; }
}
const read = (rel) => (existsSync(resolve(root, rel)) ? readFileSync(resolve(root, rel), 'utf8') : null);
const loadYaml = (rel) => { const t = read(rel); return t == null ? null : yaml.load(t); };

// 1. files exist + parse -----------------------------------------------------
const proc = loadYaml('processes/triage-claim.yaml');
ok('processes/triage-claim.yaml exists and parses', proc && typeof proc === 'object');
const skill = read('skills/triage/SKILL.md');
ok('skills/triage/SKILL.md exists', skill != null);

// 2. registered in both indices ---------------------------------------------
const pidx = loadYaml('processes/index.yaml');
ok('triage-claim registered in processes/index.yaml',
  Array.isArray(pidx?.processes) && pidx.processes.some((p) => p.id === 'triage-claim' && p.file === 'processes/triage-claim.yaml'));
const sidx = loadYaml('skills/index.yaml');
const skEntry = Array.isArray(sidx?.skills) ? sidx.skills.find((s) => s.id === 'triage') : null;
ok('triage registered in skills/index.yaml', !!skEntry && skEntry.file === 'skills/triage/SKILL.md');
ok('triage skill points at the triage-claim process', skEntry?.process === 'triage-claim');

// 3. skill frontmatter names the skill --------------------------------------
ok('skill frontmatter declares name: triage', skill != null && /^---[\s\S]*?\bname:\s*triage\b/.test(skill));

// 4. the process encodes the five discipline points --------------------------
const ids = Array.isArray(proc?.principles) ? proc.principles.map((p) => p.id) : [];
for (const need of ['evidence_not_prose', 'reproduce_first', 'one_defect_one_check', 'skills_first', 'escalate_only_on_gap']) {
  ok(`process encodes principle: ${need}`, ids.includes(need));
}
// red->green must be explicit somewhere in the process text.
ok('process states the red->green check requirement', /red[\s\S]{0,40}green/i.test(read('processes/triage-claim.yaml') || ''));

// 5. project-memory carries the granularity rule -----------------------------
const mem = read('memory/project-memory.md') || '';
ok('project-memory has the prose->backlog / granularity rule',
  /triage-claim/.test(mem) && /one defect = one task/i.test(mem));

console.log(`\ncheck-triage-skill: ${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
