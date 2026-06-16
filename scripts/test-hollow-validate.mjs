#!/usr/bin/env node
// Integration test: pb validate emits a hollow-gate warning for actionable hollow tasks.
import { writeFileSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BACKLOG = resolve(ROOT, 'memory/backlog.yaml');

const hollow = [
  '# memory/backlog.yaml — test fixture (restored after test)',
  'tasks:',
  '  - id: TEST-HOLLOW',
  '    title: A hollow test task',
  '    status: todo',
  '    priority: 1',
  '    acceptance_checks:',
  '      - node scripts/pb.mjs validate',
].join('\n') + '\n';

const orig = readFileSync(BACKLOG, 'utf8');
writeFileSync(BACKLOG, hollow);

let pass = false;
try {
  const out = execSync('node scripts/pb.mjs validate', { cwd: ROOT, encoding: 'utf8' });
  pass = out.includes('Hollow gate warning');
  if (!pass) console.error('FAIL — hollow warning not emitted:\n' + out);
} catch (e) {
  console.error('FAIL — validate threw:', e.message);
} finally {
  writeFileSync(BACKLOG, orig);
}

if (pass) console.log('PASS — pb validate emits hollow-gate warning for actionable hollow tasks');
process.exit(pass ? 0 : 1);
