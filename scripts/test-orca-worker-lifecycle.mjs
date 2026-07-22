import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, symlinkSync } from 'node:fs';
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
  'default_mode: coding', 'modes:', '  coding: modes/coding.yaml', 'guardrails:', '  allowed_statuses: [todo, in_progress, blocked, done]', ''
].join('\n'));
writeFileSync(join(root, 'modes/coding.yaml'), 'id: coding\ndirective: ""\n');
execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });
execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root });
execFileSync('git', ['add', '.'], { cwd: root });
execFileSync('git', ['commit', '-m', 'seed'], { cwd: root, stdio: 'ignore' });

const pb = (args) => execFileSync(process.execPath, [join(root, 'scripts/pb.mjs'), ...args], { cwd: root, encoding: 'utf8' });
const created = JSON.parse(pb(['worker', 'create', 'task-worker', '--agent', 'codex', '--json']));
if (created.execute !== false) throw new Error('worker create must dry-run by default');
if (!created.command.includes('git worktree add')) throw new Error('worker create did not surface git worktree command');
if (created.branch !== 'agent/task-worker-codex') throw new Error('worker branch naming mismatch');
pb(['worker', 'checker', 'task-worker', '--verdict', 'pass', '--notes', 'diff plus checks reviewed']);
const state = JSON.parse(readFileSync(join(root, 'memory/backlog-state.json'), 'utf8'));
if (state['task-worker'].checker.verdict !== 'pass') throw new Error('checker verdict not persisted to backlog-state');
const ready = JSON.parse(pb(['worker', 'merge-ready', 'task-worker', '--json']));
if (ready.ready !== true) throw new Error(`expected merge-ready true after checker pass: ${JSON.stringify(ready)}`);
pb(['worker', 'provider-rate-limit', 'task-worker', '--provider', 'codex', '--retry-after', '5h']);
const limited = JSON.parse(pb(['runcard', 'show', 'task-worker', '--json']));
if (limited.provider.status !== 'rate_limited' || limited.provider.retry_after !== '5h') throw new Error('provider cooldown not represented on RunCard');
console.log('PASS — worker dry-run, checker verdict, merge-ready gate, and provider cooldown are recorded in PB state');
