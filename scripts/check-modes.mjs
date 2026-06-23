#!/usr/bin/env node
// scripts/check-modes.mjs
// ----------------------------------------------------------------------------
// Structural check for the mode feature (phase 6, track A / step 1).
// Asserts the modes registry + each mode file are well-formed. Behavioral
// correctness (resolution, anchor injection, principle gating) is checked
// separately by test-mode-resolve.mjs / test-mode-principles.mjs.
//
// Key invariant enforced here: `directive` must be PRESENT but may be EMPTY.
// An empty directive is intentional — it means "inherit the host agent's
// system prompt" — so empty is ACCEPTED, a missing key is a FAILURE.
// ----------------------------------------------------------------------------

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import yaml from 'js-yaml';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const checks = [];
function check(name, fn) {
  checks.push({ name, fn });
}

const VALID_KINDS = new Set(['check', 'advice']);

function loadMaster() {
  return yaml.load(readFileSync(resolve(root, 'playbook.yaml'), 'utf8'));
}

// 1. modes/ directory exists ------------------------------------------------------
check('modes/ directory exists', () => {
  if (!existsSync(resolve(root, 'modes'))) throw new Error('missing modes/ directory');
});

// 2. master declares default_mode + a modes registry -----------------------------
check('playbook.yaml declares default_mode and a non-empty modes registry', () => {
  const m = loadMaster();
  if (!m.default_mode || typeof m.default_mode !== 'string') {
    throw new Error('default_mode missing or not a string');
  }
  if (!m.modes || typeof m.modes !== 'object' || Array.isArray(m.modes)) {
    throw new Error('modes registry missing or not a map of id -> file');
  }
  if (Object.keys(m.modes).length === 0) throw new Error('modes registry is empty');
});

// 3. default_mode resolves to a registered mode ----------------------------------
check('default_mode resolves to a registered mode', () => {
  const m = loadMaster();
  if (!(m.default_mode in m.modes)) {
    throw new Error(`default_mode "${m.default_mode}" is not in the modes registry`);
  }
});

// 4. coding is the first/reference mode and is registered ------------------------
check('coding mode is registered', () => {
  const m = loadMaster();
  if (!('coding' in m.modes)) throw new Error('coding not in modes registry');
});

// 5. every registered mode file exists, parses, and is well-formed ---------------
check('every registered mode file exists, parses, and is well-formed', () => {
  const m = loadMaster();
  for (const [id, rel] of Object.entries(m.modes)) {
    const file = resolve(root, rel);
    if (!existsSync(file)) throw new Error(`mode "${id}": file not found: ${rel}`);
    let doc;
    try {
      doc = yaml.load(readFileSync(file, 'utf8'));
    } catch (e) {
      throw new Error(`mode "${id}": YAML parse error: ${e.message}`);
    }
    if (!doc || typeof doc !== 'object') throw new Error(`mode "${id}": empty/invalid doc`);
    if (doc.id !== id) throw new Error(`mode "${id}": id field "${doc.id}" != registry key "${id}"`);
    if (!doc.description || typeof doc.description !== 'string') {
      throw new Error(`mode "${id}": description missing or not a string`);
    }

    // directive: key MUST be present; empty string is intentional and accepted.
    if (!('directive' in doc)) {
      throw new Error(`mode "${id}": directive key is missing (it may be empty "" = inherit host prompt, but it must be present)`);
    }
    if (typeof doc.directive !== 'string') {
      throw new Error(`mode "${id}": directive must be a string (empty "" is allowed)`);
    }

    // Stage-2-ready index pointers must reference real files.
    for (const key of ['skills_index', 'processes_index']) {
      if (!(key in doc)) throw new Error(`mode "${id}": ${key} pointer missing`);
      if (!existsSync(resolve(root, doc[key]))) {
        throw new Error(`mode "${id}": ${key} points at a missing file: ${doc[key]}`);
      }
    }

    // principles: 1..N, each typed kind:check|advice; check declares a check command.
    if (!Array.isArray(doc.principles) || doc.principles.length === 0) {
      throw new Error(`mode "${id}": principles must be a non-empty array`);
    }
    const seen = new Set();
    for (const pr of doc.principles) {
      if (!pr || typeof pr !== 'object') throw new Error(`mode "${id}": a principle is not a mapping`);
      if (!pr.id || typeof pr.id !== 'string') throw new Error(`mode "${id}": a principle has no id`);
      if (seen.has(pr.id)) throw new Error(`mode "${id}": duplicate principle id "${pr.id}"`);
      seen.add(pr.id);
      if (!VALID_KINDS.has(pr.kind)) {
        throw new Error(`mode "${id}": principle "${pr.id}" has kind "${pr.kind}" (must be check|advice)`);
      }
      if (!pr.text || typeof pr.text !== 'string') {
        throw new Error(`mode "${id}": principle "${pr.id}" has no text`);
      }
      if (pr.kind === 'check' && (!pr.check || typeof pr.check !== 'string')) {
        throw new Error(`mode "${id}": kind:check principle "${pr.id}" must declare an executable check: command`);
      }
      if (pr.kind === 'advice' && 'check' in pr) {
        throw new Error(`mode "${id}": kind:advice principle "${pr.id}" must not declare a check command`);
      }
    }
  }
});

// 6. coding has at least one check and at least one advice principle (mixed) ------
check('coding mode has a mixed principle catalog (>=1 check, >=1 advice)', () => {
  const m = loadMaster();
  const doc = yaml.load(readFileSync(resolve(root, m.modes.coding), 'utf8'));
  const kinds = (doc.principles || []).map((p) => p.kind);
  if (!kinds.includes('check')) throw new Error('coding has no kind:check principle');
  if (!kinds.includes('advice')) throw new Error('coding has no kind:advice principle');
});

// 7. pack-local indices are well-formed + the pack is carry-on -------------------
// A mode whose skills_index/processes_index points UNDER modes/ is a "pack": its
// index must parse, every referenced file must exist, and the pack dir must be
// pure md+yaml (no package.json / node_modules) — carry-on. Modes pointing at the
// global engine indices (e.g. coding) are exempt.
check('pack-local indices are well-formed and carry-on (no deps inside a pack)', () => {
  const m = loadMaster();
  const isPackLocal = (rel) => typeof rel === 'string' && rel.replace(/\\/g, '/').startsWith('modes/');
  const walkForDeps = (dirRel) => {
    const abs = resolve(root, dirRel);
    if (!existsSync(abs)) return;
    for (const ent of readdirSync(abs, { withFileTypes: true })) {
      if (ent.isDirectory()) {
        if (ent.name === 'node_modules') throw new Error(`pack "${dirRel}" is not carry-on: contains node_modules/`);
        walkForDeps(`${dirRel}/${ent.name}`);
      } else if (ent.name === 'package.json') {
        throw new Error(`pack "${dirRel}" is not carry-on: contains package.json`);
      }
    }
  };
  for (const [id, rel] of Object.entries(m.modes)) {
    const doc = yaml.load(readFileSync(resolve(root, rel), 'utf8'));
    let hasPackLocal = false;
    for (const [key, listKey] of [['skills_index', 'skills'], ['processes_index', 'processes']]) {
      const idxRel = doc[key];
      if (!isPackLocal(idxRel)) continue; // engine/global index — not pack-local
      hasPackLocal = true;
      const idxAbs = resolve(root, idxRel);
      if (!existsSync(idxAbs)) throw new Error(`mode "${id}": pack-local ${key} not found: ${idxRel}`);
      let idxDoc;
      try { idxDoc = yaml.load(readFileSync(idxAbs, 'utf8')); }
      catch (e) { throw new Error(`mode "${id}": pack-local ${key} parse error: ${e.message}`); }
      const list = Array.isArray(idxDoc?.[listKey]) ? idxDoc[listKey] : [];
      for (const entry of list) {
        if (!entry?.file || !existsSync(resolve(root, entry.file))) {
          throw new Error(`mode "${id}": ${listKey} entry "${entry?.id}" references a missing file: ${entry?.file}`);
        }
      }
    }
    // carry-on scan of the pack dir (modes/<id>/) when this mode ships pack-local files.
    if (hasPackLocal) walkForDeps(`modes/${id}`);
  }
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
console.log(`\ncheck-modes: ${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
