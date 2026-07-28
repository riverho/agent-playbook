import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = mkdtempSync(join(tmpdir(), 'pbworker-'));
for (const d of ['scripts', 'memory', 'processes', 'skills/run-task', 'artifacts/reports', 'modes']) mkdirSync(join(root, d), { recursive: true });
copyFileSync(resolve('scripts/pb.mjs'), join(root, 'scripts/pb.mjs'));
try { symlinkSync(resolve('node_modules'), join(root, 'node_modules')); } catch {}
writeFileSync(join(root, 'SKILL.md'), '# test skill\n');
writeFileSync(join(root, 'memory/project-memory.md'), '# memory\n');
writeFileSync(join(root, 'memory/journal.ndjson'), '');
writeFileSync(join(root, 'memory/backlog-state.json'), '{}\n');
writeFileSync(join(root, 'processes/index.yaml'), 'processes:\n  - id: run-task\n    file: processes/run-task.yaml\n');
writeFileSync(join(root, 'processes/run-task.yaml'), 'id: run-task\n');
writeFileSync(join(root, 'skills/index.yaml'), 'skills:\n  - id: run-task\n    file: skills/run-task/SKILL.md\n    process: run-task\n');
writeFileSync(join(root, 'skills/run-task/SKILL.md'), '# run task\n');
writeFileSync(join(root, 'memory/backlog.yaml'), [
  'tasks:',
  '  - id: task-worker',
  '    title: Worker lifecycle task',
  '    status: todo',
  '    skill: run-task',
  '    priority: 1',
  '    acceptance_checks:',
  '      - node scripts/pb.mjs validate',
  '',
].join('\n'));
writeFileSync(join(root, 'memory/loops.yaml'), 'active: loop-worker-001\nloops:\n  - id: loop-worker-001\n    status: active\n    started_at: now\n');
writeFileSync(join(root, 'memory/cycle.md'), '# Cycle\n## 1. What is this cycle\'s goal?\nTest\n## 2. What challenges do I foresee?\nNone\n## 3. What were the previous challenges?\nNone\n## 4. Where do I stop?\nDone\n## 5. Do I have any conflicting memory?\nNone\n');
writeFileSync(join(root, 'playbook.yaml'), [
  'name: worker-test', 'version: 0.3.6', 'entry: SKILL.md',
  'paths:', '  scripts: scripts', '  processes: processes', '  skills: skills', '  memory: memory', '  artifacts: artifacts', '  reports: artifacts/reports',
  'index:', '  processes_index: processes/index.yaml', '  skills_index: skills/index.yaml', '  memory:', '    project_memory: memory/project-memory.md', '    backlog: memory/backlog.yaml', '    journal: memory/journal.ndjson', '    cycle: memory/cycle.md', '    loops: memory/loops.yaml', '    lessons: memory/lessons.ndjson', '    processes: memory/processes.ndjson',
  // `loop:` is a required master key — the merge gate runs the task's real
  // acceptance_checks (pb validate), so the fixture must actually validate.
  'loop:', '  description: test loop', '  steps:', '    - id: orient', '      do: orient', '      command: node scripts/pb.mjs status',
  'default_mode: coding', 'modes:', '  coding: modes/coding.yaml', 'guardrails:', '  allowed_statuses: [todo, in_progress, blocked, done]', ''
].join('\n'));
writeFileSync(join(root, 'modes/coding.yaml'), 'id: coding\ndirective: ""\n');
execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });
execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root });
execFileSync('git', ['add', '.'], { cwd: root });
execFileSync('git', ['commit', '-m', 'seed'], { cwd: root, stdio: 'ignore' });

const pb = (args) => execFileSync(process.execPath, [join(root, 'scripts/pb.mjs'), ...args], { cwd: root, encoding: 'utf8' });
// pbFail: expect a clean nonzero exit, and return what the user actually saw.
const pbFail = (args, label) => {
  try {
    pb(args);
  } catch (err) {
    if (err.status === null || err.status === undefined) throw new Error(`${label}: process died without an exit code`);
    const text = `${err.stdout || ''}${err.stderr || ''}`;
    if (/^\s*at .*\(node:internal/m.test(text)) throw new Error(`${label}: leaked a raw node stack trace:\n${text}`);
    return { status: err.status, text };
  }
  throw new Error(`${label}: expected a nonzero exit, got success`);
};
const readState = () => JSON.parse(readFileSync(join(root, 'memory/backlog-state.json'), 'utf8'));

// --- create: dry-run is the default -----------------------------------------
const created = JSON.parse(pb(['worker', 'create', 'task-worker', '--agent', 'codex', '--json']));
if (created.execute !== false) throw new Error('worker create must dry-run by default');
if (!created.command.includes('git worktree add')) throw new Error('worker create did not surface git worktree command');
if (created.branch !== 'agent/task-worker-codex') throw new Error('worker branch naming mismatch');
if (existsSync(created.worktree)) throw new Error('dry-run must not create the worktree');
if (readState()['task-worker']?.worker) throw new Error('dry-run must not record worker state');

// --- merge gate: a checker verdict alone is NOT enough ------------------------
pb(['worker', 'checker', 'task-worker', '--verdict', 'pass', '--notes', 'diff plus checks reviewed']);
if (readState()['task-worker'].checker.verdict !== 'pass') throw new Error('checker verdict not persisted to backlog-state');
const premature = pbFail(['worker', 'merge-ready', 'task-worker', '--json'], 'merge-ready with task still todo');
const prematurePayload = JSON.parse(premature.text);
if (prematurePayload.ready !== false) throw new Error('checker pass alone must not make a todo task merge-ready');
if (!prematurePayload.reasons.some((r) => r.includes('status must be done'))) {
  throw new Error(`expected a status reason, got: ${JSON.stringify(prematurePayload.reasons)}`);
}

// --- merge gate: skipped checks must not pass the gate ------------------------
pb(['record', '--task', 'task-worker', '--action', 'implement', '--status', 'done', '--skip-checks']);
const skipped = JSON.parse(pbFail(['worker', 'merge-ready', 'task-worker', '--json'], 'merge-ready after --skip-checks').text);
if (!skipped.reasons.some((r) => r.includes('skipped'))) {
  throw new Error(`--skip-checks must block the merge gate, got: ${JSON.stringify(skipped.reasons)}`);
}

// --- merge gate: a stale verdict must not pass the gate -----------------------
pb(['record', '--task', 'task-worker', '--action', 'implement', '--status', 'done']);
const stale = JSON.parse(pbFail(['worker', 'merge-ready', 'task-worker', '--json'], 'merge-ready with stale verdict').text);
if (!stale.reasons.some((r) => r.includes('predates'))) {
  throw new Error(`a verdict older than the done record must block, got: ${JSON.stringify(stale.reasons)}`);
}

// --- merge gate: green only after a fresh verdict over a checked `done` -------
pb(['worker', 'checker', 'task-worker', '--verdict', 'pass', '--notes', 're-reviewed after checks']);
const ready = JSON.parse(pb(['worker', 'merge-ready', 'task-worker', '--json']));
if (ready.ready !== true) throw new Error(`expected merge-ready true: ${JSON.stringify(ready.reasons)}`);
if (ready.checks_outcome !== 'passed') throw new Error(`expected checks_outcome passed, got ${ready.checks_outcome}`);

// --- create --execute: really builds the worktree, and is not re-runnable -----
const exec1 = JSON.parse(pb(['worker', 'create', 'task-worker', '--agent', 'codex', '--execute', '--json']));
if (exec1.execute !== true) throw new Error('--execute must be reflected in the payload');
if (!existsSync(exec1.worktree)) throw new Error('--execute did not create the worktree directory');
const worktrees = execFileSync('git', ['worktree', 'list'], { cwd: root, encoding: 'utf8' });
if (!worktrees.includes(exec1.branch)) throw new Error('git does not list the new worker worktree');
if (readState()['task-worker'].worker?.status !== 'created') throw new Error('worker state not recorded as created');

const dup = pbFail(['worker', 'create', 'task-worker', '--agent', 'codex', '--execute'], 're-running worker create');
if (!/already exists/i.test(dup.text)) throw new Error(`expected a clean "already exists" error, got:\n${dup.text}`);

// --- remove: dry-run by default, then real teardown --------------------------
const rmDry = JSON.parse(pb(['worker', 'remove', 'task-worker', '--json']));
if (rmDry.execute !== false) throw new Error('worker remove must dry-run by default');
if (!existsSync(exec1.worktree)) throw new Error('dry-run remove must not delete the worktree');
pb(['worker', 'remove', 'task-worker', '--delete-branch', '--force', '--execute']);
if (existsSync(exec1.worktree)) throw new Error('worker remove --execute did not delete the worktree');
if (readState()['task-worker'].worker?.status !== 'removed') throw new Error('worker state not recorded as removed');
const afterRemove = execFileSync('git', ['branch', '--list', exec1.branch], { cwd: root, encoding: 'utf8' });
if (afterRemove.trim()) throw new Error('--delete-branch did not delete the worker branch');
// Teardown makes the slot reusable rather than permanently poisoned.
pb(['worker', 'create', 'task-worker', '--agent', 'codex', '--execute']);
pb(['worker', 'remove', 'task-worker', '--delete-branch', '--force', '--execute']);

// --- provider cooldown -------------------------------------------------------
pb(['worker', 'provider-rate-limit', 'task-worker', '--provider', 'codex', '--retry-after', '5h']);
const limited = JSON.parse(pb(['runcard', 'show', 'task-worker', '--json']));
if (limited.provider.status !== 'rate_limited' || limited.provider.retry_after !== '5h') throw new Error('provider cooldown not represented on RunCard');
const warned = JSON.parse(pb(['worker', 'merge-ready', 'task-worker', '--json']));
if (!warned.warnings.some((w) => w.includes('rate_limited'))) throw new Error('active provider cooldown should surface as a merge-ready warning');
if (warned.ready !== true) throw new Error('a provider cooldown is advisory and must not block the merge gate');

console.log('PASS — worker create/remove lifecycle, merge gate (status + checks + freshness), and provider cooldown are enforced in PB state');
