---
name: nl
description: Route natural-language requests onto the Agent-Playbook intent grammar and canonical pb commands.
---

# Use the Agent-Playbook by Natural Language

Use this skill when an agent (or human) wants to **drive the playbook from a conversation** — without memorising the `pb` command surface. The skill teaches an agent to map a free-form request to the right playbook step (orient → select → act → verify → record → report) and the right `pb` command(s).

Canonical process:
- `processes/use-playbook.yaml`

## When to use

- A user says "what's next?", "add a task to …", "is it green?", "I learned X", "wrap it up", "open a fresh loop" — anything that maps onto the playbook loop.
- You want a conversational driver on top of `pb` rather than the bare CLI.
- A new agent joins and you'd rather have a tiny intent grammar to lean on than re-learn the CLI.

## The principle

> The playbook's CLI (`scripts/pb.mjs`) is the source of truth. This skill is a **thin translation layer** — natural language → intent → `pb` command(s). It adds no behaviour of its own; it routes to the existing loop.

Three layers, in order:

1. **Intent grammar** — a small set of regex patterns per intent (`scripts/lib/nl-router.mjs`). First match wins; the table below documents precedence explicitly.
2. **Command template** — each intent maps to one or more `pb` shell commands (often with `<placeholder>` slots the caller fills).
3. **Loop awareness** — every intent is a step in the phase/task loop; the skill says which step it is so the agent stays inside the cadence.

## Intent grammar (canonical)

> Single source of truth: `scripts/lib/nl-router.mjs`. The table below mirrors `INTENTS` in that file. If they ever disagree, the **library wins** — re-sync the table.

Precedence is **top-to-bottom, first match wins**. The agent must follow this order; deviating produces wrong routings (e.g. "claim the next task" must hit `claim`, not `select`).

| # | Intent           | Canonical phrasings                                          | `pb` command(s) |
|---|------------------|--------------------------------------------------------------|-----------------|
| 1 | `verify-task`    | "check task oc-plugin", "validate task plan-001"             | `validate --task <id>` |
| 2 | `record-blocked` | "blocked", "mark it blocked", "record it blocked"            | `record --task <id> --action execute --status blocked --notes "<reason>"` |
| 3 | `record-done`    | "mark done", "log this done", "I'm done", "finished it"      | `record --task <id> --action execute --status done --notes "<what+why>"` |
| 4 | `claim`          | "claim the next task", "pick the next one", "let's do next" | `next --claim` |
| 5 | `select`         | "what's next?", "next task", "show me the backlog"           | `next` |
| 6 | `cycle-new`      | "new phase", "new cycle", "open a phase", "start a cycle"    | `cycle --new --goal "<goal>" --stop "<stop>"` |
| 7 | `reflect`        | "reflect", "close the phase", "wrap it up", "end the cycle" | `reflect --notes "<summary>"` |
| 8 | `loop-new`       | "new loop", "fresh loop", "loop new", "ground-up"           | `loop new [--fresh] [--from-lessons] --goal "<goal>" --stop "<stop>"` |
| 9 | `loop-close`     | "close the loop", "loop close", "end the loop"               | `loop close --status <done\|failed\|abandoned>` |
| 10 | `orient`        | "status", "where are we", "orient", "big picture"            | `status` |
| 11 | `plan`          | "add a task", "queue this up", "backlog: …", "plan: …"      | `plan --goal "<goal>" [--check "<cmd>"]... [--manual]` |
| 12 | `verify`        | "is it green", "validate", "run the checks", "verify"       | `validate` |
| 13 | `report`        | "report", "roll up", "show me the report"                    | `report` |
| 14 | `learn`         | "I learned …", "capture this lesson", "lesson: …"            | `learn --source user --notes "<lesson>"` |
| 15 | `anchor`        | "re-anchor", "anchor", "replay the constitution"            | `anchor [--brief]` |
| 16 | `checkpoint`    | "checkpoint", "resume", "after compaction/handoff"          | `checkpoint [--snapshot]` |
| 17 | `scaffold`      | "scaffold into …", "install this playbook", "apply the playbook" | `scaffold --target <dir>` |
| 18 | `help`          | "help", "what can you do", "commands available"              | `help` |
| —  | `unknown`       | anything that doesn't match                                  | (no command; show `route(text).hints`) |

## How to apply (the agent's job)

When the human says something:

1. **Normalise** — lowercase, trim, collapse whitespace.
2. **Match** — walk the table top-to-bottom; first intent whose patterns hit wins. The agent may shell out to the matcher for transparency:
   - `node scripts/lib/nl-router.mjs "<the utterance>"` — prints `{ intent, commands, matched, hints }`.
3. **Fill placeholders** — `<id>`, `<goal>`, `<stop>`, `<reason>`, `<lesson>` come from the context (current claimed task, prior turn, etc.).
4. **Run the command** — the agent executes the `pb` command, not the matcher.
5. **Confirm** — re-anchor if the action was mutation, or surface the result for read-only intents.

The agent **does not** invent commands. If the grammar doesn't cover the request, route to `help` (print the loop + the table) or surface the closest `hints`.

## Step in the loop

The intents above map onto the playbook loop:

```
orient ──► select ──► act ──► verify ──► record ──► report ──┐
   │          │                                              │
   │          └─► claim ──► (now act on a claimed task)       │
   │                                                          │
   └──────────────────────────────────────────────────────────┘
                              ▲
   harden:  anchor / checkpoint  (anywhere)
   phase:   cycle-new ──► … work … ──► reflect ──► cycle-new (next phase)
   loop:    loop-new ──► … work … ──► loop close
```

`verify-task`, `record-done`, `record-blocked`, `plan`, `learn`, `cycle-new`, `reflect`, `loop-new`, `loop-close`, `scaffold` are explicit named transitions. `anchor` and `checkpoint` are **orthogonal** — call them anywhere without leaving the loop.

## Rules

1. **Never bypass the CLI.** The skill only translates; it does not modify backlog/journal/cycle directly.
2. **Precedence is load-bearing.** "claim the next task" is `claim`, not `select`; "blocked" is `record-blocked`, not `record-done`. Walk the table top-to-bottom.
3. **Match, don't guess.** If no pattern hits, surface `hints` and ask. Do not invent a command.
4. **Carry-on.** Pure Node stdlib (no npm deps). The matcher is one file: `scripts/lib/nl-router.mjs`.
5. **Verified, not declared.** `scripts/test-nl-routing.mjs` is the ground truth: any change to the grammar must keep the fixture green.
6. **Scoped verify beats generic verify.** "validate task oc-plugin" is `verify-task`, not `verify`; same for `record-blocked` vs `record-done`.

## Acceptance

The skill is considered present and usable iff **both** checks pass:

- `node scripts/check-nl-skill.mjs` — structural (files exist, parse, indices reference them).
- `node scripts/test-nl-routing.mjs` — behavioral (canonical phrases route to the right intent).

`pb validate` alone is **not** a task check for this skill — the skill's fixation is "the grammar is concrete," and only the behavioral test proves that.
