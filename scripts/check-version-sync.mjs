#!/usr/bin/env node
// scripts/check-version-sync.mjs
// ----------------------------------------------------------------------------
// Drift guard: package.json and playbook.yaml must agree on the project
// version. Following the release process literally without bumping
// playbook.yaml reproduces version drift (this bit us in v0.3.5). Exit 0
// iff the two `version` values are strictly equal; otherwise print both
// values in a FAIL line and exit 1.
// ----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'js-yaml';

const root = process.cwd();
const checks = [];
function check(name, fn) { checks.push({ name, fn }); }

// Mirror how scripts/pb.mjs loads the master: js-yaml.load reads YAML
// (and JSON-as-YAML, which is what package.json happens to also parse as).
// We still parse package.json with JSON.parse to be explicit about its shape.
const master = yaml.load(readFileSync(resolve(root, 'playbook.yaml'), 'utf8'));
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

const masterVersion = master && typeof master.version === 'string' ? master.version : null;
const pkgVersion = pkg && typeof pkg.version === 'string' ? pkg.version : null;

check('package.json version matches playbook.yaml version', () => {
  if (!masterVersion) throw new Error('playbook.yaml has no `version` field');
  if (!pkgVersion) throw new Error('package.json has no `version` field');
  if (masterVersion !== pkgVersion) {
    throw new Error(`playbook.yaml="${masterVersion}" vs package.json="${pkgVersion}"`);
  }
});

let pass = 0, fail = 0;
for (const { name, fn } of checks) {
  try { fn(); console.log(`  PASS  ${name}`); pass++; }
  catch (e) { console.error(`  FAIL  ${name}\n        ${e.message}`); fail++; }
}
console.log(`\ncheck-version-sync: ${pass} pass, ${fail} fail (package.json="${pkgVersion}", playbook.yaml="${masterVersion}")`);
if (fail > 0) process.exit(1);
