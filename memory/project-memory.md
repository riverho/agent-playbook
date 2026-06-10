# Project Memory

Purpose: durable, in-folder operating memory for every agent that runs this playbook.
This file is read on every session, right after `playbook.yaml`. Keep it short and true.

## How this playbook works

1. `playbook.yaml` is the master (the "fixation"). Re-anchor to it every loop iteration.
2. The loop is: **orient → select → act → verify → record → report**, one command per step.
3. Skills live in `skills/`, processes in `processes/`, the CLI in `scripts/pb.mjs`.
4. Work is **agent-first**: the machine record is `memory/journal.ndjson`; humans read the
   rollups in `artifacts/reports/`. Never hand-edit the journal — use `pb record`.
5. Everything stays inside this folder. Copy the folder and it still works (carry-on).

## Operating rules

1. Skills-first. Find the matching skill before improvising. If none fits, write one.
2. One task `in_progress` per agent at a time. Finish or block it before claiming another.
3. Smallest change that satisfies the task's `acceptance_checks`.
4. Keep `pb validate` green before and after acting.
5. When you learn something durable about this project, add it here as a numbered rule —
   that is how the playbook gets smarter over time.

## Project facts

_(Add durable, non-obvious facts about THIS project here — constraints, conventions,
owners, external systems. Start empty; grow it as you learn.)_

1. `pb record --status done` re-runs the task's `acceptance_checks` and refuses to record if any fail — "done" is enforced by exit code, not declared by prose.
2. The release skill (`skills/release/`) is the canonical way to cut versions; follow `processes/release.yaml` and use `gh release create` to publish to GitHub. Hosted at https://github.com/riverho/agent-playbook.
3. `gh` CLI is installed at `%USERPROFILE%\bin\gh.exe`; PATH must include `%USERPROFILE%\bin` — add it with `$env:PATH += ";$env:USERPROFILE\bin"` in each session until a permanent PATH update is applied.
