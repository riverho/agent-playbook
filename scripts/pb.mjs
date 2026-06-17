#!/usr/bin/env node
// ============================================================================
//  pb — the Agent-Playbook loop CLI
// ----------------------------------------------------------------------------
//  One command per loop step, so agents move without friction:
//    status | next | record | report | validate | anchor | checkpoint |
//    loop | learn | run | ps | stop | list | scaffold | init | bootstrap | help
//
//  The honest core: a task is "done" when its acceptance_checks — executable
//  shell commands on the task itself — pass. `pb record --status done` runs
//  them and refuses to record on failure. Process documents don't keep the
//  loop honest; exit codes do.
//
//  Master-driven: every path comes from the master (playbook.yaml or
//  playbook.json) under `index` / `paths`, with sensible fallbacks. Drop this
//  file onto an existing project (even one using .json indexes) and it works —
//  the master tells it where everything lives.
//
//  Format-tolerant: index/config files may be .yaml or .json (js-yaml parses
//  both). Everything resolves relative to the master's folder, so the whole
//  playbook is carry-on.
//
//  Only dependency: js-yaml.
// ============================================================================

import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync, copyFileSync, cpSync, openSync } from 'node:fs';
import { execSync, spawn } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

// --- root + base helpers ---------------------------------------------------
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, '..');           // playbook root = parent of scripts/
const p = (...parts) => resolve(ROOT, ...parts);
const exists = (rel) => existsSync(p(rel));

function readText(rel) {
  return rel && existsSync(p(rel)) ? readFileSync(p(rel), 'utf8') : '';
}
function readData(rel) {
  // js-yaml.load parses both YAML and JSON content.
  const text = readText(rel);
  return text ? yaml.load(text) : null;
}
function firstExisting(cands, fallback) {
  for (const c of cands) if (existsSync(p(c))) return c;
  return fallback;
}
const nowISO = () => new Date().toISOString();
const today = () => nowISO().slice(0, 10);

// --- resolve the master, then derive every path from it --------------------
const MASTER = firstExisting(['playbook.yaml', 'playbook.json'], 'playbook.yaml');
// Guard the parse: a malformed master must never crash the CLI — anchor/checkpoint
// run inside runtime hooks on every turn, and a crash there would break the session.
let master = {};
let MASTER_ERR = null;
try { master = readData(MASTER) || {}; }
catch (e) { MASTER_ERR = e.message; }
const mIndex = master.index || {};
const mMem = mIndex.memory || {};
const mPaths = master.paths || {};

const PROCESS_INDEX = mIndex.processes_index || firstExisting(['processes/index.yaml', 'processes/index.json'], 'processes/index.yaml');
const SKILL_INDEX = mIndex.skills_index || firstExisting(['skills/index.yaml', 'skills/index.json'], 'skills/index.yaml');
const BACKLOG = mMem.backlog || 'memory/backlog.yaml';
const JOURNAL = mMem.journal || 'memory/journal.ndjson';
const PROJECT_MEMORY = mMem.project_memory || 'memory/project-memory.md';
const REPORTS_DIR = mPaths.reports || (mIndex.artifacts && mIndex.artifacts.reports) || 'artifacts/reports';
const MEMORY_DIR = dirname(BACKLOG) || 'memory';
const ENTRY = master.entry || 'SKILL.md';
const ALLOWED_STATUSES = (master.guardrails && master.guardrails.allowed_statuses) || ['todo', 'in_progress', 'blocked', 'done'];
const NORTH_STAR = (typeof master.north_star === 'string' && master.north_star.trim()) ? master.north_star.trim().replace(/\s+/g, ' ') : null;
const CYCLE = mMem.cycle || 'memory/cycle.md';
const LOOPS = mMem.loops || 'memory/loops.yaml';
const LESSONS = mMem.lessons || 'memory/lessons.ndjson';
const PROCESSES = mMem.processes || 'memory/processes.ndjson';
const ARTIFACTS_DIR = mPaths.artifacts || 'artifacts';
const LOOP_ARTIFACTS_DIR = join(ARTIFACTS_DIR, 'loops');

// --- structured helpers ----------------------------------------------------
function readJournal() {
  return readText(JOURNAL)
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .map((l, i) => {
      try { return JSON.parse(l); }
      catch { return { __malformed: true, __line: i + 1, raw: l }; }
    });
}
function writeBacklog(obj) {
  if (BACKLOG.endsWith('.json')) {
    writeFileSync(p(BACKLOG), JSON.stringify(obj, null, 2) + '\n', 'utf8');
    return;
  }
  const header =
    `# ${BACKLOG} — the task queue the loop pulls from.\n` +
    '# Managed by `pb` (next --claim / record). Edit by hand to add tasks.\n' +
    `# status: ${ALLOWED_STATUSES.join(' | ')}   priority: 1 = highest\n` +
    '# acceptance_checks: shell commands that must exit 0 before `record --status done` succeeds.\n';
  writeFileSync(p(BACKLOG), header + yaml.dump(obj, { lineWidth: 100 }), 'utf8');
}
function ensureDir(rel) {
  const dir = p(rel);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}
function writeIfMissing(rel, text, created) {
  ensureDir(dirname(rel));
  if (!existsSync(p(rel))) {
    writeFileSync(p(rel), text, 'utf8');
    created.push(rel);
  }
}
function readNdjson(rel) {
  return readText(rel)
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .map((l, i) => {
      try { return JSON.parse(l); }
      catch { return { __malformed: true, __line: i + 1, raw: l }; }
    });
}
function appendNdjson(rel, obj) {
  ensureDir(dirname(rel));
  appendFileSync(p(rel), JSON.stringify(obj) + '\n', 'utf8');
}
function journalLineCount() {
  return readText(JOURNAL).split(/\r?\n/).filter((l) => l.trim().length > 0).length;
}
function readLoops() {
  let data = null;
  try { data = readData(LOOPS); }
  catch { data = null; }
  return {
    active: typeof data?.active === 'string' ? data.active : null,
    loops: Array.isArray(data?.loops) ? data.loops : [],
  };
}
function writeLoops(state) {
  ensureDir(dirname(LOOPS));
  writeFileSync(p(LOOPS), yaml.dump({
    active: state.active || null,
    loops: Array.isArray(state.loops) ? state.loops : [],
  }, { lineWidth: 100 }), 'utf8');
}
function activeLoop() {
  const state = readLoops();
  const loop = state.active ? state.loops.find((l) => l.id === state.active) : null;
  return loop && loop.status === 'active' ? loop : null;
}
function latestLoop() {
  const loops = readLoops().loops;
  return loops.length ? loops[loops.length - 1] : null;
}
function loopById(id) {
  return readLoops().loops.find((l) => l.id === id) || null;
}
function nextLoopId(state = readLoops()) {
  const prefix = `loop-${today().replace(/-/g, '')}`;
  const n = state.loops.filter((l) => String(l.id || '').startsWith(prefix)).length + 1;
  return `${prefix}-${String(n).padStart(3, '0')}`;
}
function loopArtifactsRel(loopId, ...parts) {
  return join(LOOP_ARTIFACTS_DIR, loopId, ...parts);
}
function readLessons() {
  return readNdjson(LESSONS).filter((e) => !e.__malformed);
}
function openLessons() {
  return readLessons().filter((l) => l.status !== 'promoted' && l.status !== 'closed');
}
function lessonsForLoop(loopId) {
  return readLessons().filter((l) => l.loop_id === loopId);
}
function nextLessonId() {
  const prefix = `lesson-${today().replace(/-/g, '')}`;
  const n = readLessons().filter((l) => String(l.id || '').startsWith(prefix)).length + 1;
  return `${prefix}-${String(n).padStart(3, '0')}`;
}
function readProcessEvents() {
  return readNdjson(PROCESSES).filter((e) => !e.__malformed);
}
function latestProcessRecords(loopId = null) {
  const byPid = new Map();
  for (const e of readProcessEvents()) {
    if (loopId && e.loop_id !== loopId) continue;
    if (e.pid !== undefined) byPid.set(`${e.loop_id}:${e.pid}`, e);
  }
  return [...byPid.values()];
}
function pidAlive(pid) {
  const n = Number(pid);
  if (!Number.isInteger(n) || n <= 0) return false;
  try {
    process.kill(n, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}
function stopPid(pid) {
  const n = Number(pid);
  if (!Number.isInteger(n) || n <= 0) return false;
  try {
    if (process.platform === 'win32') execSync(`taskkill /PID ${n} /T /F`, { stdio: 'pipe' });
    else process.kill(-n, 'SIGTERM');
    return true;
  } catch {
    try { process.kill(n, 'SIGTERM'); return true; }
    catch { return false; }
  }
}
function stopLoopProcesses(loopId) {
  const stopped = [];
  for (const proc of latestProcessRecords(loopId)) {
    const alive = proc.status !== 'stopped' && pidAlive(proc.pid);
    if (!alive) continue;
    const ok = stopPid(proc.pid);
    const event = { ...proc, ts: nowISO(), status: ok ? 'stopped' : 'stop_failed', stopped_at: nowISO() };
    appendNdjson(PROCESSES, event);
    stopped.push(event);
  }
  return stopped;
}

// minimal arg parser: positionals in `_`, --key value / --flag true
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok === '--') {
      out['--'] = argv.slice(i + 1);
      break;
    }
    if (tok.startsWith('--')) {
      const key = tok.slice(2);
      const nxt = argv[i + 1];
      if (nxt === undefined || nxt.startsWith('--')) out[key] = true;
      else { out[key] = nxt; i++; }
    } else {
      out._.push(tok);
    }
  }
  return out;
}

const prio = (t) => (typeof t.priority === 'number' ? t.priority : 100);
function backlogTasks() {
  const bl = readData(BACKLOG);
  return Array.isArray(bl?.tasks) ? bl.tasks : [];
}
function skillFor(skillId) {
  const idx = readData(SKILL_INDEX);
  return (idx?.skills || []).find((s) => s.id === skillId) || null;
}
function unmetDeps(task, tasks) {
  const deps = Array.isArray(task.dependencies) ? task.dependencies : [];
  return deps.filter((dep) => !tasks.some((t) => t.id === dep && t.status === 'done'));
}

// ============================================================================
//  acceptance checks — the enforcement layer. Checks are shell commands on the
//  task; they run with cwd = playbook root. Exit 0 = pass. This is what makes
//  "done" mean something: `record --status done` refuses if any check fails.
// ============================================================================
function taskChecks(task) {
  return (Array.isArray(task?.acceptance_checks) ? task.acceptance_checks : [])
    .filter((c) => typeof c === 'string' && c.trim());
}

function gateQuality(task) {
  const checks = taskChecks(task);
  if (!checks.length) return '·honor';
  const structuralOnly = (c) => /(^|\s)(node\s+scripts\/pb\.mjs|pb(\.mjs)?|npm\s+run)\s+validate\b/.test(c.trim()) && !/--task/.test(c);
  return checks.every(structuralOnly) ? '⚠hollow' : '✓verified';
}
function reportCheckMarker(entry, task) {
  if (entry.checks === 'skipped') return ' ⚠checks-skipped';
  if (entry.checks !== 'passed') return '';
  const quality = task ? gateQuality(task) : '✓verified';
  return quality === '⚠hollow' ? ' ⚠hollow-checks' : ' ✓verified';
}
function runChecks(task) {
  const checks = taskChecks(task);
  const results = [];
  for (const cmd of checks) {
    try {
      execSync(cmd, { cwd: ROOT, stdio: 'pipe', timeout: 120000 });
      results.push({ cmd, ok: true });
    } catch (e) {
      const out = [e.stdout, e.stderr].filter(Boolean).map(String).join('\n').trim();
      results.push({ cmd, ok: false, output: out.split(/\r?\n/).slice(-8).join('\n') });
    }
  }
  return results;
}
function printCheckResults(results) {
  for (const r of results) {
    console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.cmd}`);
    if (!r.ok && r.output) console.log(r.output.split(/\r?\n/).map((l) => `        ${l}`).join('\n'));
  }
}

// ============================================================================
//  validate — guardrails. No args: structural (master, indices, files, backlog,
//  journal). --task <id>: run that task's executable acceptance_checks.
//  Exit 1 on any failure.
// ============================================================================
function runValidate() {
  const failures = [];
  const ok = (cond, msg) => { if (!cond) failures.push(msg); };

  // 1. master
  if (MASTER_ERR) failures.push(`Master parse error in ${MASTER}: ${MASTER_ERR}`);
  ok(master && Object.keys(master).length, `Missing or unparseable master: ${MASTER}`);
  for (const key of ['name', 'version', 'entry', 'paths', 'index', 'loop', 'guardrails']) {
    ok(master[key] !== undefined, `${MASTER} is missing required key: ${key}`);
  }
  ok(exists(ENTRY), `entry file does not exist: ${ENTRY}`);

  // 2. processes index + each referenced process file
  const pidx = readData(PROCESS_INDEX);
  ok(pidx, `Missing or unparseable process index: ${PROCESS_INDEX}`);
  const processIds = new Set();
  for (const proc of pidx?.processes || []) {
    ok(proc.id, `A process entry in ${PROCESS_INDEX} is missing an id`);
    if (proc.id) processIds.add(proc.id);
    ok(proc.file && exists(proc.file), `Process file missing: ${proc.file} (id: ${proc.id})`);
  }

  // 3. skills index + each skill file + each process ref resolves (by id or path)
  const sidx = readData(SKILL_INDEX);
  ok(sidx, `Missing or unparseable skill index: ${SKILL_INDEX}`);
  for (const sk of sidx?.skills || []) {
    ok(sk.id, `A skill entry in ${SKILL_INDEX} is missing an id`);
    ok(sk.file && exists(sk.file), `Skill file missing: ${sk.file} (id: ${sk.id})`);
    if (sk.process) {
      const resolves = processIds.has(sk.process) || exists(sk.process);
      ok(resolves, `Skill "${sk.id}" points to a process that does not resolve: ${sk.process}`);
    }
  }

  // 4. memory files
  ok(exists(PROJECT_MEMORY), `Missing project memory: ${PROJECT_MEMORY}`);
  ok(exists(BACKLOG), `Missing backlog: ${BACKLOG}`);
  ok(existsSync(p(JOURNAL)), `Missing journal: ${JOURNAL} (run \`pb init\` to create it)`);

  // 5. backlog well-formed
  const bl = readData(BACKLOG);
  if (bl) {
    const tasks = Array.isArray(bl.tasks) ? bl.tasks : null;
    ok(tasks, `${BACKLOG} must contain a "tasks" list`);
    const ids = new Set((tasks || []).map((t) => t.id).filter(Boolean));
    for (const t of tasks || []) {
      ok(t.id, 'A backlog task is missing an id');
      ok(ALLOWED_STATUSES.includes(t.status), `Task ${t.id} has invalid status: ${t.status}`);
      if (t.skill) ok(skillFor(t.skill), `Task ${t.id} references unknown skill: ${t.skill}`);
      for (const dep of t.dependencies || []) {
        ok(ids.has(dep), `Task ${t.id} references unknown dependency: ${dep}`);
      }
      if (t.acceptance_checks !== undefined) {
        ok(Array.isArray(t.acceptance_checks) && t.acceptance_checks.every((c) => typeof c === 'string'),
          `Task ${t.id} acceptance_checks must be a list of shell command strings`);
      }
    }
  }

  // 6. journal lines all valid JSON
  readJournal().forEach((e) => {
    if (e.__malformed) failures.push(`Malformed JSON in ${JOURNAL} line ${e.__line}`);
  });
  if (existsSync(p(LOOPS))) {
    try { yaml.load(readText(LOOPS)); }
    catch (e) { failures.push(`Malformed YAML in ${LOOPS}: ${e.message}`); }
    const loops = readLoops();
    ok(Array.isArray(loops.loops), `${LOOPS} must contain a "loops" list`);
    const ids = new Set();
    for (const l of loops.loops) {
      ok(l.id, `A loop entry in ${LOOPS} is missing an id`);
      if (l.id) ids.add(l.id);
      ok(['active', 'done', 'failed', 'quarantined', 'abandoned'].includes(l.status), `Loop ${l.id || '?'} has invalid status: ${l.status}`);
    }
    if (loops.active) ok(ids.has(loops.active), `${LOOPS} active loop does not exist: ${loops.active}`);
  }
  if (existsSync(p(LESSONS))) {
    readNdjson(LESSONS).forEach((e) => {
      if (e.__malformed) failures.push(`Malformed JSON in ${LESSONS} line ${e.__line}`);
    });
  }
  if (existsSync(p(PROCESSES))) {
    readNdjson(PROCESSES).forEach((e) => {
      if (e.__malformed) failures.push(`Malformed JSON in ${PROCESSES} line ${e.__line}`);
    });
  }

  // 7. declared paths targets exist
  for (const [k, v] of Object.entries(mPaths)) {
    ok(exists(v), `paths.${k} target does not exist: ${v}`);
  }

  return failures;
}

function cmdValidate(args) {
  if (typeof args.task === 'string') {
    const task = backlogTasks().find((t) => t.id === args.task);
    if (!task) {
      console.error(`Task not found in ${BACKLOG}: ${args.task}`);
      process.exit(1);
    }
    const checks = taskChecks(task);
    if (!checks.length) {
      console.log(`[${task.id}] has no acceptance_checks — verification is manual. Add executable checks to make "done" enforceable.`);
      return;
    }
    console.log(`Running ${checks.length} acceptance check(s) for [${task.id}] (cwd: playbook root):`);
    const results = runChecks(task);
    printCheckResults(results);
    if (results.some((r) => !r.ok)) process.exit(1);
    console.log(`All checks passed for [${task.id}].`);
    return;
  }

  const failures = runValidate();
  if (failures.length) {
    console.error('Playbook validation FAILED:\n');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log('Playbook validation passed.');

  // Hollow-check pass: warn (or fail with --strict) when actionable tasks rely only on
  // structural checks. The structural gate (pb validate) proves the playbook is well-formed,
  // not that the task's work was done — making "done" a false green.
  const allTasks = backlogTasks();
  const hollowActionable = allTasks.filter(
    (t) => ['todo', 'in_progress'].includes(t.status) && gateQuality(t) === '⚠hollow'
  );
  if (hollowActionable.length) {
    console.log(`\n⚠ Hollow gate warning: ${hollowActionable.length} actionable task(s) use only structural checks (pb validate):`);
    for (const t of hollowActionable) console.log(`  ⚠hollow  [${t.id}] ${t.title || ''}`);
    console.log('Add task-specific acceptance_checks that test the work itself. Run \`node scripts/check-hollow.mjs .\` for details.');
    if (args.strict) { console.error('\nFailing (--strict): hollow gates on actionable tasks.'); process.exit(1); }
  }
}

// ============================================================================
//  status — the "where am I" orient snapshot
// ============================================================================
function cmdStatus() {
  const tasks = backlogTasks();
  const journal = readJournal();

  console.log(`\n  ${master?.name || 'playbook'} v${master?.version || '?'} — ${(master?.description || '').trim().split('\n')[0]}`);
  console.log('  ' + '-'.repeat(68));

  const counts = Object.fromEntries(ALLOWED_STATUSES.map((s) => [s, 0]));
  for (const t of tasks) if (counts[t.status] !== undefined) counts[t.status]++;
  console.log('  Backlog: ' + ALLOWED_STATUSES.map((s) => `${counts[s]} ${s}`).join('  •  '));
  const loop = activeLoop();
  const highLessons = openLessons().filter((l) => l.severity === 'high').length;
  console.log(`  Loop:    ${loop ? `${loop.id} active` : '(none active)'}  •  ${highLessons} high-severity lesson(s) open`);

  const next = tasks.filter((t) => t.status === 'todo').sort((a, b) => prio(a) - prio(b))[0];
  if (next) console.log(`  Next up: [${next.id}] ${next.title}  → skill: ${next.skill || '(none)'}`);
  const wip = tasks.filter((t) => t.status === 'in_progress');
  if (wip.length) console.log(`  In progress: ${wip.map((t) => `[${t.id}] ${t.title}`).join('; ')}`);

  const tail = journal.slice(-5);
  console.log('  ' + '-'.repeat(68));
  if (tail.length) {
    console.log('  Recent journal:');
    for (const e of tail) {
      console.log(`    ${e.ts?.slice(0, 19) || '?'}  [${e.task || '-'}] ${e.action || '?'} → ${e.status || '?'}`);
    }
  } else {
    console.log('  Journal is empty — nothing recorded yet.');
  }

  const failures = runValidate();
  console.log('  ' + '-'.repeat(68));
  console.log(failures.length ? `  Guardrails: FAIL (${failures.length}) — run \`pb validate\`` : '  Guardrails: green');
  console.log('');
}

// ============================================================================
//  next — select the next task (and optionally claim it)
// ============================================================================
function cmdNext(args) {
  const bl = readData(BACKLOG) || { tasks: [] };
  const tasks = Array.isArray(bl.tasks) ? bl.tasks : [];
  const todo = tasks.filter((t) => t.status === 'todo');
  const claimable = todo.filter((t) => unmetDeps(t, tasks).length === 0);
  const candidate = claimable.sort((a, b) => prio(a) - prio(b))[0];

  if (!candidate) {
    if (!todo.length) {
      console.log(`No actionable tasks (nothing in "todo"). Add one to ${BACKLOG}.`);
      return;
    }
    console.log('No claimable todo tasks. Blockers:');
    for (const t of todo) {
      const deps = unmetDeps(t, tasks);
      if (deps.length) console.log(`  [${t.id}] waiting on: ${deps.join(', ')}`);
    }
    return;
  }

  const sk = candidate.skill ? skillFor(candidate.skill) : null;
  console.log(`\n  Next task: [${candidate.id}] ${candidate.title}`);
  console.log(`  Priority:  ${prio(candidate)}`);
  if (candidate.notes) console.log(`  Notes:     ${candidate.notes}`);
  console.log(`  Skill:     ${candidate.skill || '(none — improvise, then write one)'}`);
  if (sk) {
    console.log(`    → open:    ${sk.file}`);
    if (sk.process) console.log(`    → process: ${sk.process}`);
  }
  const checks = taskChecks(candidate);
  if (checks.length) {
    console.log(`  Done means (these must exit 0):`);
    for (const c of checks) console.log(`    $ ${c}`);
  } else {
    console.log(`  Checks:    none — "done" is on your honor. Add acceptance_checks if possible.`);
  }

  if (args.claim) {
    const loop = activeLoop();
    candidate.status = 'in_progress';
    candidate.claimed_at = nowISO();
    if (loop) candidate.loop_id = loop.id;
    writeBacklog(bl);
    console.log(`\n  Claimed [${candidate.id}] → in_progress.`);
    if (loop) console.log(`  Loop: ${loop.id}`);
    console.log(`  Next: do the work via the skill, then \`pb record --task ${candidate.id} ...\`.`);
  } else {
    console.log(`\n  Run with --claim to mark it in_progress.`);
  }
  console.log('');
}

// ============================================================================
//  record — append a structured journal entry (the agent-first record).
//  Recording done RUNS the task's acceptance_checks first and refuses on
//  failure. --skip-checks is the escape hatch, and it is stamped on the entry.
// ============================================================================
function cmdRecord(args) {
  if (!args.task || !args.action || !args.status) {
    console.error('Usage: pb record --task <id> --action <action> --status <status> [--result <r>] [--files a,b] [--notes "..."] [--agent <name>] [--loop <id>] [--skip-checks] [--require-loop]');
    console.error(`status must be one of: ${ALLOWED_STATUSES.join(', ')}`);
    process.exit(1);
  }
  if (!ALLOWED_STATUSES.includes(args.status)) {
    console.error(`Invalid status "${args.status}". Allowed: ${ALLOWED_STATUSES.join(', ')}`);
    process.exit(1);
  }

  const task = backlogTasks().find((t) => t.id === args.task);
  const loop = args.loop ? loopById(args.loop) : activeLoop();
  if (args['require-loop'] && !loop) {
    console.error('No active loop. Start one with `pb loop new`, or pass --loop <id>.');
    process.exit(1);
  }
  const loopId = loop?.id || args.loop || 'legacy';
  if (!loop && !args.loop) console.log('WARNING: no active loop; recording with loop_id=legacy.');
  let checksOutcome = 'none';
  if (args.status === 'done' && task) {
    const checks = taskChecks(task);
    if (checks.length && args['skip-checks']) {
      checksOutcome = 'skipped';
      console.log(`WARNING: recording done with ${checks.length} acceptance check(s) SKIPPED. The journal will say so.`);
    } else if (checks.length) {
      console.log(`Running ${checks.length} acceptance check(s) for [${task.id}] before recording done:`);
      const results = runChecks(task);
      printCheckResults(results);
      if (results.some((r) => !r.ok)) {
        console.error(`\nRefusing to record [${task.id}] as done — acceptance checks failed.`);
        console.error('Fix the work, or record --status blocked with notes. (--skip-checks overrides, and is stamped on the entry.)');
        process.exit(1);
      }
      checksOutcome = 'passed';
    }
  }

  const entry = {
    ts: nowISO(),
    loop_id: loopId,
    task: args.task,
    agent: args.agent || 'agent',
    action: args.action,
    status: args.status,
    checks: checksOutcome,
    result: args.result || null,
    files: args.files ? String(args.files).split(',').map((s) => s.trim()).filter(Boolean) : [],
    notes: args.notes || null,
  };
  ensureDir(MEMORY_DIR);
  appendFileSync(p(JOURNAL), JSON.stringify(entry) + '\n', 'utf8');
  console.log(`Recorded [${entry.task}] ${entry.action} → ${entry.status}${checksOutcome !== 'none' ? ` (checks: ${checksOutcome})` : ''}`);

  // keep backlog coherent: sync the task's status when the iteration ends it
  if (['done', 'blocked'].includes(args.status)) {
    const bl = readData(BACKLOG);
    const t = (bl?.tasks || []).find((x) => x.id === args.task);
    if (t && t.status !== args.status) {
      t.status = args.status;
      t.updated_at = entry.ts;
      if (loop && !t.loop_id) t.loop_id = loop.id;
      writeBacklog(bl);
      console.log(`Backlog [${t.id}] → ${args.status}.`);
    }
  }
}

// ============================================================================
//  loop — durable loop epochs. A failed loop can be closed/quarantined without
//  erasing its journal rows; the next loop gets a clean active loop_id.
// ============================================================================
function claimedTasksForLoop(loopId) {
  return backlogTasks().filter((t) => t.loop_id === loopId);
}
function terminalJournalForTask(loopId, taskId) {
  return readJournal().filter((e) => !e.__malformed)
    .some((e) => e.loop_id === loopId && e.task === taskId && ['done', 'blocked'].includes(e.status));
}
function closeGateErrors(loop, args = {}) {
  const errors = [];
  const failures = runValidate();
  if (failures.length) errors.push(`Guardrails fail (${failures.length}); run \`pb validate\`.`);

  const wip = backlogTasks().filter((t) => t.status === 'in_progress');
  if (wip.length) errors.push(`${wip.length} task(s) still in_progress: ${wip.map((t) => t.id).join(', ')}`);

  for (const t of claimedTasksForLoop(loop.id)) {
    if (!terminalJournalForTask(loop.id, t.id)) errors.push(`[${t.id}] was claimed in this loop but has no terminal loop-scoped journal record.`);
  }

  const live = latestProcessRecords(loop.id).filter((proc) => proc.status !== 'stopped' && pidAlive(proc.pid));
  if (live.length) errors.push(`${live.length} tracked process(es) still alive: ${live.map((p) => p.pid).join(', ')}`);

  const journal = readJournal().filter((e) => !e.__malformed);
  const reflectTs = lastReflectTs(journal, loop.id);
  if (!args['allow-unreflected'] && (!reflectTs || (loop.started_at && reflectTs < loop.started_at))) {
    errors.push('No reflection recorded for this loop; run `pb reflect --notes "..."` or close with --allow-unreflected.');
  }

  const cyc = readCycle();
  if (!cyc.exists || !cyc.stop) errors.push(`No cycle stop condition found in ${CYCLE}.`);
  return errors;
}
function writeLoopReport(loop, status, notes = '') {
  const rel = loopArtifactsRel(loop.id, 'reports', 'close.md');
  const entries = readJournal().filter((e) => !e.__malformed && e.loop_id === loop.id);
  const lines = [
    `# Loop Close — ${loop.id}`,
    '',
    `- status: ${status}`,
    `- started_at: ${loop.started_at || ''}`,
    `- closed_at: ${loop.closed_at || ''}`,
    `- journal lines: ${loop.journal?.first_line ?? '?'}-${loop.journal?.last_line ?? '?'}`,
    notes ? `- notes: ${notes}` : null,
    '',
    '## Journal',
    '',
  ].filter(Boolean);
  if (!entries.length) lines.push('_No loop-scoped journal entries._');
  for (const e of entries) lines.push(`- ${e.ts?.slice(0, 19) || '?'} [${e.task || '-'}] ${e.action || '?'} -> ${e.status || '?'}`);
  ensureDir(dirname(rel));
  writeFileSync(p(rel), lines.join('\n') + '\n', 'utf8');
  return rel;
}
function writeQuarantine(loop, reason, stopped) {
  const rel = loopArtifactsRel(loop.id, 'quarantine.md');
  const lines = [
    `# Loop Quarantine — ${loop.id}`,
    '',
    `- reason: ${reason}`,
    `- started_at: ${loop.started_at || ''}`,
    `- closed_at: ${loop.closed_at || ''}`,
    `- journal lines: ${loop.journal?.first_line ?? '?'}-${loop.journal?.last_line ?? '?'}`,
    '',
    '## Processes',
    '',
  ];
  if (!stopped.length) lines.push('_No live tracked processes stopped._');
  for (const proc of stopped) lines.push(`- pid ${proc.pid}: ${proc.status} (${proc.cmd || proc.command || ''})`);
  lines.push('', '## Next', '', 'Run `pb learn --loop ' + loop.id + ' --source user --notes "..."` before starting the next loop.');
  ensureDir(dirname(rel));
  writeFileSync(p(rel), lines.join('\n') + '\n', 'utf8');
  return rel;
}
function failedLoopNeedsLearning(state) {
  return [...state.loops].reverse().find((l) =>
    l.status === 'failed' && !l.learning_skipped && lessonsForLoop(l.id).length === 0
  ) || null;
}
function seedCycleFromLoop(loop, args) {
  const cur = readCycle();
  const phase = (Number.isInteger(cur.phase) ? cur.phase : 0) + 1;
  const high = openLessons().filter((l) => l.severity === 'high');
  const prior = high.length
    ? high.map((l) => `- [${l.id}] ${l.problem || l.notes || l.raw_notes || '(no problem)'}`).join('\n')
    : 'No open high-severity lessons.';
  const challenges = args['from-lessons'] && high.length
    ? high.map((l) => `- Avoid repeating ${l.loop_id || 'prior loop'}: ${l.problem || l.notes || l.raw_notes || '(no problem)'}`).join('\n')
    : null;
  const conflicts = args['from-lessons'] && high.length
    ? 'Review open high-severity lessons before following host memory or old assumptions.'
    : null;
  ensureDir(dirname(CYCLE));
  writeFileSync(p(CYCLE), cycleTemplate({
    phase,
    goal: args.goal || loop.goal,
    stop: args.stop || loop.stop,
    challenges,
    priorChallenges: prior,
    conflicts,
  }), 'utf8');
}
function cmdLoop(args) {
  const sub = args._[0] || 'status';
  if (sub === 'new') {
    const state = readLoops();
    const active = state.active ? state.loops.find((l) => l.id === state.active) : null;
    if (active && active.status === 'active') {
      console.error(`Refusing: loop already active: ${active.id}. Close it first with \`pb loop close\`.`);
      process.exit(1);
    }
    const failed = failedLoopNeedsLearning(state);
    if (failed) {
      if (!args['skip-learning']) {
        console.error(`Refusing: failed loop ${failed.id} has no learning reflection.`);
        console.error(`Run \`pb learn --loop ${failed.id} --source user --notes "..."\`, or use --skip-learning "reason".`);
        process.exit(1);
      }
      failed.learning_skipped = { ts: nowISO(), reason: args['skip-learning'] === true ? 'no reason supplied' : String(args['skip-learning']) };
    }
    const id = nextLoopId(state);
    const loop = {
      id,
      status: 'active',
      started_at: nowISO(),
      closed_at: null,
      goal: args.goal || '',
      stop: args.stop || '',
      journal: { first_line: journalLineCount() + 1, last_line: null },
      artifacts: loopArtifactsRel(id),
      reason: null,
    };
    state.active = id;
    state.loops.push(loop);
    writeLoops(state);
    for (const d of ['logs', 'reports', 'snapshots']) ensureDir(loopArtifactsRel(id, d));
    if (args.goal || args.stop || args['from-lessons']) seedCycleFromLoop(loop, args);
    console.log(`Opened loop: ${id}`);
    console.log(`Artifacts: ${loop.artifacts}`);
    console.log('Next: `pb status`, then claim work or record progress.');
    return;
  }

  if (sub === 'status') {
    const state = readLoops();
    const loop = activeLoop();
    console.log('\nLoop state:');
    console.log(`  active: ${loop ? loop.id : '(none)'}`);
    console.log(`  total:  ${state.loops.length}`);
    if (loop) {
      const entries = readJournal().filter((e) => !e.__malformed && e.loop_id === loop.id);
      const live = latestProcessRecords(loop.id).filter((p) => p.status !== 'stopped' && pidAlive(p.pid));
      const errors = closeGateErrors(loop, { 'allow-unreflected': true });
      console.log(`  started: ${String(loop.started_at).slice(0, 19)}`);
      console.log(`  journal entries: ${entries.length}`);
      console.log(`  live tracked processes: ${live.length}`);
      console.log(errors.length ? `  close gate: blocked (${errors.length})` : '  close gate: clear (reflection may still be required)');
    }
    const failed = failedLoopNeedsLearning(state);
    if (failed) console.log(`  learning needed: ${failed.id}`);
    console.log('');
    return;
  }

  if (sub === 'close') {
    const status = args.status || 'done';
    if (!['done', 'failed', 'abandoned'].includes(status)) {
      console.error('Usage: pb loop close --status <done|failed|abandoned> [--reason "..."] [--allow-unreflected]');
      process.exit(1);
    }
    const state = readLoops();
    const loop = activeLoop();
    if (!loop) {
      console.error('No active loop to close.');
      process.exit(1);
    }
    if (status === 'done') {
      const errors = closeGateErrors(loop, args);
      if (errors.length) {
        console.error(`Refusing to close ${loop.id} as done:`);
        for (const e of errors) console.error(`  - ${e}`);
        process.exit(1);
      }
    }
    const stored = state.loops.find((l) => l.id === loop.id);
    stored.status = status;
    stored.closed_at = nowISO();
    stored.reason = args.reason || null;
    stored.journal = { ...(stored.journal || {}), last_line: journalLineCount() };
    if (args['allow-unreflected']) stored.allow_unreflected = { ts: nowISO(), reason: args['allow-unreflected'] === true ? 'operator override' : String(args['allow-unreflected']) };
    let artifact = null;
    if (status === 'failed' || status === 'abandoned') {
      const stopped = stopLoopProcesses(loop.id);
      artifact = writeQuarantine(stored, args.reason || status, stopped);
    } else {
      artifact = writeLoopReport(stored, status, args.reason || '');
    }
    state.active = null;
    writeLoops(state);
    console.log(`Closed loop ${loop.id} -> ${status}.`);
    if (artifact) console.log(`Artifact: ${artifact}`);
    if (status === 'failed') console.log(`Next: \`pb learn --loop ${loop.id} --source user --notes "..."\`.`);
    return;
  }

  if (sub === 'quarantine') {
    const id = args._[1] || args.loop;
    if (!id) { console.error('Usage: pb loop quarantine <loop_id>'); process.exit(1); }
    const state = readLoops();
    const loop = state.loops.find((l) => l.id === id);
    if (!loop) { console.error(`Loop not found: ${id}`); process.exit(1); }
    loop.status = 'quarantined';
    loop.quarantined_at = nowISO();
    writeLoops(state);
    console.log(`Loop ${id} -> quarantined.`);
    return;
  }

  console.error(`Unknown loop command: ${sub}`);
  process.exit(1);
}

// ============================================================================
//  learn — structured user/agent reflection. Raw lessons stay in lessons.ndjson;
//  durable rules, repair tasks, and skills are explicit promotions.
// ============================================================================
function cmdLearn(args) {
  if (args._[0] === 'status') {
    const lessons = readLessons();
    const open = lessons.filter((l) => l.status !== 'promoted' && l.status !== 'closed');
    console.log('\nLessons:');
    console.log(`  total: ${lessons.length}`);
    console.log(`  open:  ${open.length}`);
    for (const l of open) {
      console.log(`  [${l.id}] ${l.severity || 'medium'} ${l.loop_id || 'legacy'} -> ${l.promotion || 'journal'}: ${l.problem || l.notes || l.raw_notes || ''}`);
    }
    console.log('');
    return;
  }

  const loop = args.loop || activeLoop()?.id || latestLoop()?.id || 'legacy';
  const notes = args.notes || args.problem || args._.join(' ');
  if (!notes) {
    console.error('Usage: pb learn --loop <id> --source user --notes "what went wrong" [--severity high] [--promotion memory|backlog|skill|journal] [--target <file-or-task>]');
    process.exit(1);
  }
  const promotion = args.promotion || 'journal';
  if (!['journal', 'memory', 'backlog', 'skill'].includes(promotion)) {
    console.error('promotion must be one of: journal, memory, backlog, skill');
    process.exit(1);
  }
  const entry = {
    id: nextLessonId(),
    loop_id: loop,
    source: args.source || 'agent',
    severity: args.severity || 'medium',
    problem: args.problem || notes,
    root_cause: args['root-cause'] || args.root_cause || null,
    promotion,
    promotion_target: args.target || null,
    status: args.status || 'open',
    applies_to: args.applies_to ? String(args.applies_to).split(',').map((s) => s.trim()).filter(Boolean) : [],
    raw_notes: notes,
    created_at: nowISO(),
  };
  appendNdjson(LESSONS, entry);
  console.log(`Recorded lesson ${entry.id} for ${loop} -> ${promotion}.`);
  if (promotion !== 'journal' && !entry.promotion_target) {
    console.log('Promotion target is not set yet; add a backlog task or update the relevant memory/skill file before closing the lesson.');
  }
}

// ============================================================================
//  run / ps / stop — lightweight loop-scoped process tracking.
// ============================================================================
function cmdRun(args) {
  const loop = activeLoop();
  if (!loop) {
    console.error('No active loop. Start one with `pb loop new` before `pb run`.');
    process.exit(1);
  }
  const parts = args['--'] || args._;
  if (!parts?.length) {
    console.error('Usage: pb run -- <command>');
    process.exit(1);
  }
  const cmd = parts.join(' ');
  const stamp = nowISO().replace(/[:.]/g, '-');
  const safe = String(parts[0]).replace(/[^a-zA-Z0-9._-]/g, '_') || 'command';
  const outRel = loopArtifactsRel(loop.id, 'logs', `${stamp}-${safe}.out.log`);
  const errRel = loopArtifactsRel(loop.id, 'logs', `${stamp}-${safe}.err.log`);
  ensureDir(dirname(outRel));
  const child = spawn(cmd, {
    cwd: ROOT,
    shell: true,
    detached: true,
    stdio: ['ignore', openSync(p(outRel), 'a'), openSync(p(errRel), 'a')],
  });
  child.unref();
  appendNdjson(PROCESSES, {
    ts: nowISO(),
    loop_id: loop.id,
    pid: child.pid,
    cmd,
    cwd: '.',
    status: 'running',
    logs: { stdout: outRel, stderr: errRel },
  });
  console.log(`Started [${loop.id}] pid ${child.pid}: ${cmd}`);
  console.log(`Logs: ${outRel} / ${errRel}`);
}

function cmdPs(args) {
  const loopId = args.loop || activeLoop()?.id;
  const rows = latestProcessRecords(loopId || null);
  console.log('\nTracked processes:');
  if (!rows.length) console.log('  (none)');
  for (const proc of rows) {
    const alive = proc.status !== 'stopped' && pidAlive(proc.pid);
    console.log(`  ${proc.loop_id || 'legacy'} pid ${proc.pid} ${alive ? 'alive' : 'not-alive'} ${proc.status || ''} ${proc.cmd || ''}`);
  }
  console.log('');
}

function cmdStop(args) {
  const loopId = args.loop || activeLoop()?.id;
  if (!loopId) {
    console.error('Usage: pb stop --loop <loop_id>');
    process.exit(1);
  }
  const stopped = stopLoopProcesses(loopId);
  console.log(`Stopped ${stopped.length} tracked process(es) for ${loopId}.`);
}

// ============================================================================
//  report — roll the agent-first journal up into a human artifact
// ============================================================================
function cmdReport(args) {
  const journal = readJournal().filter((e) => !e.__malformed);
  const filtered = args.since ? journal.filter((e) => (e.ts || '') >= args.since) : journal;
  const tasks = backlogTasks();

  const counts = Object.fromEntries(ALLOWED_STATUSES.map((s) => [s, 0]));
  for (const t of tasks) if (counts[t.status] !== undefined) counts[t.status]++;

  const byTask = new Map();
  for (const e of filtered) {
    if (!byTask.has(e.task)) byTask.set(e.task, []);
    byTask.get(e.task).push(e);
  }
  const titleOf = (id) => tasks.find((t) => t.id === id)?.title || '';
  const taskById = new Map(tasks.map((t) => [t.id, t]));

  const lines = [];
  lines.push(`# ${master?.name || 'Playbook'} Report — ${today()}`);
  lines.push('');
  lines.push(`_Generated ${nowISO()} from \`${JOURNAL}\`${args.since ? ` (since ${args.since})` : ''}._`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Status | Count |');
  lines.push('| --- | --- |');
  for (const s of ALLOWED_STATUSES) lines.push(`| ${s} | ${counts[s]} |`);
  lines.push(`| journal entries | ${filtered.length} |`);
  lines.push(`| loops | ${readLoops().loops.length} |`);
  lines.push(`| open lessons | ${openLessons().length} |`);
  lines.push('');

  lines.push('## Activity by task');
  lines.push('');
  if (byTask.size === 0) {
    lines.push('_No journal activity in range._');
  } else {
    for (const [taskId, entries] of byTask) {
      lines.push(`### [${taskId}] ${titleOf(taskId)}`.trimEnd());
      lines.push('');
      for (const e of entries) {
        const files = e.files?.length ? ` _(files: ${e.files.join(', ')})_` : '';
        const notes = e.notes ? ` — ${e.notes}` : '';
        const checks = reportCheckMarker(e, taskById.get(e.task));
        const loop = e.loop_id ? ` _(${e.loop_id})_` : '';
        lines.push(`- \`${e.ts?.slice(0, 19)}\`${loop} **${e.action}** → ${e.status}${checks}${notes}${files}`);
      }
      lines.push('');
    }
  }

  lines.push('## Open backlog');
  lines.push('');
  const open = tasks.filter((t) => t.status !== 'done').sort((a, b) => prio(a) - prio(b));
  if (open.length === 0) {
    lines.push('_Backlog clear._');
  } else {
    lines.push('| Priority | ID | Status | Task | Skill | Gate |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const t of open) lines.push(`| ${prio(t)} | ${t.id} | ${t.status} | ${t.title} | ${t.skill || '-'} | ${gateQuality(t)} |`);
  }
  lines.push('');

  ensureDir(REPORTS_DIR);
  const outRel = join(REPORTS_DIR, `report-${today()}.md`);
  writeFileSync(p(outRel), lines.join('\n'), 'utf8');
  console.log(`Report written: ${outRel}`);
}

// ============================================================================
//  list — print the indices
// ============================================================================
function cmdList(args) {
  const which = args._[0];
  if (!which || which === 'processes') {
    const idx = readData(PROCESS_INDEX);
    console.log('\nProcesses:');
    for (const x of idx?.processes || []) console.log(`  ${String(x.id).padEnd(18)} ${x.file}${x.owner ? `  (${x.owner})` : ''}`);
  }
  if (!which || which === 'skills') {
    const idx = readData(SKILL_INDEX);
    console.log('\nSkills:');
    for (const x of idx?.skills || []) console.log(`  ${String(x.id).padEnd(18)} ${x.file}${x.process ? `  → ${x.process}` : ''}`);
  }
  console.log('');
}

// ============================================================================
//  init — ensure the runtime layout exists (safe: never overwrites content)
// ============================================================================
function cmdInit() {
  for (const dir of [MEMORY_DIR, REPORTS_DIR]) ensureDir(dir);
  const created = [];
  if (!existsSync(p(JOURNAL))) { writeFileSync(p(JOURNAL), '', 'utf8'); created.push(JOURNAL); }
  const gitkeep = join(REPORTS_DIR, '.gitkeep');
  if (!existsSync(p(gitkeep))) { writeFileSync(p(gitkeep), '', 'utf8'); created.push(gitkeep); }
  if (!existsSync(p(BACKLOG))) {
    writeBacklog({
      tasks: [{
        id: 'T1', title: 'First task', status: 'todo', skill: 'run-task', priority: 1,
        acceptance_checks: ['node scripts/pb.mjs validate'],
        notes: 'Replace me.', created: today(),
      }],
    });
    created.push(BACKLOG);
  }
  console.log(created.length ? `Initialized: ${created.join(', ')}` : 'Already initialized — runtime files present.');
  console.log('Note: init only creates missing runtime files; it never overwrites your content.');
  console.log('If this is an empty playbook with no processes/skills yet, run `node scripts/pb.mjs bootstrap`.');
}

// ============================================================================
//  bootstrap — seed the minimal operating playbook (safe: never overwrites)
// ----------------------------------------------------------------------------
//  `init` hydrates runtime state. `bootstrap` covers the earlier lifecycle stage:
//  an empty playbook folder that has structure but no runnable process/skill.
// ============================================================================
function cmdBootstrap() {
  const created = [];

  writeIfMissing('playbook.yaml', `name: agent-playbook
version: 0.3.0
description: Repo-local agent playbook.
entry: SKILL.md

north_star: >-
  (one invariant sentence — what this project drives toward; fill this before claiming work)

paths:
  root: .
  scripts: scripts
  processes: processes
  skills: skills
  memory: memory
  artifacts: artifacts
  reports: artifacts/reports

index:
  cli: scripts/pb.mjs
  processes_index: processes/index.yaml
  skills_index: skills/index.yaml
  memory:
    project_memory: memory/project-memory.md
    backlog: memory/backlog.yaml
    journal: memory/journal.ndjson
    cycle: memory/cycle.md
    loops: memory/loops.yaml
    lessons: memory/lessons.ndjson
    processes: memory/processes.ndjson
  artifacts:
    reports: artifacts/reports

loop:
  description: Orient -> Select -> Act -> Verify -> Record -> Report -> repeat.

fixation:
  - Re-anchor to playbook.yaml at the start of every loop iteration. The master wins.
  - Act only inside this folder. The playbook is self-contained (carry-on).
  - Skills-first. Find the matching skill before improvising. If none fits, write one.
  - Done means the task's acceptance_checks (shell commands) exit 0. Record only on pass.
  - Record every iteration to memory/journal.ndjson via pb record. No silent work.
  - A task's acceptance_checks must test the task's own artifacts — pb validate alone is not a task check.
  - Memory precedence: folder (north_star + memory/) outranks agent/host memory on project matters.

guardrails:
  validate_command: node scripts/pb.mjs validate
  allowed_statuses: [todo, in_progress, blocked, done]

hardening:
  principle: Externalize state to disk + re-anchor cheaply + auto-re-inject the anchor.
  commands:
    anchor: node scripts/pb.mjs anchor
    checkpoint: node scripts/pb.mjs checkpoint
  re_anchor: Call anchor at the start of every iteration and after every few actions.
`, created);

  writeIfMissing('SKILL.md', `# Playbook Skill

## Startup (every session)
1. Read \`playbook.yaml\` — the master (north_star, fixation, loop contract).
2. Read \`memory/project-memory.md\` — durable operating rules.
3. Run \`node scripts/pb.mjs status\` — orient on backlog + journal + guardrails.

## The loop
orient → select → act → verify → record → report

- Select: \`node scripts/pb.mjs next --claim\` — prints the task and its acceptance_checks.
- "Done" is enforced: \`pb record --status done\` runs the task's acceptance_checks (shell commands)
  and refuses if they fail. Exit codes, not prose.
- Roll up: \`node scripts/pb.mjs report\`.

## Phase loop (open each phase, close it)
- Open: \`node scripts/pb.mjs cycle --new\` — confirm the cycle brief (goal / challenges / stop).
- Close: \`node scripts/pb.mjs reflect\` — compare done tasks to the north_star; record notes.
- \`pb checkpoint\` warns when work is claimed without a brief, or done tasks await reflection.

## Loop epochs and learning
- Open scoped work with \`node scripts/pb.mjs loop new --goal "..." --stop "..."\`.
- Close clean work with \`pb loop close --status done\`.
- Close contaminated work with \`pb loop close --status failed --reason "..."\`, then record
  reflection with \`pb learn --loop <id> --source user --notes "..."\` before the next loop.

## Memory precedence
Your host memory is the PAST; this folder is the project PRESENT/FUTURE. On any project conflict,
the folder wins — surface the conflict, do not silently follow host memory.
`, created);

  writeIfMissing(PROJECT_MEMORY, `# Project Memory

Durable repo-local facts for agents.

## Operating rules

1. Re-anchor to playbook.yaml at the start of every loop.
2. Keep work inside this playbook folder unless the task explicitly targets the parent repo.
3. Give every task executable acceptance_checks where possible — exit codes, not prose.
4. Record every completed or blocked iteration with pb record.
`, created);

  writeIfMissing(PROCESS_INDEX, `name: canonical-processes
version: 1.0.0
processes:
  - id: run-task
    file: processes/run-task.yaml
    owner: core
    summary: Generic task execution from claim to record/report.
`, created);

  writeIfMissing(SKILL_INDEX, `name: repo-skills
version: 1.0.0
skills:
  - id: run-task
    file: skills/run-task/SKILL.md
    process: run-task
    summary: Generic task execution.
`, created);

  writeIfMissing('processes/run-task.yaml', `name: run-task
version: 1.0.0
purpose: Take one backlog task from claim to verified, recorded outcome.
canonical_steps:
  - step: 1
    name: Orient
    requirements:
      - Read playbook.yaml and SKILL.md.
      - Run node scripts/pb.mjs status.
  - step: 2
    name: Act
    requirements:
      - Make the smallest change that satisfies the task.
      - Stay inside the intended repo/playbook scope.
  - step: 3
    name: Verify
    requirements:
      - Run node scripts/pb.mjs validate (structure) and node scripts/pb.mjs validate --task <id> (the task's checks).
  - step: 4
    name: Record and report
    requirements:
      - Run node scripts/pb.mjs record (recording done re-runs the checks and refuses on failure).
      - Run node scripts/pb.mjs report when useful for human handoff.
`, created);

  writeIfMissing('skills/run-task/SKILL.md', `# Run Task

Use this skill for any backlog item that does not have a more specific skill.

Canonical process: \`processes/run-task.yaml\`.

Steps:
1. Read the task from \`node scripts/pb.mjs next --claim\` — it prints the task's acceptance_checks.
2. Do the smallest safe change that satisfies them.
3. Verify: \`node scripts/pb.mjs validate\` and \`node scripts/pb.mjs validate --task <id>\`.
4. Record: \`node scripts/pb.mjs record --task <id> --action execute --status done --notes "..."\`.
   Recording done re-runs the checks; it refuses if they fail.
5. Run \`node scripts/pb.mjs report\` when a human-facing rollup is useful.
`, created);

  cmdInit();
  console.log(created.length ? `Bootstrapped: ${created.join(', ')}` : 'Already bootstrapped — minimal process/skill files present.');
  console.log('Note: bootstrap creates missing minimal files only; it never overwrites your content.');
}

// ============================================================================
//  anchor — the tiny constitution, cheap to re-inject so the playbook never
//  decays out of attention. `--brief` is a few lines safe to inject every turn.
//  Designed to be called from runtime hooks; never throws.
// ============================================================================
function cmdAnchor(args) {
  const name = master.name || 'playbook';
  const loopDesc = master.loop?.description || 'orient → select → act → verify → record → report';
  const cur = readCycle();
  const purpose = NORTH_STAR ? `North Star (invariant): ${NORTH_STAR}` : 'North Star: (unset — add `north_star:` to the master)';
  const cycleLine = cur.exists
    ? `This cycle (phase ${cur.phase ?? '?'}): ${cur.goal || '(goal unset)'}  ·  Stop: ${cur.stop || '(unset)'}`
    : 'This cycle: (no brief — run `pb cycle --new`)';
  const loop = activeLoop();
  const loopLine = loop
    ? `Loop: ${loop.id} active · artifacts: ${loop.artifacts || loopArtifactsRel(loop.id)}`
    : 'Loop: (none active — run `pb loop new` for scoped work)';
  const highLessons = openLessons().filter((l) => l.severity === 'high').length;
  const lessonLine = `Lessons: ${highLessons} open high-severity · run \`pb learn status\``;
  const memRule = 'Memory precedence: your own/host memory is the PAST; this folder is the project PRESENT/FUTURE. On any project conflict the folder wins — surface it, do not silently follow host memory.';

  if (args.brief) {
    console.log(`[${name} anchor] master=${MASTER} · loop: ${loopDesc}`);
    console.log(purpose);
    console.log(cycleLine);
    console.log(loopLine);
    console.log(lessonLine);
    console.log(`Re-anchor to ${MASTER} each iteration. State is on disk (${BACKLOG}, ${JOURNAL}) — rehydrate with \`node scripts/pb.mjs status\`. ${memRule}`);
    return;
  }
  console.log(`\n=== PLAYBOOK ANCHOR — ${name} ===`);
  console.log(`Master (the fixation): ${MASTER}   |   Entry: ${ENTRY}`);
  console.log(purpose);
  console.log(cycleLine);
  console.log(loopLine);
  console.log(lessonLine);
  console.log(`Loop: ${loopDesc}`);
  const fix = master.fixation || [];
  if (fix.length) {
    console.log('Invariants (never violate):');
    for (const r of fix) console.log(`  - ${r}`);
  }
  console.log(memRule);
  const _wip = backlogTasks().find((t) => t.status === 'in_progress');
  if (_wip) {
    console.log(`Claimed task: [${_wip.id}] ${_wip.title || ''}`);
    const _ch = taskChecks(_wip);
    if (_ch.length) {
      console.log('  done means (its acceptance_checks):');
      for (const c of _ch) console.log(`    $ ${c}`);
    }
  }
  console.log(`State lives on disk, not in context. Rehydrate anytime: \`node scripts/pb.mjs status\`.`);
  console.log(`  backlog: ${BACKLOG}   journal: ${JOURNAL}   reports: ${REPORTS_DIR}   cycle: ${CYCLE}`);
  console.log(`If you feel lost or just resumed: \`node scripts/pb.mjs checkpoint\`.`);
  console.log(`=== END ANCHOR ===\n`);
}

// ============================================================================
//  checkpoint — the hardening heartbeat: re-anchor + detect drift from disk.
//  Call it on resume, after compaction, or whenever unsure. `--snapshot`
//  writes memory/RESUME.md as a single "where you are" breadcrumb.
// ============================================================================
function cmdCheckpoint(args) {
  cmdAnchor({ brief: true });

  const tasks = backlogTasks();
  const journal = readJournal().filter((e) => !e.__malformed);
  const lastTs = journal.length ? journal[journal.length - 1].ts : null;
  const wip = tasks.filter((t) => t.status === 'in_progress');
  const nextTodo = tasks.filter((t) => t.status === 'todo').sort((a, b) => prio(a) - prio(b))[0];
  const loopState = readLoops();
  const loop = activeLoop();
  const openHighLessons = openLessons().filter((l) => l.severity === 'high');

  const warnings = [];
  const failures = runValidate();
  if (failures.length) warnings.push(`Guardrails FAIL (${failures.length}) — run \`pb validate\`.`);
  if (!loop && (wip.length > 0 || nextTodo)) warnings.push('No active loop — run `pb loop new` before claiming or recording scoped work.');
  if (loopState.active && !loop) warnings.push(`Loop registry has non-active loop set as active: ${loopState.active}.`);
  const failed = failedLoopNeedsLearning(loopState);
  if (failed) warnings.push(`Failed loop ${failed.id} has no learning reflection — run \`pb learn --loop ${failed.id} --source user --notes "..."\`.`);
  const firstLoopStarted = loopState.loops.map((l) => l.started_at).filter(Boolean).sort()[0] || null;
  const unscoped = journal.filter((e) => !e.loop_id && (!firstLoopStarted || (e.ts || '') >= firstLoopStarted)).length;
  if (unscoped) warnings.push(`${unscoped} post-loop journal entr${unscoped === 1 ? 'y has' : 'ies have'} no loop_id.`);
  const nonActiveLive = latestProcessRecords().filter((proc) => proc.loop_id !== loop?.id && proc.status !== 'stopped' && pidAlive(proc.pid));
  if (nonActiveLive.length) warnings.push(`${nonActiveLive.length} live tracked process(es) belong to a non-active loop.`);
  if (wip.length > 1) warnings.push(`${wip.length} tasks in_progress — keep ONE at a time; finish or release the rest.`);
  for (const t of wip) {
    const recorded = journal.some((e) => e.task === t.id && (!t.claimed_at || (e.ts || '') >= t.claimed_at));
    if (!recorded) warnings.push(`[${t.id}] claimed but no progress recorded — \`pb record --task ${t.id} ...\` or release it.`);
  }
  // phase-loop drift: forward brief (cycle) + backward reflect
  const cyc = readCycle();
  const reflectTs = lastReflectTs(journal);
  const hasClaimableWork = wip.length > 0 || Boolean(nextTodo);
  if (hasClaimableWork && cyc.exists && readText(CYCLE).includes('(Your host memory is the PAST')) warnings.push('Cycle brief Q5 (memory-conflict check) is unanswered — fill it before claiming work.');
  if (hasClaimableWork && !cyc.exists) warnings.push('No cycle brief — open the phase with `pb cycle --new` before claiming work.');
  else if (hasClaimableWork && reflectTs && cyc.started && reflectTs > cyc.started) warnings.push('Cycle brief is stale — the last `pb reflect` closed the phase; open a new one with `pb cycle --new --force`.');
  const doneSinceReflect = journal.filter((e) => e.status === 'done' && e.action !== 'reflect' && (!reflectTs || (e.ts || '') > reflectTs)).length;
  if (doneSinceReflect > 0) warnings.push(`${doneSinceReflect} task(s) recorded done since the last reflect — run \`pb reflect\`.`);
  if (openHighLessons.length) {
    const cycleText = readText(CYCLE);
    const missing = openHighLessons.filter((l) => !cycleText.includes(l.id));
    if (missing.length) warnings.push(`${missing.length} open high-severity lesson(s) are not referenced by the active cycle brief.`);
  }

  console.log(`State: ${tasks.filter((t) => t.status === 'todo').length} todo · ${wip.length} in_progress · ${tasks.filter((t) => t.status === 'done').length} done · loop: ${loop ? loop.id : 'none'} · lessons: ${openHighLessons.length} high · last journal: ${lastTs ? lastTs.slice(0, 19) : 'none'}`);
  if (warnings.length) {
    console.log('DRIFT detected:');
    for (const w of warnings) console.log(`  ! ${w}`);
  } else {
    console.log('On-loop: no drift detected.');
  }
  if (wip[0]) console.log(`Next: finish [${wip[0].id}] "${wip[0].title}", then record. (skill: ${wip[0].skill || '-'})`);
  else if (nextTodo) console.log(`Next: \`pb next --claim\` → [${nextTodo.id}] (skill: ${nextTodo.skill || '-'}).`);
  else console.log('Next: backlog clear.');

  if (args.snapshot) {
    const resume = [
      '# RESUME — auto-snapshot',
      '',
      'If your context was compacted or you just resumed, start here, then delete stale notes.',
      '',
      `- Re-anchor: read \`${MASTER}\` + \`${ENTRY}\`. Rehydrate: \`node scripts/pb.mjs status\`.`,
      `- In progress: ${wip.length ? wip.map((t) => `[${t.id}] ${t.title}`).join('; ') : 'none'}`,
      `- Active loop: ${loop ? loop.id : 'none'}`,
      `- Open high-severity lessons: ${openHighLessons.length}`,
      `- Last journal entry: ${lastTs ? lastTs.slice(0, 19) : 'none'}`,
      wip[0]
        ? `- Next: finish [${wip[0].id}], then \`pb record --task ${wip[0].id} ...\`.`
        : (nextTodo ? `- Next: \`pb next --claim\` → [${nextTodo.id}].` : '- Next: backlog clear.'),
      '',
    ];
    ensureDir(MEMORY_DIR);
    writeFileSync(p(join(MEMORY_DIR, 'RESUME.md')), resume.join('\n'), 'utf8');
    console.log(`Snapshot written: ${join(MEMORY_DIR, 'RESUME.md')}`);
  }
}

// ============================================================================
//  cycle — the FORWARD half of the phase loop. A "cycle brief" is the four
//  questions confirmed at the start of each phase. The North Star is invariant;
//  the cycle goal changes per phase. Brief opens the phase; `reflect` closes it.
// ============================================================================
function readCycle() {
  const text = readText(CYCLE);
  if (!text) return { exists: false };
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  let meta = {};
  if (m) { try { meta = yaml.load(m[1]) || {}; } catch { meta = {}; } }
  if (meta && meta.started instanceof Date) meta.started = meta.started.toISOString();
  return { exists: true, ...meta };
}
function cycleTemplate({ phase, goal, stop, challenges, priorChallenges, conflicts }) {
  return `---
phase: ${phase}
started: "${nowISO()}"
goal: ${goal ? JSON.stringify(goal) : '""'}
stop: ${stop ? JSON.stringify(stop) : '""'}
---
# Cycle Brief — phase ${phase}

> Confirm this at the START of each phase, before claiming work. The North Star does
> not change; this cycle's goal does. Fill all five, then \`node scripts/pb.mjs status\`.

## 1. What is this cycle's goal?
${goal || '(one sentence — the phase goal, distinct from the North Star)'}

## 2. What challenges do I foresee?
${challenges || '(pre-mortem: what is most likely to go wrong this phase)'}

## 3. What were the previous challenges?
${priorChallenges || '(carry-over — seed from the last `pb reflect`)'}

## 4. Where do I stop / hand back?
${stop || '(the explicit stop condition — what "this phase is done" means, and the hand-back point)'}

## 5. Conflicts with my own (agent) memory?
${conflicts || `(Your host memory is the PAST; this folder is the project's PRESENT/FUTURE. If anything you
"remember" about this project contradicts the North Star or this goal, NAME it here and treat
the folder as truth — do not silently follow memory.)`}
`;
}
function cmdCycle(args) {
  const cur = readCycle();
  if (args.new) {
    if (cur.exists && !args.force) {
      console.log(`A cycle brief already exists (phase ${cur.phase ?? '?'}, started ${String(cur.started).slice(0, 19)}).`);
      console.log('Open the next phase with `pb cycle --new --force` (optionally --goal "..." --stop "...").');
      return;
    }
    const phase = (Number.isInteger(cur.phase) ? cur.phase : 0) + 1;
    ensureDir(dirname(CYCLE));
    writeFileSync(p(CYCLE), cycleTemplate({ phase, goal: args.goal, stop: args.stop }), 'utf8');
    console.log(`Opened cycle brief: ${CYCLE} (phase ${phase}). Fill the five questions, then \`pb status\`.`);
    return;
  }
  if (!cur.exists) {
    console.log('No cycle brief yet. Open one with `pb cycle --new` (the forward half of the phase loop).');
    return;
  }
  console.log(`\n  Cycle brief — phase ${cur.phase ?? '?'}  (started ${String(cur.started).slice(0, 19)})`);
  if (NORTH_STAR) console.log(`  North Star: ${NORTH_STAR}`);
  console.log(`  Goal: ${cur.goal || '(unset)'}`);
  console.log(`  Stop: ${cur.stop || '(unset)'}`);
  console.log(`  Full brief: ${CYCLE}\n`);
}

function lastReflectTs(journal, loopId = null) {
  const r = journal.filter((e) => e.action === 'reflect' && (!loopId || e.loop_id === loopId));
  return r.length ? r[r.length - 1].ts : null;
}
function cmdReflect(args) {
  const journal = readJournal().filter((e) => !e.__malformed);
  const since = lastReflectTs(journal);
  const doneSince = journal.filter((e) => e.status === 'done' && e.action !== 'reflect' && (!since || (e.ts || '') > since));
  const cur = readCycle();

  console.log('\n=== REFLECT ===');
  if (NORTH_STAR) console.log(`North Star: ${NORTH_STAR}`);
  if (cur.exists) console.log(`This cycle (phase ${cur.phase ?? '?'}): ${cur.goal || '(unset)'}`);
  console.log(since ? `Done since last reflect (${since.slice(0, 19)}):` : 'Done so far:');
  if (doneSince.length) {
    for (const e of doneSince) console.log(`  - [${e.task || '-'}] ${e.notes || e.action}`);
  } else {
    console.log('  (nothing)');
  }
  console.log('\nAsk: did these advance the North Star + cycle goal? What changes? What carries into the next phase?');

  if (args.notes) {
    const loop = args.loop ? loopById(args.loop) : activeLoop();
    const entry = {
      ts: nowISO(), loop_id: loop?.id || args.loop || 'legacy', task: 'reflect', agent: args.agent || 'agent', action: 'reflect',
      status: 'done', checks: 'none', result: null, files: [], notes: args.notes,
    };
    ensureDir(MEMORY_DIR);
    appendFileSync(p(JOURNAL), JSON.stringify(entry) + '\n', 'utf8');
    console.log(`\nRecorded reflection. If it changes direction, update north_star in ${MASTER} and open a new brief: \`pb cycle --new --force\`.`);
  } else {
    console.log('\nRecord it with: pb reflect --notes "what you learned / what changes / what carries forward".');
  }
  console.log('=== END REFLECT ===\n');
}

// ============================================================================
//  scaffold — copy this engine into a target repo (copy-don't-clobber)
// ----------------------------------------------------------------------------
//  The mechanical backbone of `install`. Run the SOURCE playbook's pb.mjs and
//  point --target at the repo to set up. Existing files are never overwritten
//  (except scripts/pb.mjs, which is the engine and should refresh). Whatever it
//  skips is reported so the caller knows what to bridge by hand/agent.
// ============================================================================
function cmdScaffold(args) {
  const target = args.target || args._[0] || '.';
  const targetAbs = resolve(process.cwd(), target);
  if (targetAbs === ROOT) {
    console.error('Refusing to scaffold onto the source playbook itself. Pass --target <dir>.');
    process.exit(1);
  }
  const tp = (...parts) => resolve(targetAbs, ...parts);
  const tHas = (rel) => existsSync(tp(rel));
  const ensureT = (rel) => { if (!existsSync(tp(rel))) mkdirSync(tp(rel), { recursive: true }); };
  const created = [], skipped = [];

  ['scripts', 'memory', 'artifacts/reports'].forEach(ensureT);

  // engine CLI — always refresh (it IS the engine)
  copyFileSync(p('scripts/pb.mjs'), tp('scripts/pb.mjs'));
  created.push('scripts/pb.mjs');

  // single-file templates — only if absent in the target
  for (const f of ['playbook.yaml', 'SKILL.md', 'AGENTS.md', 'README.md', 'memory/project-memory.md']) {
    if (!existsSync(p(f))) continue;
    if (tHas(f)) { skipped.push(f); continue; }
    ensureT(dirname(f));
    copyFileSync(p(f), tp(f));
    created.push(f);
  }

  // processes / skills — copy the whole tree only when the target has no index
  // (greenfield). If an index already exists, leave it and flag it for bridging.
  for (const area of ['processes', 'skills']) {
    const hasIndex = tHas(`${area}/index.yaml`) || tHas(`${area}/index.json`);
    if (!hasIndex && existsSync(p(area))) { cpSync(p(area), tp(area), { recursive: true }); created.push(`${area}/`); }
    else if (hasIndex) skipped.push(`${area}/ (index present — bridge, don't replace)`);
  }

  // runtime files
  if (!tHas('memory/journal.ndjson')) { writeFileSync(tp('memory/journal.ndjson'), '', 'utf8'); created.push('memory/journal.ndjson'); }
  if (existsSync(p('memory/backlog.yaml')) && !tHas('memory/backlog.yaml')) { copyFileSync(p('memory/backlog.yaml'), tp('memory/backlog.yaml')); created.push('memory/backlog.yaml'); }
  if (!tHas('artifacts/reports/.gitkeep')) { writeFileSync(tp('artifacts/reports/.gitkeep'), '', 'utf8'); created.push('artifacts/reports/.gitkeep'); }

  console.log(`\nScaffolded Agent-Playbook into: ${targetAbs}`);
  if (created.length) console.log('  created:  ' + created.join(', '));
  if (skipped.length) console.log('  skipped:  ' + skipped.join(', '));
  console.log('\nNext (the judgment steps — see the install skill):');
  console.log('  1. If processes/skills/memory already existed, bridge them: edit the target');
  console.log('     playbook.yaml `index`/`paths` to point at the existing files (don\'t use the templates).');
  console.log('  2. Add js-yaml + pb scripts to package.json, then `npm install`.');
  console.log(`  3. cd "${target}" && node scripts/pb.mjs init && node scripts/pb.mjs validate\n`);
}

// ============================================================================
//  help + dispatch
// ============================================================================
function cmdHelp() {
  console.log(`
  pb — Agent-Playbook loop CLI   (master: ${MASTER})

  Loop:   orient → select → act → verify → record → report → repeat

  Commands:
    status                 Orient: master summary, backlog, recent journal, guardrail state
    next [--claim]         Select the next task; --claim marks it in_progress
    record --task <id> --action <a> --status <s> [--result <r>] [--files a,b] [--notes "..."] [--agent <n>] [--skip-checks]
                           Append a journal entry. Recording done RUNS the task's
                           acceptance_checks and refuses if they fail.
    report [--since DATE]  Roll the journal up into ${REPORTS_DIR}/report-<date>.md
    loop new [--goal ".."] [--stop ".."] [--from-lessons]  Open a durable loop epoch
    loop status           Show active loop, close gate, and learning blockers
    loop close --status <done|failed|abandoned> [--reason ".."] [--allow-unreflected]
                          Close the active loop; failed loops require a learning reflection
                          before the next loop unless --skip-learning is stamped on loop new
    loop quarantine <id>  Mark a failed/closed loop as quarantined
    learn [--loop <id>] --source user --notes ".." [--severity high] [--promotion memory|backlog|skill|journal] [--target <file-or-task>]
                          Record a structured lesson for a smarter next loop
    learn status          Show open lessons
    run -- <command>      Start a long-running command under the active loop and log it
    ps [--loop <id>]      List tracked processes
    stop [--loop <id>]    Stop tracked processes for a loop
    cycle [--new [--force] --goal ".." --stop ".."]  Forward half of the phase loop: the cycle brief (4+1 Qs). No args prints it.
    reflect [--notes ".."] Backward half: review done-since-last-reflect vs North Star; --notes records it
    validate               Structural guardrails (exit 1 on failure)
    validate --task <id>   Run that task's executable acceptance_checks
    anchor [--brief]       Print the constitution to re-inject (keeps the playbook salient)
    checkpoint [--snapshot]  Heartbeat: re-anchor + detect drift; --snapshot writes memory/RESUME.md
    list [processes|skills]  Print the indices
    scaffold --target <dir>  Copy this engine into another repo (copy-don't-clobber)
    init                   Create any missing runtime files (safe; never overwrites)
    bootstrap              Seed missing minimal process/skill files, then init (safe; never overwrites)
    help                   This text

  Statuses: ${ALLOWED_STATUSES.join(', ')}
  acceptance_checks are SHELL COMMANDS on the task (cwd: playbook root). Exit 0 = pass.
  Read ${MASTER} and ${ENTRY} first — they are the source of truth.
`);
}

const [, , cmd, ...rest] = process.argv;
const args = parseArgs(rest);
switch (cmd) {
  case 'status': cmdStatus(); break;
  case 'next': cmdNext(args); break;
  case 'record': cmdRecord(args); break;
  case 'report': cmdReport(args); break;
  case 'loop': cmdLoop(args); break;
  case 'learn': cmdLearn(args); break;
  case 'run': cmdRun(args); break;
  case 'ps': cmdPs(args); break;
  case 'stop': cmdStop(args); break;
  case 'validate': cmdValidate(args); break;
  case 'anchor': cmdAnchor(args); break;
  case 'checkpoint': cmdCheckpoint(args); break;
  case 'cycle': cmdCycle(args); break;
  case 'reflect': cmdReflect(args); break;
  case 'list': cmdList(args); break;
  case 'scaffold': cmdScaffold(args); break;
  case 'init': cmdInit(); break;
  case 'bootstrap': cmdBootstrap(); break;
  case 'help': case undefined: cmdHelp(); break;
  default:
    console.error(`Unknown command: ${cmd}\n`);
    cmdHelp();
    process.exit(1);
}
