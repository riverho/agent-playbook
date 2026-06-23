#!/usr/bin/env node
// scripts/check-nl-skill.mjs
// ----------------------------------------------------------------------------
// Structural check for the natural-language playbook skill.
// Asserts that the skill + process exist, parse, and are wired into the
// indices. Behavioral correctness (the grammar) is checked separately by
// scripts/test-nl-routing.mjs — see project-memory rule 4 ("Keep pb validate
// green") and the skill's own acceptance checklist.
// ----------------------------------------------------------------------------

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import yaml from 'js-yaml';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const checks = [];
function check(name, fn) {
  checks.push({ name, fn });
}

// 1. Skill file exists ------------------------------------------------------------
check('skills/nl/SKILL.md exists', () => {
  if (!existsSync(resolve(root, 'skills/nl/SKILL.md'))) throw new Error('missing file');
});

// 2. Process file exists ----------------------------------------------------------
check('processes/use-playbook.yaml exists', () => {
  if (!existsSync(resolve(root, 'processes/use-playbook.yaml'))) throw new Error('missing file');
});

// 3. Matcher library exists and syntactically parses -----------------------------
check('scripts/lib/nl-router.mjs exists and parses', () => {
  const p = resolve(root, 'scripts/lib/nl-router.mjs');
  if (!existsSync(p)) throw new Error('missing file');
  // Force a syntax check by loading as a module via dynamic import.
  // On Windows we must wrap the absolute path in a file:// URL.
  return import(pathToFileURL(p).href).then((m) => {
    if (typeof m.route !== 'function') throw new Error('route() not exported');
    if (!Array.isArray(m.INTENTS) || m.INTENTS.length === 0) throw new Error('INTENTS empty/missing');
    if (typeof m.version !== 'string') throw new Error('version not exported');
  });
});

// 4. skills/index.yaml registers the nl skill -------------------------------------
check('skills/index.yaml registers id=nl', () => {
  const idx = yaml.load(readFileSync(resolve(root, 'skills/index.yaml'), 'utf8'));
  const skill = (idx.skills || []).find((s) => s.id === 'nl');
  if (!skill) throw new Error('id=nl not in skills/index.yaml');
  if (skill.file !== 'skills/nl/SKILL.md') {
    throw new Error(`file mismatch: expected skills/nl/SKILL.md, got ${skill.file}`);
  }
  if (skill.process !== 'use-playbook') {
    throw new Error(`process mismatch: expected use-playbook, got ${skill.process}`);
  }
  if (!skill.summary || typeof skill.summary !== 'string') {
    throw new Error('summary missing or not a string');
  }
});

// 5. processes/index.yaml registers the use-playbook process ----------------------
check('processes/index.yaml registers id=use-playbook', () => {
  const idx = yaml.load(readFileSync(resolve(root, 'processes/index.yaml'), 'utf8'));
  const proc = (idx.processes || []).find((p) => p.id === 'use-playbook');
  if (!proc) throw new Error('id=use-playbook not in processes/index.yaml');
  if (proc.file !== 'processes/use-playbook.yaml') {
    throw new Error(`file mismatch: expected processes/use-playbook.yaml, got ${proc.file}`);
  }
});

// 6. Process YAML is well-formed and has the expected sections --------------------
check('processes/use-playbook.yaml has required sections', () => {
  const doc = yaml.load(readFileSync(resolve(root, 'processes/use-playbook.yaml'), 'utf8'));
  for (const key of ['name', 'purpose', 'canonical_steps', 'acceptance_checks']) {
    if (!(key in doc)) throw new Error(`missing required key: ${key}`);
  }
  if (doc.name !== 'use-playbook') throw new Error(`name mismatch: ${doc.name}`);
  if (!Array.isArray(doc.canonical_steps) || doc.canonical_steps.length === 0) {
    throw new Error('canonical_steps must be a non-empty array');
  }
  if (!Array.isArray(doc.acceptance_checks) || doc.acceptance_checks.length === 0) {
    throw new Error('acceptance_checks must be a non-empty array');
  }
});

// 7. Skill SKILL.md is non-empty markdown and references the process --------------
check('skills/nl/SKILL.md is non-empty and references the process', () => {
  const md = readFileSync(resolve(root, 'skills/nl/SKILL.md'), 'utf8');
  if (md.trim().length < 400) throw new Error('SKILL.md is suspiciously short');
  if (!md.includes('processes/use-playbook.yaml')) {
    throw new Error('SKILL.md must reference processes/use-playbook.yaml');
  }
  if (!md.includes('scripts/lib/nl-router.mjs')) {
    throw new Error('SKILL.md must reference the canonical matcher scripts/lib/nl-router.mjs');
  }
});

// 8. INTENTS table covers the documented set --------------------------------------
// (Behavioral correctness is asserted in test-nl-routing.mjs; here we just check
//  the documented intents are all present in the matcher. `unknown` is a runtime
//  fallback — absence-of-match — so it is NOT in INTENTS by design.)
check('matcher INTENTS covers every documented intent id', () => {
  const md = readFileSync(resolve(root, 'skills/nl/SKILL.md'), 'utf8');
  // Extract the table: rows that start with `| <number> | \`<id>\` | ...`
  const ids = [...md.matchAll(/^\|\s*\d+\s*\|\s*`([a-z][a-z0-9-]*)`\s*\|/gm)].map((m) => m[1]);
  const expected = new Set(ids);
  return import(pathToFileURL(resolve(root, 'scripts/lib/nl-router.mjs')).href).then((m) => {
    const actual = new Set(m.INTENTS.map((d) => d.id));
    const missing = [...expected].filter((id) => !actual.has(id));
    if (missing.length) throw new Error(`matcher missing intents: ${missing.join(', ')}`);
  });
});

// Run -----------------------------------------------------------------------
let pass = 0;
let fail = 0;
for (const { name, fn } of checks) {
  try {
    await fn();
    console.log(`  PASS  ${name}`);
    pass++;
  } catch (e) {
    console.error(`  FAIL  ${name}\n        ${e.message}`);
    fail++;
  }
}
console.log(`\ncheck-nl-skill: ${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
