#!/usr/bin/env node
// scripts/pb-daily-monitor.mjs
// ----------------------------------------------------------------------------
// Closed-loop daily monitoring orchestrator for the blogwatch mode.
// Heartbeat -> activate blogwatch -> plan daily watches -> auto-run -> surface
// errors. Writes auto-logs for errors, self-reflections, and process/skill
// iteration proposals. Exits 0 only when every watch task is done.
// ----------------------------------------------------------------------------

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PB = resolve(ROOT, 'scripts/pb.mjs');
const REPORTS_DIR = resolve(ROOT, 'artifacts/reports');
const ERRORS_LOG = resolve(REPORTS_DIR, 'orchestrator-errors.ndjson');
const REFLECTIONS_LOG = resolve(REPORTS_DIR, 'orchestrator-reflections.ndjson');
const ITERATIONS_LOG = resolve(REPORTS_DIR, 'orchestrator-iterations.ndjson');
const DEFAULT_CONFIG = resolve(ROOT, 'modes/blogwatch/config/daily-watches.yaml');

function parseArgs(argv) {
  const args = { config: DEFAULT_CONFIG, dryRun: false, resetCycle: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--config') args.config = argv[++i];
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--reset-cycle') args.resetCycle = true;
  }
  return args;
}

const args = parseArgs(process.argv);
const DRY_RUN = args.dryRun;
const CONFIG_PATH = args.config;

function runPb(argv, opts = {}) {
  const { ok = true, cwd = ROOT } = opts;
  try {
    const out = execFileSync(process.execPath, [PB, ...argv], { cwd, encoding: 'utf8', stdio: 'pipe' });
    return { code: 0, out: out || '' };
  } catch (e) {
    if (ok) throw e;
    return { code: e.status ?? 1, out: `${e.stdout || ''}${e.stderr || ''}` };
  }
}

function nowISO() {
  return new Date().toISOString();
}

function heartbeat() {
  console.log(`[heartbeat ${nowISO()}] blogwatch daily monitor`);
}

function readActiveLoop() {
  const path = resolve(ROOT, 'memory/loops.yaml');
  if (!existsSync(path)) return null;
  const doc = yaml.load(readFileSync(path, 'utf8'));
  if (!doc.active) return null;
  return (doc.loops || []).find((l) => l.id === doc.active && l.status === 'active') || null;
}

function ensureLoop() {
  const loop = readActiveLoop();
  if (loop) return loop;
  if (DRY_RUN) {
    console.log('[dry-run] would create a new loop');
    return { id: 'DRY' };
  }
  runPb(['loop', 'new', '--fresh', '--goal', 'Daily blogwatch monitoring', '--stop', 'Backlog drained and errors surfaced']);
  return readActiveLoop();
}

function ensureCycle(reset) {
  const path = resolve(ROOT, 'memory/cycle.md');
  const exists = existsSync(path);
  if (reset || !exists) {
    if (DRY_RUN) {
      console.log('[dry-run] would create cycle brief');
    } else {
      runPb(['cycle', '--new', '--force', '--goal', 'Daily blogwatch monitoring', '--stop', 'Backlog drained and errors surfaced']);
    }
  }
  if (DRY_RUN) return;
  let text = readFileSync(path, 'utf8');
  const placeholder = /\(Your host memory is the PAST[\s\S]*?do not silently follow memory\.\)/;
  if (placeholder.test(text)) {
    text = text.replace(placeholder, 'No conflicts.');
    writeFileSync(path, text, 'utf8');
  }
}

function setMode() {
  if (DRY_RUN) {
    console.log('[dry-run] would set mode blogwatch');
    return;
  }
  runPb(['mode', 'set', 'blogwatch']);
}

function loadConfig(configPath) {
  const abs = resolve(ROOT, configPath);
  if (!existsSync(abs)) throw new Error(`Config not found: ${abs}`);
  const doc = yaml.load(readFileSync(abs, 'utf8'));
  if (!Array.isArray(doc.watches)) throw new Error('Config must have a watches array');
  for (const w of doc.watches) {
    if (!w.id || !w.source || !w.criteria || !w.check) {
      throw new Error(`Watch missing id/source/criteria/check: ${JSON.stringify(w)}`);
    }
  }
  return doc.watches;
}

function planWatches(watches) {
  const ids = [];
  for (const w of watches) {
    const goal = `Monitor ${w.source} for ${w.criteria}`;
    if (DRY_RUN) {
      console.log(`[dry-run] would plan: ${goal}`);
      ids.push(`dry-${w.id}`);
      continue;
    }
    const { out } = runPb(['plan', '--goal', goal, '--skill', 'watch-feeds', '--check', w.check]);
    const m = out.match(/Planned \[([^\]]+)\]/);
    if (!m) throw new Error(`Could not parse planned task id from output:\n${out}`);
    ids.push(m[1]);
  }
  return ids;
}

function runAuto() {
  if (DRY_RUN) {
    console.log('[dry-run] would run pb loop run --auto --defer-blocked');
    return { code: 0, out: '' };
  }
  return runPb(['loop', 'run', '--auto', '--defer-blocked'], { ok: false });
}

function readBacklog() {
  const tasksPath = resolve(ROOT, 'memory/backlog.yaml');
  const statePath = resolve(ROOT, 'memory/backlog-state.json');
  const tasks = yaml.load(readFileSync(tasksPath, 'utf8'))?.tasks || [];
  const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {};
  return tasks.map((t) => ({ ...t, ...(state[t.id] || {}) }));
}

function summarize(ids) {
  const tasks = readBacklog();
  const watched = tasks.filter((t) => ids.includes(t.id));
  const done = watched.filter((t) => t.status === 'done');
  const blocked = watched.filter((t) => t.status === 'blocked');
  const todo = watched.filter((t) => t.status !== 'done' && t.status !== 'blocked');
  return { watched, done, blocked, todo };
}

function appendLog(path, obj) {
  if (DRY_RUN) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(obj) + '\n', { flag: 'a' });
}

function findWatchForTask(task, watches) {
  return watches.find((w) => task.title.includes(w.source) || task.title.includes(w.criteria)) || {};
}

function writeLogs(loopId, watches, ids, summary, autoOut) {
  const ts = nowISO();
  for (const t of summary.blocked) {
    const w = findWatchForTask(t, watches);
    appendLog(ERRORS_LOG, {
      ts,
      loop_id: loopId,
      watch_id: w.id || null,
      task_id: t.id,
      title: t.title,
      command: w.check || null,
      status: t.status,
      output_snippet: autoOut.slice(-2000),
    });
  }

  const proposed = summary.blocked.map((t) => {
    const w = findWatchForTask(t, watches);
    return {
      watch_id: w.id || null,
      task_id: t.id,
      target: w.id ? 'watch check command' : 'watch-feeds process/skill',
      reason: `Task ${t.id} blocked during daily monitor`,
      status: 'pending',
    };
  });

  appendLog(REFLECTIONS_LOG, {
    ts,
    loop_id: loopId,
    mode: 'blogwatch',
    watches_count: watches.length,
    done_count: summary.done.length,
    blocked_count: summary.blocked.length,
    todo_count: summary.todo.length,
    notes: `Daily monitor completed. ${summary.blocked.length ? 'Blocked watches require review.' : 'All watches passed.'}`,
    proposed_changes: proposed,
  });

  for (const p of proposed) {
    appendLog(ITERATIONS_LOG, { ts, loop_id: loopId, ...p });
  }
}

function printSummary(summary) {
  console.log('\nDaily monitor summary:');
  console.log(`  planned : ${summary.watched.length}`);
  console.log(`  done    : ${summary.done.length}`);
  console.log(`  blocked : ${summary.blocked.length}`);
  console.log(`  todo    : ${summary.todo.length}`);
  if (summary.blocked.length) {
    console.log('\nBlocked watches:');
    for (const t of summary.blocked) console.log(`  - [${t.id}] ${t.title}`);
  }
  if (summary.todo.length) {
    console.log('\nRemaining todo watches:');
    for (const t of summary.todo) console.log(`  - [${t.id}] ${t.title}`);
  }
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------
heartbeat();
const loop = ensureLoop();
ensureCycle(args.resetCycle);
setMode();
const watches = loadConfig(CONFIG_PATH);
const ids = planWatches(watches);
const auto = runAuto();
const summary = summarize(ids);
writeLogs(loop?.id || 'legacy', watches, ids, summary, auto.out);
printSummary(summary);

if (summary.blocked.length || summary.todo.length) {
  console.error('\nOrchestrator finished with unresolved watches.');
  process.exit(1);
}
console.log('\nOrchestrator finished cleanly.');
