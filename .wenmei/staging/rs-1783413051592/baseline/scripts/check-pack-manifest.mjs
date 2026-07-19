#!/usr/bin/env node
// Validate a mode pack manifest and its exact file inventory.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACK_ROOT = resolve(process.env.PB_PACK_ROOT || resolve(ROOT, 'modes'));
const modeId = process.argv[2];
const checks = [];
function check(name, fn) { checks.push({ name, fn }); }
function loadYaml(file) { return yaml.load(readFileSync(file, 'utf8')); }

let manifest;
const packDir = modeId ? resolve(PACK_ROOT, modeId) : PACK_ROOT;
const manifestPath = resolve(packDir, 'pack.yaml');

check('mode id argument is present', () => {
  if (!modeId) throw new Error('usage: node scripts/check-pack-manifest.mjs <mode-id>');
});

check('pack.yaml exists and parses', () => {
  if (!existsSync(manifestPath)) throw new Error(`${manifestPath} does not exist`);
  manifest = loadYaml(manifestPath);
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('pack.yaml must contain a mapping');
  }
});

check('required manifest fields are valid', () => {
  if (!manifest) throw new Error('pack.yaml did not load');
  if (manifest.id !== modeId) throw new Error(`id must match "${modeId}"`);
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version || '')) throw new Error('version must be semver x.y.z');
  if (typeof manifest.engine_range !== 'string' || !manifest.engine_range) throw new Error('engine_range is required');
  if (!Array.isArray(manifest.files)) throw new Error('files must be an array');
  if (!['free', 'team', 'paid'].includes(manifest.license)) throw new Error('license must be free, team, or paid');
  if (!manifest.provenance || typeof manifest.provenance.author !== 'string' || !manifest.provenance.author) {
    throw new Error('provenance.author is required');
  }
});

function safeListedPath(file) {
  if (typeof file !== 'string' || !file || isAbsolute(file)) return false;
  const rel = relative(packDir, resolve(packDir, file));
  return rel !== '' && !rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel);
}

check('listed paths are relative and stay inside the pack', () => {
  if (!manifest || !Array.isArray(manifest.files)) throw new Error('files array unavailable');
  for (const file of manifest.files) {
    if (!safeListedPath(file)) throw new Error(`unsafe listed path: ${String(file)}`);
  }
});

check('every listed file exists', () => {
  if (!manifest || !Array.isArray(manifest.files)) throw new Error('files array unavailable');
  for (const file of manifest.files) {
    if (!safeListedPath(file) || !existsSync(resolve(packDir, file)) || !statSync(resolve(packDir, file)).isFile()) {
      throw new Error(`listed file does not exist: ${String(file)}`);
    }
  }
});

function walkFiles(dir, prefix = '') {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) found.push(...walkFiles(resolve(dir, entry.name), rel));
    else if (entry.isFile()) found.push(rel);
  }
  return found;
}

check('every pack file is listed', () => {
  if (!manifest || !Array.isArray(manifest.files)) throw new Error('files array unavailable');
  const listed = new Set(manifest.files);
  const unlisted = walkFiles(packDir).filter((file) => file !== 'pack.yaml' && !listed.has(file));
  if (unlisted.length) throw new Error(`unlisted file(s): ${unlisted.join(', ')}`);
});

function parseVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(value));
  return match ? match.slice(1).map(Number) : null;
}

check('engine_range is satisfied by playbook.yaml version', () => {
  if (!manifest) throw new Error('pack.yaml did not load');
  const match = /^>=(\d+\.\d+\.\d+)$/.exec(manifest.engine_range || '');
  if (!match) throw new Error('engine_range must use >=x.y.z');
  const engine = parseVersion(loadYaml(resolve(ROOT, 'playbook.yaml'))?.version);
  const minimum = parseVersion(match[1]);
  if (!engine) throw new Error('playbook.yaml version must be x.y.z');
  for (let i = 0; i < 3; i++) {
    if (engine[i] > minimum[i]) return;
    if (engine[i] < minimum[i]) throw new Error(`engine ${engine.join('.')} does not satisfy ${manifest.engine_range}`);
  }
});

let pass = 0, fail = 0;
for (const { name, fn } of checks) {
  try { fn(); console.log(`  PASS  ${name}`); pass++; }
  catch (error) { console.error(`  FAIL  ${name}\n        ${error.message}`); fail++; }
}
console.log(`\ncheck-pack-manifest: ${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
