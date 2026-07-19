// scripts/lib/loop-lib.mjs
// ----------------------------------------------------------------------------
// Shared loop helpers for the closed-loop runners (pb-daily-monitor, pb-flow).
// One definition of "the active loop" so those two scripts can never drift on it
// — a mismatch there makes the flow runner open a duplicate loop epoch that the
// monitor doesn't reuse. pb.mjs keeps its own activeLoop(): it OWNS the loop
// state (different path constants, on the every-turn anchor path) and is the
// source of truth these readers observe.
// ----------------------------------------------------------------------------
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import yaml from 'js-yaml';

// The active loop from <root>/memory/loops.yaml, or null if none is active.
export function readActiveLoop(root) {
  const path = resolve(root, 'memory/loops.yaml');
  if (!existsSync(path)) return null;
  const doc = yaml.load(readFileSync(path, 'utf8'));
  if (!doc || !doc.active) return null;
  return (doc.loops || []).find((l) => l.id === doc.active && l.status === 'active') || null;
}

// Run `node <script> <argv>` capturing stdout+stderr. Returns { code, out };
// never throws on a non-zero exit (callers branch on code). Throws only if the
// spawn itself fails to produce a status (rare). Callers that need throw-on-error
// keep their own wrapper — this is the "inspect the exit code" variant.
export function runNode(script, argv, opts = {}) {
  const { cwd = process.cwd(), env = process.env } = opts;
  try {
    const out = execFileSync(process.execPath, [script, ...argv], { cwd, env, encoding: 'utf8', stdio: 'pipe' });
    return { code: 0, out: out || '' };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout || ''}${e.stderr || ''}` };
  }
}
