# Changelog

Both tracks are versioned together: the plugin bundles the engine, so a shared version
makes the pair identifiable. `npm run check:version` guards the engine's own
`package.json` ↔ `playbook.yaml` agreement, and `npm run pack:plugin` refuses to build a
tarball whose plugin version differs from the engine it carries.

## 0.5.0 — multi-agent leases, complete worktrees, crash recovery, DSH plugin

Minor, not patch: the release adds a multi-agent coordination model and a harness
integration. Existing single-agent playbooks keep working unchanged — `pb next --claim`,
`pb record`, and `acceptance_checks` behave as before.

> **Numbering note.** 0.4.0 was already used upstream for the tracked-state trap guard
> (`87153a1`/`16ed043`), which is unrelated to this work. This release carries that guard
> forward and takes the next minor.

### Inherited and fixed: the tracked-state trap guard

The guard (runtime state committed to git gets reverted by merges, silently erasing
records) shipped with two defects that made it inert or fatal, both fixed here:

- `execSync('git rev-parse --show-toplevel 2>/dev/null')` — the redirection is POSIX shell
  syntax, so under `cmd.exe` the command always failed and the guard returned early. It
  **never fired on Windows**, which is where it was needed. Now `execFileSync` with stdio
  options: no shell, no redirect, portable.
- `require('child_process')` inside an ESM module, where `require` is undefined — past the
  first defect it would have thrown a `ReferenceError` out of `pb validate`. The top-level
  import was already there.
- The path comparison now normalises separators: git reports the toplevel with forward
  slashes while `resolve` yields backslashes on Windows, so a raw comparison concluded
  "outside the repo" and disabled the guard.

Verified against this repository: `pb validate` now warns, `pb validate --strict` exits 1,
and the "rows newer than the last commit" branch is correctly silent (the journal's newest
row predates its last commit).

### Multi-agent safety (`scripts/pb.mjs`, `scripts/test-concurrency-state.mjs`)

- **One serialized transaction for all shared state.** Every write to
  `backlog-state.json` takes an O_EXCL lock, re-reads inside the critical section, and
  replaces the file atomically. The previous read-modify-write of the whole object
  silently discarded concurrent writers' changes — proved by mutation: disabling the lock
  turns the regression suite red with real lost updates.
- **Ordering is a recorded fact.** Each journal row carries a monotonic `seq` and the
  writer; the journal row and the state touch commit in one transaction, so the two
  records can never disagree about who wrote last.
- **A claim is a lease.** `pb next --claim` mints a claim token. A writer proves
  entitlement three ways — it is the holder, it presents the token, or the holder appears
  in its declared delegation chain (`PB_AGENT_CHAIN`). A sub-agent records as **itself**,
  with `ownership: token|chain` on the row.
- **Unproven writes are flagged, not dropped** (`ownership: unproven`): losing real work
  is worse than an unproven row.
- `pb release` returns a claim to the pool (`--stale <minutes>` sweeps abandoned ones).
- **Locks break on age only, never on a liveness probe.** A pid probe misreported live
  holders as dead on Windows, letting a waiter steal an active lock — the exact
  corruption the layer exists to prevent. Release is token-guarded; per-lock stale
  windows; `pb unlock [--force]` is the explicit escape hatch.

### Worktrees (`pb worker …`, `scripts/test-worker-worktree.mjs`)

- Atomic slot acquisition: **one live slot per task**, so two agents cannot both open a
  worker for the same task and leave an orphan worktree.
- `worker status` (ahead/behind/uncommitted/head), `worker exec -- <cmd>`,
  `worker verify` (runs the task's checks **inside** the worktree), and `worker merge`
  behind the merge gate.
- The merge gate reads the **branch**, not just the journal: a worktree that is missing,
  dirty, or has zero commits ahead of its base cannot be merged; a stale verification is
  reported rather than trusted.
- `pb record --status done --at <worktree>` records checks that ran in the worker tree,
  closing the ordering hole where a worker-only artifact could not be recorded honestly.

### Crash recovery (`pb repair-state`, `scripts/test-repair-state.mjs`)

- The journal is the record; `backlog-state.json` is a projection. `--check` exits 1 on
  drift (CI-wireable), `--apply` rebuilds, `--strict` drops what the journal cannot
  justify. Scoped to the current backlog, and projection-only fields (worker/checker/
  provider) are **preserved** — deleting them would be data loss dressed up as a repair.
- `pb checkpoint` reports drift and a journal-ahead-of-projection gap as warnings.

### Engine as a library (`scripts/test-engine-api.mjs`)

- Importing `scripts/pb.mjs` no longer runs a command; it exports a **read-only** API
  (`status`, `tasks`, `task`, `journal`, `validate`, `workerStatus`, `mergeReady`,
  `claimOwnership`) plus resolved paths. Mutations stay on the CLI on purpose: every
  command reports refusal with `process.exit()`, which would kill an in-process host.

### DeepSeek Harness plugin (`dsh-plugin/`, `dsh-agent-playbook`)

- One `playbook` tool — `status / anchor / next / claim / task / check / record / worker /
  init / unlock / repair` — plus context injection that stages the North Star, active
  loop, task in hand and **its acceptance checks** on the agent inbox each step, so
  compaction cannot lose the plot. Injection prefers `agent.inject()` (the API built for
  model-facing context, which queues without waking the driver) and falls back to
  `inbox.append('next-step', …)` when that member is absent. The pre-step hook is an
  observer: a rejected step stays rejected, and an aborted step stages nothing.
- Registers the playbook's own skills as harness skills, namespaced `playbook-<id>` so
  they cannot shadow an unrelated harness skill. The catalog comes from the ENGINE's own
  resolution (`pb list skills --json`), so mode-local skills are included without
  re-implementing anything; bodies load on demand and are prefixed with the process file
  the engine's skills-first routing keys on.
- `pb list skills|modes --json` added to the engine so a host consumes the resolved
  catalogs as data instead of parsing a human table.
- Stamps `PB_AGENT_ID` / `PB_SESSION_ID` / `PB_PARENT_AGENT_ID` / `PB_AGENT_CHAIN` /
  `PB_CLAIM_TOKEN` / `PB_RUNTIME` on every engine call, which is what makes fan-out
  attributable.
- **Bundles the engine**, so installation is one step and cannot drift from the engine it
  was tested against. `action=init` scaffolds and hydrates a workspace playbook from it;
  the workspace copy then takes over (self-hosting). A workspace playbook always wins over
  the bundle, and the bundle is never a target.
- Shells out rather than importing, so the engine's exit codes remain the contract and a
  refusal can never terminate the host.
- The skill registry is a **runtime** dependency (`ctx.inject`), not a declared one: cordis
  refuses to activate a plugin at all while any declared `inject` entry is missing, so
  declaring `skills` would have made the whole plugin — tool included — vanish silently in a
  profile that ships tools without skills.

### Fixed

- `test-pack-build` / `test-pack-roundtrip` asserted on LF-only output and on a
  comment-sensitive line regex; both failed on Windows/after comment changes and were
  passing for the wrong reasons.
- `git worktree add` and `git merge` wrote human chatter to stdout, corrupting `--json`
  payloads — surfaced as the consumer's parse error, not the writer's bug.

### Verified before publishing

- `test-dsh-plugin-resolution.mjs`: package **resolution** from a profile-shaped directory —
  the plugin, its entry, its `core` subpath and every declared peer resolve; the plugin module
  imports; and the engine copy it scaffolds finds `js-yaml` by walking up the project, which is
  what makes a scaffolded playbook runnable.
- `test-dsh-plugin-profile.mjs`: the plugin is mounted on top of a **real profile** through the
  `--patch` overlay and the composed tree read back — proving the loader accepts the patch
  shape (a rejected patch is a silent no-op), that the composed config matches the plugin's
  declared defaults, and that every API the plugin calls (`SkillRegistry.registerProvider`,
  `defineTool`, `createUserMessage`) exists in the shipped harness packages.
- `test-dsh-plugin-published.mjs`: the real tarball is packed, extracted as npm would
  install it, and used to scaffold + hydrate a workspace playbook that validates and
  orients. This catches packaging mistakes a source-tree suite structurally cannot —
  a path that only resolves because we are in the repo root, a file excluded by `files`,
  a build step that did not run.
- `test-dsh-plugin-index.mjs`: the module loads against the **real** harness packages and
  its tool is executed against a real playbook, with the skill provider driven through a
  stub `ctx` (list → pick → load).
- `test-auto-attribution.mjs`: the autonomous runner's rows are proven, not merely
  attributed — and an unentitled write is still flagged, so the flag keeps its meaning.
