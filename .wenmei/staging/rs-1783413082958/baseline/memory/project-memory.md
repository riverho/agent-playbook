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
7. **Windows runner — `.cmd`/`.bat` shims (npm, pnpm, yarn) require `cmd.exe /d /c` wrapping.**
   `execFileSync` and `spawn` with `shell:false` cannot launch `.cmd`/`.bat` files on Windows —
   Node returns `EINVAL` (or `ENOENT` for bare names without `PATHEXT` lookup). The playbook
   dispatches shims by calling `cmd.exe /d /c <file> <args>`. Use the helpers in
   `scripts/pb.mjs` (`runCommandSync`, `spawnCommand`) — do not call `execFileSync`/`spawn`
   directly for shim dispatch.
8. **Windows runner — `cmd.exe /d /c` argv must not contain cmd-special chars unquoted.** When
   `file` or any argv element contains `( ) < > & |` and is unquoted, `cmd.exe` interprets them
   (e.g., `setTimeout(()=>{}, 5000)` — the `>` becomes redirection). Node's default Windows
   auto-quoting only quotes whitespace/`"`, not these specials. Practical workaround: put the
   script in a `.js` file and invoke `node ./sleeper.js` (no specials in argv). Do NOT pass
   `/s` to `cmd.exe` — `/s` + a leading quote strips both leading and trailing quote (cmd.exe
   rule 2), which breaks paths like `C:\Program Files\...`.
9. **Windows runner — risk surface is narrow.** Tests that invoke `process.execPath` (a real
   `.exe`) via `execFileSync`, or that use `execSync` (goes through the shell), are unaffected.
   The risk surface is user-defined `acceptance_checks` and `pb run -- <cmd>`. When adding a new
   test script or runner path, default to `runCommandSync`/`spawnCommand` rather than reaching
   for `execFileSync`/`spawn` directly.

## Project Facts

1. **Two skill systems, two doorways — no dispatch collision.** Playbook skills (`skills/<id>/SKILL.md`,
   indexed in `skills/index.yaml`, routing to `processes/`) are invoked by **reading a file path**;
   harness skills (`~/.claude/skills/`) are invoked by the **`Skill` tool / slash command**. They
   resolve against different registries, so they can never shadow each other. The one intentional seam
   is the `/agent-playbook` harness skill bootstrapping into this repo (the `install` skill is
   "summoned by /agent-playbook"). Convention to prevent name drift as both sets grow: reference a
   **playbook** skill as a path (`skills/<id>/SKILL.md`), a **harness** skill as a slash (`/<name>`) —
   the shape disambiguates. A repo-local `.claude/skills/` is the only place a real name collision
   could occur, and it'd be harness-vs-harness, never with `skills/`.

2. **Orchestrator architecture — flow runner over a mode catalog (BUILT, epoch loop-20260628-001).**
   Command/file surface as shipped: `pb list modes` + `pb mode show <id>` + `pb mode skills|processes <id>`
   (catalog in `modes/index.yaml`, sync-guarded by `pb validate`); `scripts/pb-daily-monitor.mjs --mode <id>`
   reads a `scaffold:` descriptor on the mode (config/items/skill/goal_template/check_field/id_field) — no pack
   literals; a scaffold skill absent from the mode's menu logs ONE `pending` proposal to
   `artifacts/reports/orchestrator-iterations.ndjson` and exits 2 without scaffolding; `scripts/pb-flow.mjs
   --flow <id>` runs `flows/<id>.yaml` steps in order (one epoch, fail-fast) with `--input`/`--output`
   artifact-dir handoff (fixed `handoff.yaml` / `handoff` key so modes need not share an items key);
   `scripts/check-flow.mjs` validates flow structure. Original design notes below still hold.
   A **mode** = a streamline set (its own skills + processes, mounted from YAML). The orchestrator
   heartbeat is mode-agnostic: `mode set → scaffold backlog → drain (pb loop run --auto) → stop when
   done → reflect → log proposals`. It is **read-only on its own machinery** — it never edits
   skills/processes mid-run; gaps become proposals in `orchestrator-iterations.ndjson`, built later by
   a **separate evolution loop**. Three nested levels: **flow** (sequence of modes) → **mode heartbeat**
   (one streamline set) → **task loop** (claim→act→verify→record). Settled design decisions:
   - **Scaffolding/planning is "sufficient" only if it is check-generating** — each scaffolded task must
     carry an executable acceptance_check (the `--check` on `pb plan`), or "stop when backlog done"
     means nothing and the north star breaks.
   - **Mode catalog:** add `modes/index.yaml` (description + abstract of each mode's process set) with
     a two-level menu — `pb list modes` (which streamline set) and `pb mode show <mode>` (what's inside).
     `pb validate` must assert the index and `playbook.yaml`'s `modes:` map agree, or the menu lies.
   - **Mode composition = a `flows/` definition, NOT `next:` pointers inside modes** — keeps modes
     reusable across pipelines. A flow lists ordered mode steps.
   - **Handoff model: explicit artifact dirs (decided).** Mode A writes to its `output` dir; mode B's
     scaffold reads that as `input`. No shared mutable backlog. Modes know only their own input/output
     dirs, never their neighbors.
   - **Flow semantics:** fail-fast (a step that doesn't drain halts and surfaces via non-zero exit,
     like `pb-daily-monitor.mjs` today) and **one loop epoch per flow run** so `pb reflect` sees the
     whole sequence as one unit of learning.
   - `scripts/pb-daily-monitor.mjs` is the blogwatch-welded prototype of this; generalizing it =
     parameterize `--mode`, lift scaffold config into the mode, add the menu + gap-proposal surfaces.

3. **Prose → backlog goes through `triage` (skill `triage` / `processes/triage-claim.yaml`).** When work
   arrives as narrative — a reflection's bug list, a user "fix these," a subagent "COMPLETE" — do not start
   coding from the summary. Run the triage route: inspect the cited evidence not the prose; reproduce each
   defect first; **one defect = one task with an acceptance_check that is RED before / GREEN after** (group
   only when one check truly covers them all — that is the granularity rule); route skills-first; and touch a
   skill/process/mode ONLY when a defect reveals a missing capability — then log a `pending` proposal and build
   it in a **separate** loop, never inline. This was the unanimous finding of three independent agents in the
   smoke test (`SMOKE_TEST_*.md`).

## Memory Budget

Keep this file lean. Hot, always-true operating rules stay here; cold, historical, or task-specific
detail belongs in task notes or reflection entries, not durable project memory.
