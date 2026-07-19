#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const file = resolve(root, 'memory/project-memory.md');
if (!existsSync(file)) { console.error('FAIL — memory/project-memory.md missing'); process.exit(1); }
const text = readFileSync(file, 'utf8');
const patterns = [
  { name: 'cmd shim rule', re: /\.cmd|\.bat/i },
  { name: 'spawn/execFileSync rule', re: /execFileSync|spawn/i },
  { name: 'cmd.exe wrap rule', re: /cmd\.exe|\/d \/c/i },
];
const missing = patterns.filter(p => !p.re.test(text));
if (missing.length) {
  console.error('FAIL — missing rules in memory/project-memory.md:');
  for (const m of missing) console.error(`  ! ${m.name} (${m.re})`);
  process.exit(1);
}
console.log('PASS — Windows portability rules present in memory/project-memory.md');
