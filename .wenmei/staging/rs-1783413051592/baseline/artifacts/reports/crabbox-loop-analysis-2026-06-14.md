# Crabbox Loop Lessons for Agent-Playbook

Generated: 2026-06-14

## Executive Read

Agent-Playbook has the right kernel: a small loop, durable local state, and a
hard rule that "done" must be backed by executable checks. Crabbox shows what
happens when that kernel is extended into a production execution loop: objective
definition, onboarding, environment preparation, run execution, evidence
capture, result parsing, failure classification, and cleanup are all modeled as
first-class lifecycle events.

The main lesson is not "make Agent-Playbook as large as crabbox." That would be
bloat. The lesson is narrower: keep the playbook small, but make evidence richer
and task-specific. A passed check should prove the objective, not merely prove
that the playbook files still parse.

## Cycle Comparison

| Stage | Agent-Playbook today | Crabbox reference | Lesson |
| --- | --- | --- | --- |
| Objective | Backlog task with `title`, `notes`, `skill`, `acceptance_checks`. | Command/job/profile with run label, provider, target, class, sync, artifacts, JUnit, stop policy. | Add a clearer objective/evidence contract per task. |
| Init | `pb init`, `bootstrap`, `scaffold`, `status`, `next --claim`. | `crabbox init --detect` writes repo config, hydration workflow, and agent skill. | Detect the target repo and seed useful task checks instead of generic `pb validate`. |
| Environment | Mostly implicit; agent runs commands manually. | Lease, sync, preflight, hydrate, env forwarding, heartbeat. | Add lightweight harness metadata: cwd, env, preflight, tool availability, and command timing. |
| Execution | Human/agent performs work outside the CLI. | CLI owns sync, command, stream, results, artifacts, cleanup. | Agent-Playbook should not own all execution, but should record execution events and command outputs. |
| Eval | `pb validate --task` runs shell checks; `pb record --status done` refuses failed checks. | Run recorder stores phase events, logs, timing, JUnit summaries, failure classification, telemetry. | Keep the refusal gate, but store check result details and parsed summaries. |
| Completion | Append journal, update backlog, generate report. | Finish run, persist logs/results, release lease, emit stop/inspect commands. | Completion should close evidence and cleanup, not only flip task status. |

## What Crabbox Does Better

1. It gives every execution a durable identity.

Crabbox has lease IDs (`cbx_...`) and run IDs (`run_...`). Agent-Playbook has
task IDs, but not iteration/run IDs. That makes repeated attempts harder to
distinguish. A future journal entry should include `iterationId`, check run IDs,
and parent attempt references.

2. It records phases, not just outcomes.

Crabbox records lifecycle events such as leasing, bootstrap, sync, hydration,
command start/finish, lease release, and failures. Agent-Playbook records a
single final row. Add optional event rows:

- `objective.selected`
- `task.claimed`
- `action.started`
- `check.started`
- `check.finished`
- `evidence.attached`
- `task.completed` or `task.blocked`

3. It parses evidence into structured summaries.

Crabbox does not ask the reviewer to read a whole log when JUnit exists. It
stores a compact result summary with failed cases. Agent-Playbook can copy this
pattern generically:

- keep raw check output tails;
- store exit code and duration per check;
- support known parsers later: JUnit, TAP, Go `test2json`, Vitest JSON;
- render failed cases in reports.

4. It makes onboarding generate a runnable workflow.

`crabbox init --detect` scans project markers and creates a detected job. That
is exactly the missing piece in Agent-Playbook installs. `pb scaffold --detect`
should detect Go, Node, Rust, Make, Python, etc., then seed backlog items with
real checks from the target repo.

5. It treats cleanup as part of completion.

Crabbox completion includes release/stop behavior and stale resource cleanup.
Agent-Playbook has checkpointing, but task completion does not check stale
claims, orphaned temp artifacts, or concurrent writers. T5 already points at
journal append atomicity; that should stay high priority.

## Critical Finding From the Temp Loop Test

I copied Agent-Playbook to:

`/private/tmp/ap-loop-crabbox-analysis-20260614`

Then I ran:

```sh
node scripts/pb.mjs status
node scripts/pb.mjs next --claim
node scripts/pb.mjs validate
node scripts/pb.mjs validate --task T3
node scripts/pb.mjs record --task T3 --action loop-smoke --status done --notes temp-copy-cycle-proved-generic-check-can-pass-without-task-specific-change
node scripts/pb.mjs report
node scripts/pb.mjs status
```

Result: the loop recorded T3 as `done` with `checks: passed`, even though no T3
work was done. This is not a failure of the mechanism. It is a failure of the
task check, because T3 only requires:

```sh
node scripts/pb.mjs validate
```

The gate enforces whatever the task says. If the task says only "the playbook
still parses," the loop can produce a false positive. Crabbox avoids this more
often by making run output, result files, artifacts, and failure classification
part of the normal execution path.

## Recommended Changes

Priority 1: strengthen acceptance checks.

Every task should answer: "What command proves the actual objective changed?"
For docs tasks, checks can grep for required positioning text and reject stale
phrasing. For code tasks, checks should run the narrow regression plus structural
validation.

Priority 2: store check result details.

Change journal entries from:

```json
{"checks":"passed"}
```

to include:

```json
{
  "checks": [
    {
      "cmd": "node scripts/pb.mjs validate",
      "exitCode": 0,
      "durationMs": 412,
      "outputTail": "Playbook validation passed."
    }
  ]
}
```

Priority 3: add a detected onboarding path.

Extend `pb scaffold` or add `pb detect` to seed target-specific tasks:

- Go: `go test ./...`
- Node: lockfile-aware install plus `test:ci`, `test`, `check`, or `build`
- Rust: `cargo test`
- Make: `make test`

This is the most direct crabbox lesson.

Priority 4: introduce iteration IDs and event rows.

Keep the append-only journal, but distinguish "task" from "attempt." That lets
reports show retries, blocks, and evidence across long loops.

Priority 5: make reports evidence-first.

Reports should lead with:

- what changed;
- which checks ran;
- failed cases or output tail;
- artifacts produced;
- unresolved cleanup or risk.

The current status-count report is useful, but too thin for reviewing agent
work.

## Verification Run

Agent-Playbook:

- `node scripts/pb.mjs validate` passed.
- `npm run validate` passed.
- Temp full loop passed and exposed the generic-check false positive described above.

Crabbox:

- `npm ci --prefix worker` succeeded after network approval.
- `npm test --prefix worker` passed: 20 files, 566 tests.
- `node scripts/check-docs-links.mjs` passed: 176 Markdown files.
- `node scripts/check-command-docs.mjs` passed: 48 command docs.
- Targeted lifecycle tests passed:
  - `go test ./internal/cli -run 'TestInitProject|TestJobRunDryRun|TestParseJUnitResults|TestRemoteTouchResultsMarker|TestRunRecorder|TestRunFailureDigestIncludesStructuredTestFailures|TestRunStopAfterPolicy|TestPopulateRunTimingMetadata' -count=1`
  - `go test -tags localcontainer ./cmd/crabbox -run TestLocalContainerProviderE2E -count=1`

Broad crabbox Go suite:

- `go test ./...` did not pass.
- Failures appeared in `internal/cli`, `internal/providers/external`,
  `internal/providers/opencomputer`, and `internal/providers/tart`.
- The failures were mostly timing/lifecycle-sensitive tests, not the targeted
  init/job/results/recorder path used for this analysis.

## Bottom Line

Agent-Playbook should stay small. Do not import crabbox's provider system,
coordinator, or remote execution machinery. Import the lifecycle discipline:
detected initialization, explicit objective proof, structured evidence, evented
attempt history, and cleanup-aware completion.

The highest-leverage next task is to replace generic acceptance checks with
objective-specific checks and make `pb record` persist the exact check results.

## Implementation Record

Implemented 2026-06-14.

What changed:

1. `scripts/pb.mjs` now captures rich check results.
   - Journal entries written by `pb record --status done` include `check_results`:
     `cmd`, `name`, `ok`, `exit`, `duration_ms`, `stdout`, `stderr`, `error`.
   - Checks may still be plain strings, or rich objects:
     `{ name, cmd, expect_exit, timeout, capture }`.
   - Capture policy is configurable via `playbook.yaml` under `evidence.capture`
     or `guardrails.capture` (`summary` | `full` | `none`); default is `summary`.

2. `memory/backlog.yaml` updated with objective-specific checks.
   - T3 now requires the pitch phrase in README and docs, not only `pb validate`.
   - T4–T7 carry checks that prove their actual outcomes.

3. Reports surface evidence.
   - `pb report` renders each check result with name, duration, exit code, and
     failed stderr under the matching journal entry.

4. Drift detection warns about thin evidence.
   - `pb status` and `pb checkpoint` flag done tasks that lack `check_results`
     or only have generic `pb validate` checks.

5. Smoke tests added.
   - `scripts/test-smoke.mjs` verifies string checks, object checks,
     `expect_exit`, failing-check refusal, and report evidence.
   - `npm test` now runs `pb validate` plus the smoke tests.

Files touched:
- `scripts/pb.mjs`
- `memory/backlog.yaml`
- `processes/run-task.yaml`
- `processes/harden.yaml`
- `skills/run-task/SKILL.md`
- `skills/harden/SKILL.md`
- `package.json`
- `scripts/test-smoke.mjs` (new)

Validation:
- `npm test` passed.
- Full temp-copy loop (status → next --claim → validate --task → record → report → status)
  produced a journal entry with captured `check_results`.
- T3 can no longer be recorded `done` without the pitch phrase appearing in the
  expected files.

## Phase A Implementation Record

Implemented 2026-06-14.

What changed:

1. Atomic journal append (`scripts/pb.mjs`).
   - Uses a lock directory (`memory/.journal-lock`) and atomic rename of a
     complete rewritten journal.
   - Stale locks from dead processes are automatically broken by pid check.
   - Existing journal lines are preserved exactly; malformed lines are not lost.

2. Stale-claim timeout (`guardrails.claim_timeout_ms`).
   - Default: 4 hours (14400000 ms). Set to 0 to disable.
   - `pb next` releases stale `in_progress` claims before selecting work.
   - No progress recorded since claim → returned to `todo`.
   - Progress recorded since claim → moved to `blocked` for review.
   - Each release appends a `claim-timeout` journal entry.
   - `pb checkpoint` warns about claims that would timeout.

3. Master config updates.
   - `playbook.yaml` now declares `guardrails.claim_timeout_ms`.
   - `playbook.yaml` now declares `evidence.capture` and `evidence.output_limit_bytes`.
   - Bootstrap template seeds these values.
   - Validation enforces numeric/string ranges.

4. Harden docs updated.
   - `processes/harden.yaml` and `skills/harden/SKILL.md` remind resumed agents
     to inspect `check_results` and to run `pb checkpoint` to catch stale claims.

5. Smoke tests extended.
   - 5 concurrent `pb record` processes verify atomic append.
   - A stale `claimed_at` timestamp verifies `pb next` releases the claim and
     claims the next available task.

Files touched in Phase A:
- `scripts/pb.mjs`
- `playbook.yaml`
- `processes/harden.yaml`
- `skills/harden/SKILL.md`
- `scripts/test-smoke.mjs`

Validation:
- `npm test` passed.
- `pb status` / `pb checkpoint` report stale-claim and thin-evidence warnings
  for legacy T1/T2 entries.
- Temp-copy full loop (status → next --claim → validate --task → record → report
  → status) produced a journal entry with captured `check_results`.
- Concurrent record test produced 5 valid journal entries with no corruption.
- Stale-claim test released an old `in_progress` claim and claimed the next task.
