# Wenmei + Agent-Playbook Integration Contract

PB owns truth. Wenmei is the calm local UI/control surface over that truth.

## Boundary

Agent-Playbook owns the canonical protocol:

- backlog task IDs, status, claims, and acceptance checks
- loop and cycle lifecycle
- journal rows and close reports
- worker worktree records
- checker verdicts
- provider cooldown records such as `retry_after: 5h`
- machine-readable JSON surfaces for agents and UI clients

Wenmei owns local interface/runtime affordances:

- terminal panes and user-visible run cards
- review and approval UI
- document/vault context
- human prompts and notifications
- calls into `pb` commands or a future thin adapter

Orca is reference material, not a dependency. Borrow its operational spine — typed control, visible sessions, worktree isolation, checker gates — without copying its product bulk.

## JSON surfaces

Wenmei should prefer JSON commands:

```bash
node scripts/pb.mjs status --json
node scripts/pb.mjs task show <task-id> --json
node scripts/pb.mjs runcard list --json
node scripts/pb.mjs runcard show <task-id> --json
```

These are UI-safe projections of PB state. A Wenmei RunCard should be a projection of PB task + worker + checker + provider state, not a separate orchestration database.

## Worker worktree lifecycle

Root/orchestrator owns `.agents-playbook` state. Workers edit isolated git worktrees and do not mutate canonical PB coordination files directly.

Dry-run by default:

```bash
node scripts/pb.mjs worker create <task-id> --agent codex --json
```

Execution is explicit:

```bash
node scripts/pb.mjs worker create <task-id> --agent codex --execute
```

The generated branch shape is:

```text
agent/<task-id>-<agent>
```

`create --execute` refuses before mutating anything if the branch or the worktree path
already exists, so a re-run is a clean error rather than a half-made worktree.

Teardown is symmetric — dry-run by default, `--execute` to apply:

```bash
node scripts/pb.mjs worker remove <task-id> --execute
node scripts/pb.mjs worker remove <task-id> --delete-branch --force --execute
```

`--force` discards uncommitted work in the worktree; `--delete-branch` drops the branch
after the worktree is gone. Removal records `worker.status: removed` rather than erasing
the worker record, so the RunCard keeps its history.

## Checker gate

The doer never self-approves. A merge decision reads the worker diff, PB journal, acceptance check output, and review ledger; then a context-isolated checker records:

```bash
node scripts/pb.mjs worker checker <task-id> --verdict pass|risk|block --notes "..."
```

Merge readiness is a gate over completion, not a substitute for it:

```bash
node scripts/pb.mjs worker merge-ready <task-id> --json
```

The command exits `1` when the task is not ready, so it composes directly:

```bash
node scripts/pb.mjs worker merge-ready <task-id> && git merge --no-ff agent/<task-id>-<agent>
```

A task is merge-ready only when **all** of these hold:

- the checker verdict is `pass` — `risk` and `block` hold the branch and escalate to the human
- the task status is `done`, which PB only grants after its `acceptance_checks` exit 0
- that `done` record did not use `--skip-checks`
- the checker verdict is newer than the `done` record it claims to have reviewed

The last three exist because a verdict on its own is a claim, not verification
(`lesson-20260705-001`: a sub-agent exiting 0 is not evidence the work happened).

`warnings[]` is advisory and does not block: it flags tasks with no `acceptance_checks`,
checks that are structural only (`gate_quality: ⚠hollow`), and an active provider cooldown.

## Provider cooldown

If Claude, Codex, Kimi, OpenCode, or another provider hits a real 403/429 rate limit, record it instead of thrashing retries:

```bash
node scripts/pb.mjs worker provider-rate-limit <task-id> --provider codex --retry-after 5h
```

Wenmei may render this as `provider_rate_limited` and offer a provider switch for independent work. PB remains the durable source of the cooldown state.

## Invariant

Do not create a second orchestration brain in Wenmei.

```text
PB = protocol and durable truth
Wenmei = local UI/runtime surface
Worker = isolated worktree edits and evidence
Checker = independent verdict before merge
```
