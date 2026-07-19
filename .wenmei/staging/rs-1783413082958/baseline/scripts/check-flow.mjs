#!/usr/bin/env node
// scripts/check-flow.mjs
// ----------------------------------------------------------------------------
// Structural check for flows/. For every flows/*.yaml: steps reference real
// modes (registered in playbook.yaml modes:); each step has a mode; input/output
// dirs stay INSIDE the playbook (no absolute or ../ escape); and a chained step's
// input matches the previous step's output (artifact-dir handoff is wired). If
// flows/ does not exist, there is nothing to check (pass). Behavioral coverage is
// in scripts/test-flow-runner.mjs.
// ----------------------------------------------------------------------------

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import yaml from 'js-yaml';

const root = process.cwd();
const checks = [];
function check(name, fn) { checks.push({ name, fn }); }

function loadYaml(rel) { return yaml.load(readFileSync(resolve(root, rel), 'utf8')); }

const master = loadYaml('playbook.yaml');
const MODES = (master && master.modes && typeof master.modes === 'object') ? master.modes : {};

function insidePlaybook(dir) {
  if (!dir || typeof dir !== 'string') return false;
  if (isAbsolute(dir)) return false;
  const rel = relative(root, resolve(root, dir));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

const flowsDir = resolve(root, 'flows');
const flowFiles = existsSync(flowsDir)
  ? readdirSync(flowsDir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
  : [];

check('flows/ files parse and are well-formed (or none exist)', () => {
  for (const f of flowFiles) {
    const doc = loadYaml(`flows/${f}`);
    if (!doc || typeof doc !== 'object') throw new Error(`flows/${f}: empty/invalid`);
    if (!Array.isArray(doc.steps) || doc.steps.length === 0) {
      throw new Error(`flows/${f}: must have a non-empty "steps" array`);
    }
  }
});

check('every flow step references a real mode and has valid dirs', () => {
  for (const f of flowFiles) {
    const doc = loadYaml(`flows/${f}`);
    doc.steps.forEach((step, i) => {
      const where = `flows/${f} step ${i + 1}`;
      if (!step || !step.mode) throw new Error(`${where}: missing mode`);
      if (!(step.mode in MODES)) throw new Error(`${where}: mode "${step.mode}" is not registered in playbook.yaml modes:`);
      for (const key of ['input', 'output']) {
        if (step[key] !== undefined && !insidePlaybook(step[key])) {
          throw new Error(`${where}: ${key} "${step[key]}" escapes the playbook (must be a relative path inside it)`);
        }
      }
    });
  }
});

check('chained steps wire output -> input (artifact-dir handoff)', () => {
  for (const f of flowFiles) {
    const doc = loadYaml(`flows/${f}`);
    for (let i = 1; i < doc.steps.length; i++) {
      const cur = doc.steps[i];
      // A step that declares an input must read it from some earlier step's output.
      if (cur.input === undefined) continue;
      const producedBefore = doc.steps.slice(0, i).map((s) => s.output).filter(Boolean);
      if (!producedBefore.includes(cur.input)) {
        throw new Error(`flows/${f} step ${i + 1}: input "${cur.input}" is not produced as output by any earlier step`);
      }
    }
  }
});

let pass = 0, fail = 0;
for (const { name, fn } of checks) {
  try { fn(); console.log(`  PASS  ${name}`); pass++; }
  catch (e) { console.error(`  FAIL  ${name}\n        ${e.message}`); fail++; }
}
console.log(`\ncheck-flow: ${pass} pass, ${fail} fail (${flowFiles.length} flow file(s))`);
if (fail > 0) process.exit(1);
