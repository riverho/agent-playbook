#!/usr/bin/env node
// scripts/check-daily-monitor.mjs
// ----------------------------------------------------------------------------
// Structural check for the blogwatch daily-monitor orchestrator. Asserts the
// script, config, skill, process, ORCHESTRATOR.md, and log files exist and are
// well-formed. Behavioral coverage is in scripts/test-daily-monitor.mjs.
// ----------------------------------------------------------------------------

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import yaml from 'js-yaml';

const root = process.cwd();
const checks = [];
function check(name, fn) {
  checks.push({ name, fn });
}

function loadYaml(rel) {
  return yaml.load(readFileSync(resolve(root, rel), 'utf8'));
}

check('ORCHESTRATOR.md exists', () => {
  if (!existsSync(resolve(root, 'ORCHESTRATOR.md'))) throw new Error('missing ORCHESTRATOR.md');
});

check('orchestrator script exists and parses as Node', () => {
  const file = resolve(root, 'scripts/pb-daily-monitor.mjs');
  if (!existsSync(file)) throw new Error('missing scripts/pb-daily-monitor.mjs');
  execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
});

check('daily watch config exists and has a watches array', () => {
  const file = resolve(root, 'modes/blogwatch/config/daily-watches.yaml');
  if (!existsSync(file)) throw new Error('missing modes/blogwatch/config/daily-watches.yaml');
  const doc = loadYaml(file);
  if (!Array.isArray(doc.watches)) throw new Error('config missing watches array');
  for (const w of doc.watches) {
    if (!w.id || !w.source || !w.criteria || !w.check) {
      throw new Error(`watch missing fields: ${JSON.stringify(w)}`);
    }
  }
});

check('daily-monitor skill and process are registered in the pack-local indices', () => {
  const skills = loadYaml('modes/blogwatch/skills/index.yaml');
  const procs = loadYaml('modes/blogwatch/processes/index.yaml');
  if (!skills.skills.some((s) => s.id === 'daily-monitor')) throw new Error('daily-monitor skill not in index');
  if (!procs.processes.some((p) => p.id === 'daily-monitor')) throw new Error('daily-monitor process not in index');
});

check('daily-monitor skill and process files exist', () => {
  for (const f of ['modes/blogwatch/skills/daily-monitor/SKILL.md', 'modes/blogwatch/processes/daily-monitor.yaml']) {
    if (!existsSync(resolve(root, f))) throw new Error(`missing ${f}`);
  }
});

check('orchestrator log files exist', () => {
  for (const f of [
    'artifacts/reports/orchestrator-errors.ndjson',
    'artifacts/reports/orchestrator-reflections.ndjson',
    'artifacts/reports/orchestrator-iterations.ndjson',
  ]) {
    if (!existsSync(resolve(root, f))) throw new Error(`missing ${f}`);
  }
});

let pass = 0;
let fail = 0;
for (const { name, fn } of checks) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    pass++;
  } catch (e) {
    console.error(`  FAIL  ${name}\n        ${e.message}`);
    fail++;
  }
}
console.log(`\ncheck-daily-monitor: ${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
