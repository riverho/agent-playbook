#!/usr/bin/env node
// Structural check for the wiki-news mode pack.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'js-yaml';

const root = process.cwd();
const VALID_KINDS = new Set(['check', 'advice']);
const checks = [];
const requiredScripts = [
  'scripts/wiki-news-daily.mjs',
  'scripts/check-wiki-news-mode.mjs',
  'scripts/test-wiki-news-mode.mjs',
];
function check(name, fn) { checks.push({ name, fn }); }
function loadYaml(rel) { return yaml.load(readFileSync(resolve(root, rel), 'utf8')); }

check('wiki-news is registered in playbook.yaml and modes/index.yaml', () => {
  const master = loadYaml('playbook.yaml');
  if (!master.modes || master.modes['wiki-news'] !== 'modes/wiki-news.yaml') {
    throw new Error('wiki-news not registered in playbook.yaml modes:');
  }
  const catalog = loadYaml('modes/index.yaml');
  if (!Array.isArray(catalog.modes) || !catalog.modes.some((m) => m.id === 'wiki-news')) {
    throw new Error('wiki-news missing from modes/index.yaml');
  }
});

check('modes/wiki-news.yaml exists, parses, and is well-formed', () => {
  const doc = loadYaml('modes/wiki-news.yaml');
  if (doc.id !== 'wiki-news') throw new Error(`id is "${doc.id}", expected "wiki-news"`);
  if (!doc.description || typeof doc.description !== 'string') throw new Error('description missing');
  if (typeof doc.directive !== 'string') throw new Error('directive must be a string');
  for (const key of ['skills_index', 'processes_index']) {
    if (!doc[key] || !existsSync(resolve(root, doc[key]))) throw new Error(`${key} missing or points at missing file`);
  }
  const sc = doc.scaffold;
  for (const key of ['config', 'items', 'skill', 'id_field', 'goal_template', 'check_field']) {
    if (!sc || !sc[key]) throw new Error(`scaffold missing ${key}`);
  }
  if (!existsSync(resolve(root, sc.config))) throw new Error(`scaffold config missing: ${sc.config}`);
  if (!Array.isArray(doc.principles) || doc.principles.length === 0) throw new Error('principles missing');
  const seen = new Set();
  for (const p of doc.principles) {
    if (!p.id || seen.has(p.id)) throw new Error(`bad/duplicate principle id: ${p.id}`);
    seen.add(p.id);
    if (!VALID_KINDS.has(p.kind)) throw new Error(`invalid principle kind for ${p.id}`);
    if (!p.text || typeof p.text !== 'string') throw new Error(`principle ${p.id} missing text`);
    if (p.kind === 'check' && (!p.check || typeof p.check !== 'string')) throw new Error(`check principle ${p.id} missing command`);
  }
});

check('pack-local skill index references real skills and processes', () => {
  const doc = loadYaml('modes/wiki-news.yaml');
  const idx = loadYaml(doc.skills_index);
  const procIdx = loadYaml(doc.processes_index);
  const processIds = new Set((procIdx.processes || []).map((p) => p.id));
  const expected = new Set(['daily-wiki-refresh', 'wiki-news-ingest', 'wiki-news-verify']);
  if (!Array.isArray(idx.skills)) throw new Error('skills index missing skills array');
  for (const s of idx.skills) {
    if (!s.id || !expected.has(s.id)) throw new Error(`unexpected/missing skill id: ${s.id}`);
    if (!s.file || !existsSync(resolve(root, s.file))) throw new Error(`skill ${s.id} missing file`);
    if (!s.process || !processIds.has(s.process)) throw new Error(`skill ${s.id} points at unknown process ${s.process}`);
  }
  for (const id of expected) if (!idx.skills.some((s) => s.id === id)) throw new Error(`missing skill ${id}`);
});

check('pack-local process index references real process files', () => {
  const doc = loadYaml('modes/wiki-news.yaml');
  const idx = loadYaml(doc.processes_index);
  if (!Array.isArray(idx.processes)) throw new Error('processes index missing processes array');
  for (const p of idx.processes) {
    if (!p.id || !p.file) throw new Error('process entry missing id/file');
    if (!existsSync(resolve(root, p.file))) throw new Error(`process ${p.id} missing file ${p.file}`);
  }
});

check('daily config has executable checks', () => {
  const cfg = loadYaml('modes/wiki-news/config/daily-wiki-runs.yaml');
  if (!Array.isArray(cfg.runs) || cfg.runs.length === 0) throw new Error('runs array missing');
  for (const run of cfg.runs) {
    for (const k of ['id', 'wiki_path', 'blogwatcher_db', 'window', 'check']) if (!run[k]) throw new Error(`run missing ${k}`);
    if (!String(run.check).trim().startsWith('node scripts/wiki-news-daily.mjs')) throw new Error(`run ${run.id} check must call wrapper`);
  }
});

check('wrapper/check/test scripts exist', () => {
  for (const rel of requiredScripts) if (!existsSync(resolve(root, rel))) throw new Error(`missing ${rel}`);
});

check('wiki-news pack is carry-on (no package.json / node_modules)', () => {
  function walk(dirRel) {
    const abs = resolve(root, dirRel);
    if (!existsSync(abs)) return;
    for (const ent of readdirSync(abs, { withFileTypes: true })) {
      if (ent.isDirectory()) {
        if (ent.name === 'node_modules') throw new Error(`carry-on violation: node_modules inside ${dirRel}`);
        walk(`${dirRel}/${ent.name}`);
      } else if (ent.name === 'package.json') {
        throw new Error(`carry-on violation: package.json inside ${dirRel}`);
      }
    }
  }
  walk('modes/wiki-news');
});

let pass = 0, fail = 0;
for (const { name, fn } of checks) {
  try { fn(); console.log(`  PASS  ${name}`); pass++; }
  catch (e) { console.error(`  FAIL  ${name}
        ${e.message}`); fail++; }
}
console.log(`
check-wiki-news-mode: ${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
