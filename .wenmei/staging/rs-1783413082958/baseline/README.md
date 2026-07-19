# Agent-Playbook

Current engine release: **v0.3.6**.

> **Done is an exit code, not prose.** The kernel is a `pb record --status done` that re-runs each
> task's `acceptance_checks` (shell commands) and *refuses* on failure. Anchoring, the North Star
> (`north_star`), the cycle brief, and carry-on portability all *support* that verification gate —
> they do not replace it. If a check is tautological, the gate is hollow; see `scripts/check-hollow.mjs`.

A **portable, agent-first playbook**. Drop it into any folder and an agent can run it in a loop
without friction: orient on a master file, pick a task, do the work, prove it with **executable
acceptance checks**, record, and roll the records up into a human-readable report. Everything
lives inside the folder — copy it anywhere and it still works (carry-on).

## Why

Agents lose the thread between sessions, drift from process, and — worst of all — declare work
"done" without proof. This playbook fixes all three with the minimum machinery that actually works:

1. **One master** everything re-anchors to (`playbook.yaml`, the "fixation"), kept salient by
   cheap re-injection (`pb anchor` + runtime hooks), so long context and compaction never lose the plot.
2. **Enforced done.** A task's `acceptance_checks` are shell commands. `pb record --status done`
   runs them and **refuses to record** if any fail. Exit codes keep the loop honest — process
   documents don't.
3. **Durable state on disk** (backlog, append-only journal), so context loss never means work loss.

That's the whole thesis. No specs pipeline, no DAG scheduler, no debt ledger — the playbook earns
complexity only when a real workload demands it.

## Layout

```
playbook.yaml      THE MASTER — indexes everything; loop contract; guardrails
SKILL.md           How any agent operates the playbook (read first)
AGENTS.md          Pointer for cross-tool compatibility
scripts/pb.mjs     The loop CLI (status | next | record | report | validate | anchor | checkpoint | loop | learn | run | ps | stop | list | scaffold | init | bootstrap)
processes/         Canonical, ordered workflows (+ index.yaml)
skills/            Short "how-to"s that route to processes (+ index.yaml)
memory/            project-memory.md · backlog.yaml · journal.ndjson  (durable, agent-first)
artifacts/reports/ Generated human-facing rollups
```

## v0.3.3: conformance-first project intake

When a project starts from an approved visual design, establish the design contract **before broad
implementation-oriented codebase analysis**. Otherwise, legacy files and nearby examples can
silently redefine the approved design before the agent has a stable reference.

Choose the coding-pack adapter that matches the source:

| Approved source | Skill | Source identity |
| --- | --- | --- |
| Pencil mockups via MCP | `$pencil-design-layout-conformance` | Pencil file/frame/node IDs + approved screenshots |
| Canonical HTML mockup | `$html-design-layout-conformance` | HTML entry point + checksum + stable `data-design-id` anchors |

The intake order is:

1. Approve `DESIGN.md` and the Pencil or HTML source, including required viewports and UI states.
2. Invoke the matching conformance skill and create `design-contract.yaml` from the **design
   source only**: provenance, states, viewports, semantic regions, geometry, and tolerances.
3. Analyze the codebase **through that contract**. Inspect only what is needed to map its regions:
   canonical component APIs, deprecated paths, compilable examples, tokens, and the existing test
   harness. Do not mine arbitrary nearby screens to infer the intended design.
4. Complete the component mapping, implement one golden screen, and prove the verification command
   fails on a deliberate layout shift before restoring it.
5. Only after the contract gate passes, implement production screen slices. Each slice must pass
   geometry, screenshot, responsive, applicable interaction, anti-gaming, and human-attestation gates.

For HTML sources, start from
`modes/coding/skills/html-design-layout-conformance/assets/design-contract.template.yaml`.
For Pencil sources, produce the same target-repository artifact with `source.kind: pencil` and
stable Pencil provenance. The adapter processes are under `modes/coding/processes/`.

## Quick start

```bash
npm install                       # one dependency: js-yaml
node scripts/pb.mjs bootstrap     # first empty install only: seed minimal run-task skill/process
node scripts/pb.mjs status        # orient
node scripts/pb.mjs next --claim  # pick + claim the next task (prints its acceptance checks)
# ...do the work via the skill it names...
node scripts/pb.mjs validate --task T1            # run the task's checks on demand
node scripts/pb.mjs record --task T1 --action execute --status done --notes "did the thing"
#   ^ re-runs the checks; refuses to record done if any fail
node scripts/pb.mjs report        # writes artifacts/reports/report-<date>.md
```

There are npm aliases too: `npm run status`, `npm run next`, `npm run validate`, `npm run report`.

## The loop

**orient → select → act → verify → record → report → repeat.** One command per step:

| Step | Command |
| --- | --- |
| Orient | `node scripts/pb.mjs status` |
| Select | `node scripts/pb.mjs next --claim` |
| Act | open `skills/<id>/SKILL.md`, follow `processes/<id>.yaml` |
| Verify | `node scripts/pb.mjs validate` + `validate --task <id>` |
| Record | `node scripts/pb.mjs record ...` (done is enforced) |
| Report | `node scripts/pb.mjs report` |

See `SKILL.md` for the full contract and skills-first routing.

## Done is enforced, not declared

Tasks in `memory/backlog.yaml` carry executable checks:

```yaml
- id: T7
  title: Add a sitemap generator
  status: todo
  skill: run-task
  priority: 1
  acceptance_checks:
    - node scripts/generate-sitemap.mjs --dry-run
    - node scripts/pb.mjs validate
```

Each check runs with `cwd` = the playbook root; exit 0 = pass. `pb record --status done` runs them
all and exits 1 on any failure, telling the agent to fix the work or record `blocked` instead.
`--skip-checks` exists as an escape hatch, but the skip is stamped on the journal entry and
flagged in reports (`⚠checks-skipped`) — it can't be hidden.

A task without checks is verified on the agent's honor only, and `pb next` says so when claiming it.

Tasks may also declare `dependencies: [T1, T2]` — a task isn't claimable until its dependencies
are done.

## Hardening (context-loss survival)

State lives on disk, never only in chat. Two commands keep the playbook in an agent's attention:

- `pb anchor [--brief]` — prints the tiny constitution; cheap enough to re-inject every turn.
- `pb checkpoint [--snapshot]` — heartbeat: re-anchors, detects drift (multiple claims, claimed
  work with no record, red guardrails), and `--snapshot` writes `memory/RESUME.md` for cold resume.

Wire them into runtime hooks so the agent never has to remember (Claude Code example):
`SessionStart` → `pb anchor`, `UserPromptSubmit` → `pb anchor --brief`, `PreCompact` →
`pb checkpoint --snapshot`. See the `harden` skill.

## Loop epochs and lessons

Use `pb loop new` to open a durable loop epoch. New `pb record` entries are stamped with the active
`loop_id`, and loop-scoped artifacts live under `artifacts/loops/<loop_id>/`.

Close clean loops with `pb loop close --status done`. Close contaminated runs with
`pb loop close --status failed --reason "..."`; that writes a quarantine artifact and blocks the
next `pb loop new` until a lesson is recorded with `pb learn --loop <id> --source user --notes "..."`.
Promote reusable lessons into project memory, backlog tasks, or skills/processes.

## Make it your own

- Add tasks to `memory/backlog.yaml` — with executable `acceptance_checks` whenever possible.
- Add a workflow: `processes/<id>.yaml` (+ register in `processes/index.yaml`) and
  `skills/<id>/SKILL.md` (+ register in `skills/index.yaml`).
- Record durable facts in `memory/project-memory.md`.

## Drop into another project

```bash
node <engine>/scripts/pb.mjs scaffold --target <repo>/.agents-playbook
```

Copy-don't-clobber: existing files are never overwritten (except `pb.mjs` itself, which is the
engine). Then `npm install` and `node scripts/pb.mjs bootstrap`. The CLI resolves paths relative
to its own folder, so it travels intact. Full lifecycle in `INSTALL.md`.

## Guardrails

`node scripts/pb.mjs validate` checks the master + indices parse, every referenced file exists,
skills point to real processes, the backlog (statuses, dependencies, check declarations) and
journal are well-formed. It exits non-zero on failure, so it drops cleanly into CI or a
pre-commit hook. `validate --task <id>` runs one task's acceptance checks.

## Dependencies

One: [`js-yaml`](https://www.npmjs.com/package/js-yaml). Node >= 18.

## What was deliberately cut

Earlier versions carried a spec/Work-Map layer (DAG scheduling, gates, waves, debt ledgers).
It was planning metadata the CLI never executed — bureaucracy cosplaying as machinery. It now
lives in `attic/` and the engine is ~40% smaller. If a real workload ever needs orchestration,
build it against demonstrated need, not anticipation.
