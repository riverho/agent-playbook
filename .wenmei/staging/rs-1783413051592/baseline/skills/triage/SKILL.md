---
name: triage
description: Convert narrative input (reflection findings, user bug lists, subagent reports) into check-gated backlog tasks — the named route from prose to verified work.
---

# Triage (prose → check-gated backlog)

Use this skill **whenever work arrives as prose instead of as a claimed task** — a reflection's
bug list, a user "fix these," a subagent or reviewer "COMPLETE / this is a regression," any
narrative that implies work but carries no acceptance_check. It is the discipline that keeps
"done = a verified exit code" honest from the very first step: you never start coding from a
summary.

Canonical process:
- `processes/triage-claim.yaml`

## When to use
- A reflection or `pb learn` lesson lists defects or follow-ups.
- A user names several bugs/changes in one message.
- A subagent reports completion, or a review claims a flaw.

## The five rules (the whole point)
1. **Evidence, not prose.** Open what the narrative cites; confirm against the real symptom. It over-reports — a "bug" may be a design decision, a "COMPLETE" may be unverified.
2. **Reproduce first.** Recreate each defect by its real path before planning a fix. Can't reproduce it → say so and stop.
3. **One defect = one task with a red→green check.** Each task's `acceptance_check` is an executable command that FAILS now and PASSES after the fix. Group only when one check truly covers them all.
4. **Skills-first.** Route each task to an existing skill; write a new skill+process only if none fits.
5. **Escalate only on a gap.** Touch a skill/process/mode ONLY when a defect exposes a missing capability — then log a `pending` proposal and build it in a **separate** loop. Never edit machinery inline while fixing a bug.

## Steps (mirrors the process)
1. **Gather + verify** — re-anchor (`pb status`); open cited evidence; treat each claim as a hypothesis.
2. **Reproduce** — recreate each surviving defect by its real path; capture a baseline.
3. **Split into checked tasks** — one defect = one task; write the red→green check (`pb plan --goal … --check …`); route skills-first.
4. **Separate the machinery work** — capability gaps become `pending` proposals + their own build task in a separate loop, never an inline edit.
5. **Claim + run + record** — `pb next --claim`, follow the skill, `pb validate --task <id>`, `pb record`.
6. **Roll up** — `pb reflect`, then `pb report`.

## Why it exists
Three independent agents, in a smoke test, all flagged the same gap: the playbook was airtight on
"done = exit code" but had no *named* path from narrative input to machine-tracked, check-gated
work — so that translation was judgment, applied unevenly and skipped under pressure. This skill
makes it a single move you reach for, not a decision you re-litigate each time.
