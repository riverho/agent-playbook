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

## Operating Rules

1. Skills-first. Find the matching skill before improvising. If none fits, write one.
2. One task `in_progress` per agent at a time. Finish or block it before claiming another.
3. Smallest change that satisfies the task's `acceptance_checks`.
4. Keep `pb validate` green before and after acting.
5. When you learn something durable about this project, add it here as a numbered rule — that is
   how the playbook gets smarter over time.
6. After a failed or confusing loop, capture the user's reflection before starting the next loop;
   promote the lesson to project memory, backlog, or a new/updated skill only when it is reusable.

## Project Facts

_(None yet.)_

## Memory Budget

Keep this file lean. Hot, always-true operating rules stay here; cold, historical, or task-specific
detail belongs in task notes or reflection entries, not durable project memory.
