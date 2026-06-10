# Install (apply the playbook to a repo)

Use this skill when applying / installing the Agent-Playbook into a target repository — i.e. when summoned by `/agent-playbook` or asked to "set up the playbook here."

Canonical process:
- `processes/install.yaml`

## When to use
- A repo has no agent layer yet (greenfield), OR
- A repo already has its own processes/skills/memory and needs the loop layered on top (bridge).

## Core rules
- **Copy-don't-clobber.** Never overwrite a repo's existing files. `pb scaffold` already
  refuses to, and reports what it skipped — bridge those by hand.
- **Bridge, don't replace.** If the target already has `processes/index.*` or `skills/index.*`,
  point the new `playbook.yaml` `index` at them (JSON or YAML — the CLI reads both). Point
  `index.memory.project_memory` at wherever durable memory already lives (e.g. a root file).
- **Match the repo's conventions** — namespaced npm scripts, the repo's gitignore philosophy.
- **Verify or it didn't happen.** End with a green `pb validate` in the target.

## Steps
1. **Scaffold:** `node <engine>/scripts/pb.mjs scaffold --target "<target>"`. Read the report.
2. **Bridge** (if it skipped processes/skills/memory): edit the target `playbook.yaml` `index`/`paths`
   to point at the existing files; register a generic `run-task` if missing.
3. **Wire:** add `js-yaml` + namespaced `pb` scripts to `package.json` → `npm install`; append a
   reports ignore to `.gitignore`; add a "Playbook Loop Layer" pointer to `CLAUDE.md`/`AGENTS.md`.
4. **Bootstrap:** if the target has no usable `processes/` or `skills/`, run `node scripts/pb.mjs bootstrap`.
5. **Hydrate:** `node scripts/pb.mjs init`; seed `memory/backlog.yaml` with a few safe starter tasks.
6. **Verify:** `node scripts/pb.mjs validate` (must pass). Optionally run one loop, then reset to pristine.

## Reference
The GEO-website repo was installed this way: YAML master bridging to JSON indexes + a root
`PROJECT-MEMORY.md`, with a `run-task` process/skill added to the existing JSON indexes.
