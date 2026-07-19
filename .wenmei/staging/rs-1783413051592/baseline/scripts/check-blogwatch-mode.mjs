#!/usr/bin/env node
// scripts/check-blogwatch-mode.mjs
// ----------------------------------------------------------------------------
// Structural check for the blogwatch mode pack. Asserts the mode is registered,
// the mode file parses, index pointers reference real files, pack-local indices
// are well-formed, and the pack is carry-on (no package.json / node_modules).
// ----------------------------------------------------------------------------

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'js-yaml';

const root = process.cwd();
const checks = [];
function check(name, fn) {
  checks.push({ name, fn });
}

const VALID_KINDS = new Set(['check', 'advice']);

function loadYaml(rel) {
  return yaml.load(readFileSync(resolve(root, rel), 'utf8'));
}

check('blogwatch is registered in playbook.yaml', () => {
  const master = loadYaml('playbook.yaml');
  if (!master.modes || !master.modes.blogwatch) {
    throw new Error('blogwatch not in modes registry');
  }
});

check('modes/blogwatch.yaml exists, parses, and is well-formed', () => {
  const master = loadYaml('playbook.yaml');
  const rel = master.modes.blogwatch;
  const file = resolve(root, rel);
  if (!existsSync(file)) throw new Error(`mode file missing: ${rel}`);

  const doc = loadYaml(rel);
  if (doc.id !== 'blogwatch') {
    throw new Error(`id is "${doc.id}", expected "blogwatch"`);
  }
  if (!doc.description || typeof doc.description !== 'string') {
    throw new Error('description missing or not a string');
  }
  if (!('directive' in doc)) {
    throw new Error('directive key missing (empty "" is allowed, missing is not)');
  }
  if (typeof doc.directive !== 'string') {
    throw new Error('directive must be a string');
  }
  for (const key of ['skills_index', 'processes_index']) {
    if (!doc[key]) throw new Error(`${key} missing`);
    if (!existsSync(resolve(root, doc[key]))) {
      throw new Error(`${key} points at a missing file: ${doc[key]}`);
    }
  }

  if (!Array.isArray(doc.principles) || doc.principles.length === 0) {
    throw new Error('principles must be a non-empty array');
  }
  const seen = new Set();
  for (const p of doc.principles) {
    if (!p || typeof p !== 'object') throw new Error('a principle is not a mapping');
    if (!p.id || typeof p.id !== 'string') throw new Error('a principle has no id');
    if (seen.has(p.id)) throw new Error(`duplicate principle id "${p.id}"`);
    seen.add(p.id);
    if (!VALID_KINDS.has(p.kind)) {
      throw new Error(`principle "${p.id}" has invalid kind "${p.kind}" (must be check|advice)`);
    }
    if (!p.text || typeof p.text !== 'string') {
      throw new Error(`principle "${p.id}" missing text`);
    }
    if (p.kind === 'check' && (!p.check || typeof p.check !== 'string')) {
      throw new Error(`principle "${p.id}" kind:check must declare a check command`);
    }
  }
});

check('pack-local skill index is well-formed and references real files', () => {
  const doc = loadYaml('modes/blogwatch.yaml');
  const idx = loadYaml(doc.skills_index);
  if (!Array.isArray(idx.skills)) throw new Error('skills index missing skills array');
  for (const s of idx.skills) {
    if (!s || typeof s !== 'object') throw new Error('a skill entry is not a mapping');
    if (!s.id || typeof s.id !== 'string') throw new Error('a skill entry has no id');
    if (!s.file || typeof s.file !== 'string') throw new Error(`skill "${s.id}" has no file`);
    if (!existsSync(resolve(root, s.file))) {
      throw new Error(`skill "${s.id}" references a missing file: ${s.file}`);
    }
  }
});

check('pack-local process index is well-formed and references real files', () => {
  const doc = loadYaml('modes/blogwatch.yaml');
  const idx = loadYaml(doc.processes_index);
  if (!Array.isArray(idx.processes)) throw new Error('processes index missing processes array');
  for (const p of idx.processes) {
    if (!p || typeof p !== 'object') throw new Error('a process entry is not a mapping');
    if (!p.id || typeof p.id !== 'string') throw new Error('a process entry has no id');
    if (!p.file || typeof p.file !== 'string') throw new Error(`process "${p.id}" has no file`);
    if (!existsSync(resolve(root, p.file))) {
      throw new Error(`process "${p.id}" references a missing file: ${p.file}`);
    }
  }
});

check('blogwatch pack is carry-on (no package.json / node_modules)', () => {
  function walk(dirRel) {
    const abs = resolve(root, dirRel);
    if (!existsSync(abs)) return;
    for (const ent of readdirSync(abs, { withFileTypes: true })) {
      if (ent.isDirectory()) {
        if (ent.name === 'node_modules') {
          throw new Error(`carry-on violation: node_modules/ inside ${dirRel}`);
        }
        walk(`${dirRel}/${ent.name}`);
      } else if (ent.name === 'package.json') {
        throw new Error(`carry-on violation: package.json inside ${dirRel}`);
      }
    }
  }
  walk('modes/blogwatch');
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
console.log(`\ncheck-blogwatch-mode: ${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
