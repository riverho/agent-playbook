# Loop Epoch Design

## Problem

If loop one fails, the playbook currently has no hard boundary that says:

- which journal entries belong to loop one,
- which logs and spawned processes belong to loop one,
- whether loop one reached a verified terminal state,
- when it is safe to start loop two without inheriting loop one's state.

`pb checkpoint` detects drift inside the current shared state, but it cannot separate a contaminated
failed loop from the next loop. The fix is not to delete history. The fix is to add a durable loop
epoch and make cleanup an explicit close operation.

## Principle

Never clear by erasing. Clear by closing the current epoch, quarantining its side effects, and
starting a new epoch with a new `loop_id`.

The append-only journal remains the source of truth. Every record gains a `loop_id`, so failed
history stays inspectable without being active context.

The next loop should be smarter, not just cleaner. A failed loop must produce a learning handoff:
what went wrong, what should change, and whether the change belongs in durable memory, backlog, or
a reusable skill/process.

## State Model

Add a loop registry:

```yaml
# memory/loops.yaml
active: loop-20260617-001
loops:
  - id: loop-20260617-001
    status: active # active | done | failed | quarantined | abandoned
    started_at: "2026-06-17T00:00:00.000Z"
    closed_at: null
    goal: "..."
    stop: "..."
    journal:
      first_line: 1
      last_line: null
    artifacts: artifacts/loops/loop-20260617-001
    reason: null
```

Add per-loop artifact storage:

```text
artifacts/loops/<loop_id>/
  logs/
  reports/
  snapshots/
  quarantine.md
```

Add a process registry for anything long-running an agent starts through the playbook:

```json
{"loop_id":"loop-20260617-001","pid":1234,"cmd":"npm run dev","cwd":".","started_at":"...","status":"running"}
```

Path: `memory/processes.ndjson`.

Add a lessons registry for user/agent reflections that should influence later loops:

```json
{"id":"lesson-20260617-001","loop_id":"loop-20260617-001","source":"user","severity":"high","problem":"Agent reused contaminated logs","root_cause":"No loop boundary or process registry","promotion":"skill","status":"open","applies_to":["loop-close","harden"],"created_at":"..."}
```

Path: `memory/lessons.ndjson`.

`memory/journal.ndjson` stays global and append-only, but new entries include:

```json
{"loop_id":"loop-20260617-001","task":"T1","action":"execute","status":"done"}
```

Old entries without `loop_id` are treated as `legacy`.

## Commands

### `pb loop new`

Creates a new active epoch.

Rules:

- Refuses if another loop is `active`.
- Creates `memory/loops.yaml` if missing.
- Creates `artifacts/loops/<loop_id>/`.
- Optionally opens `memory/cycle.md` with `--goal` and `--stop`.
- Prints the loop id and next command.

### `pb loop status`

Shows the active loop, scoped counts, live tracked processes, and whether the close gate can pass.

It should answer the user's exact question: "Is loop one done enough to clear for loop two?"

### `pb loop close --status done`

The verified close gate. It succeeds only when:

- `pb validate` is green.
- No backlog task is `in_progress`.
- Every task claimed in this loop has a terminal journal record for this loop.
- No tracked process for this loop is still alive.
- The current cycle has been reflected, unless `--allow-unreflected` is supplied and stamped.
- The loop stop condition is present in `memory/cycle.md`.

On success:

- Marks the active loop `done`.
- Sets `closed_at`.
- Writes a loop report to `artifacts/loops/<loop_id>/reports/close.md`.
- Clears `active` in `memory/loops.yaml`.
- Leaves all logs and journal entries intact but inactive.

### `pb loop close --status failed --reason "..."`

The failure close gate. It is for contaminated runs.

On success:

- Marks the active loop `failed`.
- Stops or flags all tracked live processes for that loop.
- Writes `artifacts/loops/<loop_id>/quarantine.md` with:
  - reason,
  - touched files if known,
  - journal line range,
  - live/stopped process list,
  - recommended next command.
- Clears `active` in `memory/loops.yaml`.

This is the required escape hatch after loop one fails. Loop two may only start after loop one is
terminal: `done`, `failed`, `quarantined`, or `abandoned`.

If a loop closes as `failed`, the next `pb loop new` should refuse unless the failed loop has either:

- at least one recorded learning reflection, or
- an explicit `--skip-learning` stamp with a reason.

This prevents a clean epoch from becoming a repeat of the same failure.

### `pb learn --loop <loop_id> --source user --notes "..."`

Captures the user's reflection after a failed or confusing loop.

The command should ask the agent to classify the lesson into one of four promotions:

- `journal`: historical context only; keep it in the append-only record.
- `memory`: hot durable operating rule; add or update `memory/project-memory.md`.
- `backlog`: concrete repair work; create a task with acceptance checks.
- `skill`: reusable capability gap; create or update `skills/<id>/SKILL.md` and
  `processes/<id>.yaml`, then register them in the indexes.

The raw user wording is preserved in `memory/lessons.ndjson`. Any promotion records the target file
or task id so later agents can trace why the change exists.

### `pb learn status`

Shows open lessons, their source loop, and whether each has been promoted.

`pb checkpoint` should warn when high-severity open lessons exist and a new loop is active.

### `pb loop new --from-lessons`

Seeds the next `memory/cycle.md` brief from unresolved lessons:

- Q2 foreseen challenges includes open high-severity lessons.
- Q3 previous challenges is generated from the last loop's learning reflection.
- Q5 memory conflicts includes any lesson that contradicts host/agent memory.

The new loop starts with explicit failure modes in view instead of relying on chat context.

### `pb loop quarantine <loop_id>`

Marks an already closed failed loop as quarantined after a human/agent has reviewed the report.

No deletion. Quarantine means "never use as active context unless explicitly requested."

### `pb run -- <command>`

Optional but important for process contamination.

Starts a command under the active `loop_id`, records its PID in `memory/processes.ndjson`, and writes
stdout/stderr into `artifacts/loops/<loop_id>/logs/`.

Agents should use this wrapper for dev servers, watchers, and long-running checks. Short
acceptance checks can keep using `execSync`.

### `pb ps` and `pb stop`

Lists and stops tracked processes by loop id.

- `pb ps` defaults to the active loop.
- `pb stop --loop <loop_id>` stops every live tracked process for that loop.
- `pb loop close --status failed` calls the same stop logic.

## Done Detection

A loop is done only when the close command can make this transition:

```text
active -> done
```

That transition is the detection point. It replaces implicit assumptions such as "the last task was
recorded done" or "the report was generated."

Task done remains enforced by acceptance checks. Loop done is a higher-level gate that proves there
is no leftover active work or tracked runtime state.

## Smarter Next Loop

A smarter next loop has three properties:

- It starts from a clean epoch (`loop_id`) with no active contamination from the previous loop.
- It carries forward selected learning from the previous loop through `memory/lessons.ndjson`.
- It promotes reusable fixes into durable surfaces: `memory/project-memory.md`, backlog tasks, or
  new skills/processes.

The promotion ladder is:

1. Raw event: `memory/journal.ndjson`.
2. Structured lesson: `memory/lessons.ndjson`.
3. Durable operating rule: `memory/project-memory.md`, only if always true and frequently needed.
4. Executable repair: `memory/backlog.yaml`, when work is required.
5. Reusable capability: `skills/` + `processes/`, when the agent should handle the class of problem
   better next time.

Do not dump every reflection into project memory. Project memory stays lean. Detailed mistakes,
root-cause notes, and one-off feedback live in `memory/lessons.ndjson`; only the distilled rule is
promoted to project memory.

## Clear Semantics

"Clear for second loop" means:

- no active loop exists,
- no tracked process from the prior loop is alive,
- reports/logs from the prior loop live under its artifact directory,
- the prior loop's journal records are still present but scoped by `loop_id`,
- `pb loop new` creates a fresh active epoch.

It does not mean:

- truncate `memory/journal.ndjson`,
- delete failed logs,
- reset backlog history,
- trust untracked processes.

## Checkpoint Integration

`pb checkpoint` should add these warnings:

- active loop exists but no progress has been recorded in it,
- no active loop exists while tasks are `todo` or `in_progress`,
- active loop is failed/done but still set as active,
- live tracked processes exist for a non-active loop,
- journal entries are being written without a `loop_id`,
- the last failed loop has no learning reflection,
- open high-severity lessons are not referenced by the active cycle brief.

`pb anchor --brief` should include:

```text
Loop: loop-20260617-001 active · artifacts: artifacts/loops/loop-20260617-001
Lessons: 2 open high-severity · run `pb learn status`
```

## Migration

1. Create `memory/loops.yaml` on first `pb loop new`.
2. Create `memory/lessons.ndjson` on first `pb learn`.
3. Treat existing journal rows as `loop_id: legacy`.
4. Keep existing commands working:
   - `pb record` attaches the active `loop_id` when one exists.
   - If no active loop exists, `pb record` warns and records `loop_id: legacy` unless `--require-loop` is set.
5. Existing reports get a loop column or group entries by loop.
6. `pb validate --strict` eventually fails on new unscoped records after migration.

## Minimal Implementation Order

1. Add loop registry helpers and `pb loop new/status/close`.
2. Stamp `loop_id` onto `pb record` entries.
3. Teach `checkpoint`, `anchor`, and `report` to display loop scope.
4. Add `pb learn` and `memory/lessons.ndjson`; gate new loops after failed loops on learning reflection.
5. Add `pb run`, `pb ps`, and `pb stop` for long-running process isolation.
6. Add strict validation for unscoped new records.

## Acceptance Checks

Implementation should include executable checks for:

- failed loop can be closed and a new loop can start,
- done loop refuses to close while a task is `in_progress`,
- failed close writes a quarantine artifact,
- `pb record` stamps active `loop_id`,
- failed loop without a learning reflection blocks `pb loop new` unless skip is stamped,
- `pb learn` records raw user feedback and promotion target,
- next cycle brief can be seeded from open lessons,
- `pb checkpoint` warns about live processes from a closed loop,
- legacy journal entries remain readable.
