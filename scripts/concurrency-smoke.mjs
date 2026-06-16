#!/usr/bin/env node
// Real check for "atomic journal append" (review P2 / T5): spawn N parallel writers,
// each doing a SINGLE appendFileSync of one complete NDJSON line — the same one-write
// path `pb record` uses. Assert exactly N well-formed lines result (no interleaving).
import { mkdtempSync, appendFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const N = 30;
const me = fileURLToPath(import.meta.url);

if (process.argv[2] === '--worker') {
  appendFileSync(process.argv[3], JSON.stringify({ ts: new Date().toISOString(), worker: process.argv[4] }) + '\n', 'utf8');
  process.exit(0);
}

const file = join(mkdtempSync(join(tmpdir(), 'pbcc-')), 'journal.ndjson');
appendFileSync(file, '', 'utf8');
await Promise.all(Array.from({ length: N }, (_, i) => new Promise((res, rej) => {
  spawn(process.execPath, [me, '--worker', file, String(i)], { stdio: 'ignore' })
    .on('exit', (code) => (code === 0 ? res() : rej(new Error('worker ' + i))));
})));
const lines = readFileSync(file, 'utf8').split('\n').filter((l) => l.trim());
let bad = 0;
for (const l of lines) { try { JSON.parse(l); } catch { bad++; } }
if (lines.length !== N || bad) { console.error(`FAIL — expected ${N} valid lines, got ${lines.length}, ${bad} malformed`); process.exit(1); }
console.log(`PASS — ${N} parallel appends produced ${N} well-formed JSON lines (no interleaving)`);
