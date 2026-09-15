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

4. **Shared state is written ONLY through `withStateTxn` / `applyTaskMutation`.** `memory/backlog-state.json`
   is one JSON object shared by every agent. Any read-modify-write of the WHOLE object is a lost-update bug:
   two agents whose windows overlap silently discard each other, and a crash mid-write leaves truncated JSON.
   A transaction takes the `backlog-state.json.lock` (O_EXCL), re-reads inside the critical section, and
   replaces the file atomically (temp + rename). Consequences to respect:
   - **Never take the state lock and then call a state writer** — `acquireLock` is not re-entrant. The claim
     path did exactly this and self-deadlocked: the inner acquisition burned its full timeout, the outer write
     happened anyway, and `pb next --claim` stalled ~30s while reporting success. A critical section that needs
     to read before it writes uses `withStateTxn(...)` directly, not a lock plus `updateBacklogState`.
   - **Clearing a field needs `__unset: [...]`.** Patch values that are `undefined` are filtered out, so
     `{ claim_token: undefined }` is a no-op — that is how `pb release` first left a stale lease behind.
   - `memory/journal.ndjson` is append-only; its rows carry a monotonic `seq`, the writer, and `origin_*`
     provenance. The row and the state touch commit in ONE transaction, so the two records can never disagree
     about who wrote last.
   Regression suite: `scripts/test-concurrency-state.mjs` (in `npm test`). It uses `PB_TXN_TEST_DELAY_MS` /
   `PB_TXN_TEST_PRELOCK_MS` to widen the race on purpose. Verified by mutation: disabling the lock turns the
   suite red with real lost updates — keep that property, or the test is decoration.

5. **A claim is a lease, and sub-agents write with proof, not impersonation.** `pb next --claim` mints a
   `claim_token` stored on the task. A writer proves entitlement three ways: it IS the holder; it presents the
   token (`--token` / `PB_CLAIM_TOKEN`); or the holder appears in its declared delegation chain
   (`PB_AGENT_CHAIN=root,sub,grand`). Design rules:
   - A sub-agent records as **itself** and is attributed as itself (`agent`, `agent_chain`, `ownership:
     token|chain`) — never as the parent. Fan-out stays auditable back to the delegating task.
   - An unproven write is **recorded and flagged `ownership: unproven`**, never silently dropped and never
     silently allowed: losing real work is worse than an unproven row.
   - A terminal record (`done`/`blocked`) ends the iteration and therefore releases the lease; use
     `--status in_progress` to report progress and keep it.
   - `pb release --task <id>` returns a claim to the pool (`--stale <minutes>` sweeps abandoned ones).
     Without it, a crashed holder pinned a task as `in_progress` forever.

6. **A lock is broken by AGE only — never by a liveness check.** The lockfile is the
   mutual-exclusion primitive for shared state (`backlog-state.json.lock`) and the worker slot
   (`.worker.lock`). An earlier version probed the holder's pid with `process.kill(pid, 0)` and
   broke the lock when the probe said the holder was gone. On Windows that probe misreported a
   LIVE, mid-transaction holder as dead, so a waiter stole an active lock and two holders read
   the same state — the journal then carried duplicate `seq` values and writes silently
   overwrote each other. The asymmetry decides the rule: **a lock held too long costs latency; a
   lock broken too early costs data.** Consequences:
   - Stale-breaking is age-based, with a **per-lock window**: the state lock waits minutes
     (recording `done` runs `acceptance_checks` inside it), the short-lived worker slot only 60s.
   - `releaseLock` removes only a lock this process owns (random token written at acquire), so a
     release can never delete another holder's lock.
   - A holder killed mid-transaction can outlive its window; `pb unlock [--force]` is the
     explicit, human-authorized escape hatch. Do not "fix" a stuck lock by shortening the window.
   - Debugging the subsystem: `PB_TXN_TRACE=1` emits `[lock]`/`[txn]` lines; `PB_LOCK_WAIT_MS`
     and `PB_LOCK_STALE_MS` tune the windows for tests.

7. **stdout is a machine channel; everything human goes to stderr.** `pb ... --json` consumers
   parse stdout, so any chatter lands inside a payload and surfaces as the *consumer's* parse
   error rather than the writer's bug. Two real instances: `git worktree add` printed
   "Preparing worktree…"/"HEAD is now at…" to stdout, and `git merge` printed its summary there.
   Both are silenced with `--quiet` in `runGit`, and git's stdout is re-emitted on stderr.
   The test-side counterpart matters just as much: **capture stdout and stderr separately** — a
   harness that concatenates them and then `JSON.parse`s the result corrupts itself on any
   warning git emits (e.g. an LF→CRLF notice).

8. **The journal is the truth; `backlog-state.json` is a projection of it.** The two are written in
   one transaction and carry the same monotonic `seq`, which is what makes recovery possible: if a
   state write is lost (crash between append and commit, truncated file, killed process), the record
   still holds the facts and the view can be rebuilt. `pb repair-state` is that rebuild.
   - Rules: `--check` (exit 1 on drift, CI-wireable), `--apply` (rebuild), `--strict` (drop
     fields the journal cannot justify). A bare invocation is a dry run.
   - **Scope is the CURRENT backlog.** A task the journal mentions but the backlog no longer
     carries is history, not drift — resurrecting it would fill the projection with dead tasks.
   - **Preserve what the journal does not model** (worker, checker, provider). Deleting them would
     be data loss dressed up as a repair; `--strict` is the explicit opt-in.
   - `pb checkpoint` reports drift and a journal-ahead-of-projection gap (a lost write) as warnings,
     so silent divergence surfaces at the heartbeat instead of being discovered later.
   - Regression suite: `scripts/test-repair-state.mjs`. The engine's own journal predates the
     projection era, so `pb repair-state --check` on this repo legitimately reports history-only
     rows — do not "fix" that by widening the scope.

9. **The DSH plugin's boundary: the engine owns truth, the plugin owns convenience.** It lives in
   `dsh-plugin/` (package `dsh-agent-playbook`). Two rules define it:
   - **It never re-implements a gate.** Every action is a `pb` invocation. A second opinion about
     "done" is exactly the failure the engine exists to refuse.
   - **It shells out; it does not import.** Every `pb` command reports refusal with
     `process.exit()`, so an in-process call would terminate the HOST rather than return an error.
     As a subprocess the exit code stays the contract.
   Identity is what makes fan-out attributable: `PB_AGENT_ID` / `PB_SESSION_ID` /
   `PB_PARENT_AGENT_ID` / `PB_AGENT_CHAIN` / `PB_CLAIM_TOKEN` / `PB_RUNTIME` are stamped on every
   call, so a sub-agent writes as itself and the engine can still verify entitlement.

10. **DSH plugin APIs are only what the shipped packages do — verify, never guess.** Confirmed
    against the real packages, and each one cost a debugging cycle when assumed:
    - A first-party tool needs an **`output` contract**: `output.render(args, value)` returning
      content blocks, and `output.schema` in DSH's own spec — `required: true` is a **property-level**
      flag (not a top-level `required` array), every object needs an explicit
      `additionalProperties: true|false`, and an arbitrary value must be typed (`{ type: 'json' }`).
      `defineTool` throws `JsonSchemaError` on any of these; the error names the field.
    - Context injection uses the **inbox**, not a return value:
      `agent.inbox.append('next-step', createUserMessage({ content: [{ type: 'text', text }], source: { kind, form: 'instructions' } }))`
      from `@deepseek-ai/dsh-llm`. The built-in `dsh-agent-instructions` package is the reference.
    - The plugin entry exports `{ name, inject, Config, apply }`; register tools inside `apply`.

11. **Tests that need absent dependencies must SKIP honestly, not fail.** The engine repo has no
    harness packages, so `scripts/test-dsh-plugin-index.mjs` probes for them (and `DSH_PACKAGES`)
    and exits 0 with a `SKIP` line when they are missing — a red suite the repo cannot fix trains
    people to ignore red. It links the harness packages into the fixture and then **executes the
    registered tool against a real playbook**, which is the assertion that actually catches a broken
    plugin: `core.mjs` is testable with plain node, but only running the tool proves the wiring.

12. **The plugin bundles the engine — generated, never committed.** `npm run build:plugin`
    (`scripts/pack-dsh-plugin.mjs`) copies the ENGINE (not this repo: no tests, no adapters, no
    artifacts, no memory of our own work) into `dsh-plugin/engine/`, runs the engine's own `pb init`
    on it so the bundle IS a runnable playbook, and refuses to finish if the bundle is incomplete,
    fails self-validation, carries our state, or if `files`/version/js-yaml are wrong. `engine/` is
    gitignored: a committed second copy of the engine is free to drift from the tested one.
    Consequences to respect:
    - **Which engine and which playbook are separate.** A workspace playbook always WINS; the
      bundle is a fallback to execute, never a target. Discovery must skip the plugin's own tree,
      or it will "find" the vendored copy and operate on the wrong project.
    - Discovery checks the engine's own **nested** install locations first
      (`.agents-playbook`, `.playbook`, `agent-playbook`) and only then walks ancestors. An
      upward-only walk cannot see the layout the engine's own `scaffold` recommends.
    - `action=init` is the one action that works with no playbook present: it scaffolds AND
      hydrates (scaffold alone leaves a tree that fails `validate` on files it should create).
    - The scaffolded playbook is **self-hosting** — it carries a full engine and can scaffold
      further playbooks without the plugin.
    - The plugin version equals the engine version, so the pair is identifiable;
      `pack:plugin` refuses a mismatch. `RELEASE.md` holds the two-track checklist.

13. **The plugin exposes playbook skills as harness skills, namespaced.** `skills/<id>/SKILL.md`
    becomes `playbook-<id>` in the harness catalog. The namespace is not cosmetic: a harness skill is
    invoked by slot (`/name`) and a playbook skill by path, so a bare id could shadow an unrelated
    harness skill of the same name. The catalog is read from the ENGINE
    (`pb list skills|modes --json`, added for this) rather than re-parsed, so mode-local skills are
    resolved by the same code the CLI uses; discovery is live (a new skill needs no restart) and
    bodies load on demand. A loaded body is prefixed with its routing — the skill FILE and the
    canonical `processes/<id>.yaml` — because "follow the process" is useless without knowing which
    one, and that file is what skills-first routing keys on.

14. **Every writer satisfies the ownership contract — including the autonomous runner.**
    `pb loop run --auto` claims through the same path as any agent: it mints a claim token at claim
    time and presents it on every row it writes. It previously recorded as `agent: 'auto'` with no
    proof, so its rows were stamped `ownership: unproven` — indistinguishable from an unentitled
    write, which makes the flag useless. If the runner ever cannot prove ownership it records the
    row and WARNS (`ownership_violation`) rather than writing a silent unproven row.
    Regression suite: `scripts/test-auto-attribution.mjs`.

15. **`prepack` builds the bundle, and build output goes to stderr.** `dsh-plugin/package.json`
    declares `prepack`, so publishing can never ship whatever bundle happened to be on disk. Two
    consequences:
    - **Human/build lines go to stderr.** `npm pack --json` reserves stdout for its result; a build
      log on stdout makes the pack succeed while its output will not parse (this actually happened).
    - The build is **idempotent**: if the bundle already matches `package.json`'s version it is left
      alone, so `prepack` cannot recurse or churn on every pack.
    `checkManifest` additionally refuses a plugin whose `files` lacks `engine/`, whose version
    differs from the bundled engine, which omits `js-yaml`, or which has no `prepack` hook.

16. **Verify harness integration in layers, and be explicit about which layer is missing.**
    There is no safe way to boot a live DSH session in this repo (a boot either serves the
    Web UI or runs an LLM task), so integration is proven in four layers instead, none of
    which substitutes for the next:
    1. **core** — host-independent logic with plain node.
    2. **composition** — mount the plugin on a REAL profile with `dsh --profile <p> --patch
       <file> --dump-config` and read the tree back. This is the only way to know the loader
       accepted the patch: a rejected patch is a SILENT no-op, so "the YAML looks right" is
       not evidence. `--dump-config` composes without importing, so it also cannot prove a
       module loads — pair it with a runtime assertion that the API the plugin calls exists
       (`SkillRegistry.prototype.registerProvider`, `defineTool`, `createUserMessage`).
    3. **entry** — load the real module against the real harness packages with a stub `ctx`
       and execute the tool against a real playbook.
    4. **artifact** — pack the tarball, extract it as npm would, and bootstrap a workspace
       from it. This is the layer that catches packaging mistakes a source-tree suite
       structurally cannot.
    Live behavior (does the injected context help, do results read well) stays a human step.
    Do not let a green suite imply otherwise — `RELEASE.md` states the gap.

17. **In cordis, `inject` is ALL-OR-NOTHING — a missing declared service means the plugin never
    runs.** Verified against the real package, not inferred: a plugin declaring
    `inject: ['present', 'absent']` never reaches `apply()`. `inject` has no required/optional
    form — the array form requests services, and the OBJECT form maps a name to intercept
    *config*, not to "optional". So a declared service that a deployment does not mount makes
    the plugin **silently vanish**: no tool, no error, nothing to debug.
    - Declare only what is genuinely mandatory. For this plugin that is `['tools']`.
    - Everything else is a RUNTIME dependency: `ctx.inject(['skills'], (scoped) => { … })`
      inside `apply` (the pattern the first-party `dsh-agent-default-model` uses for
      `settings`). The callback is deferred until the service appears, and the rest of the
      plugin stays active if it never does.
    - Any stub `ctx` used in tests must model this (defer until `provide()`), or the stub
      hides exactly the failure the arrangement prevents.

18. **Package resolution is a separate layer from composition, and both are checkable.**
    `dsh --dump-config` composes the profile tree WITHOUT importing, so a tree containing the
    row proves the patch shape was accepted (a rejected patch is a silent no-op) but says
    nothing about whether the named package resolves. Put the package where a profile would
    have it and ask node to resolve it from there (`test-dsh-plugin-resolution.mjs`), and
    assert the API the plugin calls exists in the shipped packages.
    Note: `dsh plugin …` requires pnpm, which is not on this machine — the documented install
    is `npm install` plus listing the package as a bundle.

19. **The pre-step hook is an OBSERVER of the step decision, and it must not stage context
    for a dead batch.** The harness's `PreStepDecision` is `{kind:'reject'}` or
    `{kind:'enter', messages}`; a listener that calls `next()` and returns that decision
    unchanged is correct middleware — returning a fresh object, or overriding a rejection,
    would silently re-open a step the harness vetoed. Concretely:
    - `if (decision.kind === 'reject') return decision;` before doing anything else.
    - `if (signal?.aborted) return decision;` — staging context for a batch that will not run
      is wasted work, and the message could surface on a later unrelated step.
    - Prefer `agent.inject(message)` over `agent.inbox.append('next-step', message)`: it is
      the purpose-built API for model-facing context and queues without waking the driver.
      Keep the inbox call as a fallback so a deployment whose Agent lacks `inject` still gets
      the context; check `typeof agent.inject === 'function'`.
    - The exported `Config` schema is NOT decorative: cordis validates and normalizes config
      through it before `apply` runs, so defaults declared there are the real defaults. Keep
      the manual fallbacks in `apply` in agreement with it, or they will diverge.

## Memory Budget

Keep this file lean. Hot, always-true operating rules stay here; cold, historical, or task-specific
detail belongs in task notes or reflection entries, not durable project memory.
