#!/usr/bin/env node
// ============================================================================
//  pb — the Agent-Playbook loop CLI
// ----------------------------------------------------------------------------
//  One command per loop step, so agents move without friction:
//    status | next | record | report | validate | anchor | checkpoint |
//    list | scaffold | init | bootstrap | help
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

import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync, copyFileSync, cpSync } from 'node:fs';
import { execSync } from 'node:child_process';
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

// minimal arg parser: positionals in `_`, --key value / --flag true
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
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
    candidate.status = 'in_progress';
    candidate.claimed_at = nowISO();
    writeBacklog(bl);
    console.log(`\n  Claimed [${candidate.id}] → in_progress.`);
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
    console.error('Usage: pb record --task <id> --action <action> --status <status> [--result <r>] [--files a,b] [--notes "..."] [--agent <name>] [--skip-checks]');
    console.error(`status must be one of: ${ALLOWED_STATUSES.join(', ')}`);
    process.exit(1);
  }
  if (!ALLOWED_STATUSES.includes(args.status)) {
    console.error(`Invalid status "${args.status}". Allowed: ${ALLOWED_STATUSES.join(', ')}`);
    process.exit(1);
  }

  const task = backlogTasks().find((t) => t.id === args.task);
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
      writeBacklog(bl);
      console.log(`Backlog [${t.id}] → ${args.status}.`);
    }
  }
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
        const checks = e.checks === 'passed' ? ' ✓checks' : e.checks === 'skipped' ? ' ⚠checks-skipped' : '';
        lines.push(`- \`${e.ts?.slice(0, 19)}\` **${e.action}** → ${e.status}${checks}${notes}${files}`);
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
    lines.push('| Priority | ID | Status | Task | Skill | Checks |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const t of open) lines.push(`| ${prio(t)} | ${t.id} | ${t.status} | ${t.title} | ${t.skill || '-'} | ${taskChecks(t).length || '-'} |`);
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
version: 0.2.0
description: Repo-local agent playbook.
entry: SKILL.md
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
  artifacts:
    reports: artifacts/reports
loop:
  description: Orient -> Select -> Act -> Verify -> Record -> Report -> repeat.
guardrails:
  validate_command: node scripts/pb.mjs validate
  allowed_statuses: [todo, in_progress, blocked, done]
`, created);

  writeIfMissing('SKILL.md', `# Playbook Skill

Read \`playbook.yaml\`, then run \`node scripts/pb.mjs status\`.

Loop: orient -> select -> act -> verify -> record -> report.

Use \`node scripts/pb.mjs next --claim\` to claim work. Follow the named skill in
\`skills/<id>/SKILL.md\`. "Done" is enforced: \`node scripts/pb.mjs record --status done\`
runs the task's acceptance_checks (shell commands) and refuses if they fail.
Roll up with \`node scripts/pb.mjs report\`.
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
  if (args.brief) {
    console.log(`[${name} anchor] master=${MASTER} · loop: ${loopDesc}`);
    console.log(`Re-anchor to ${MASTER} each iteration. State is on disk (${BACKLOG}, ${JOURNAL}) — rehydrate with \`node scripts/pb.mjs status\`. Record every step with \`pb record\`; never hand-edit the journal.`);
    return;
  }
  console.log(`\n=== PLAYBOOK ANCHOR — ${name} ===`);
  console.log(`Master (the fixation): ${MASTER}   |   Entry: ${ENTRY}`);
  console.log(`Loop: ${loopDesc}`);
  const fix = master.fixation || [];
  if (fix.length) {
    console.log('Invariants (never violate):');
    for (const r of fix) console.log(`  - ${r}`);
  }
  console.log(`State lives on disk, not in context. Rehydrate anytime: \`node scripts/pb.mjs status\`.`);
  console.log(`  backlog: ${BACKLOG}   journal: ${JOURNAL}   reports: ${REPORTS_DIR}`);
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

  const warnings = [];
  const failures = runValidate();
  if (failures.length) warnings.push(`Guardrails FAIL (${failures.length}) — run \`pb validate\`.`);
  if (wip.length > 1) warnings.push(`${wip.length} tasks in_progress — keep ONE at a time; finish or release the rest.`);
  for (const t of wip) {
    const recorded = journal.some((e) => e.task === t.id && (!t.claimed_at || (e.ts || '') >= t.claimed_at));
    if (!recorded) warnings.push(`[${t.id}] claimed but no progress recorded — \`pb record --task ${t.id} ...\` or release it.`);
  }

  console.log(`State: ${tasks.filter((t) => t.status === 'todo').length} todo · ${wip.length} in_progress · ${tasks.filter((t) => t.status === 'done').length} done · last journal: ${lastTs ? lastTs.slice(0, 19) : 'none'}`);
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
  case 'validate': cmdValidate(args); break;
  case 'anchor': cmdAnchor(args); break;
  case 'checkpoint': cmdCheckpoint(args); break;
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
