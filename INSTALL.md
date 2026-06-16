# Agent-Playbook Install

This is the canonical lifecycle for applying the playbook to a repository.

## Target Location

Install the working playbook inside the repository, not in agent app data.

Recommended:

```text
repo/
  .agent-playbook/
    playbook.yaml
    SKILL.md
    scripts/pb.mjs
    skills/
    processes/
    memory/
    artifacts/reports/
```

`~/.pi`, `~/.codex`, and similar directories may hold launchers or shims, but not the repo's working
playbook state.

## Lifecycle

1. **Scaffold** from the source engine into the target repo (copy-don't-clobber):

   ```bash
   node <engine>/scripts/pb.mjs scaffold --target <repo>/.agent-playbook
   ```

2. **Bootstrap** if the target has structure but no usable skills/processes:

   ```bash
   cd <repo>/.agent-playbook
   node scripts/pb.mjs bootstrap
   ```

3. **Hydrate runtime state** (journal, backlog, reports dir — never overwrites):

   ```bash
   node scripts/pb.mjs init
   ```

4. **Verify**:

   ```bash
   node scripts/pb.mjs validate
   node scripts/pb.mjs status
   ```

5. **Seed real tasks** in `memory/backlog.yaml` — each with executable `acceptance_checks`
   (shell commands, cwd = playbook root, exit 0 = pass). This is the step that makes the
   loop honest; don't skip it:

   ```yaml
   - id: T1
     title: Typecheck stays green
     status: todo
     skill: run-task
     priority: 1
     acceptance_checks:
       - npm --prefix .. run typecheck
   ```

6. **Operate**:

   ```bash
   node scripts/pb.mjs next --claim          # prints the task's checks
   # act via the named skill/process
   node scripts/pb.mjs validate --task <id>  # run the checks on demand
   node scripts/pb.mjs record --task <id> --action <action> --status done --notes "..."
   #   ^ re-runs the checks; refuses done if any fail
   node scripts/pb.mjs report
   ```

## Harden (recommended)

Wire the anchor into the runtime so the playbook survives long context, compaction, and handoff.
Claude Code (`.claude/settings.json` hooks):

| Hook | Command |
| --- | --- |
| `SessionStart` | `node .agent-playbook/scripts/pb.mjs anchor` |
| `UserPromptSubmit` | `node .agent-playbook/scripts/pb.mjs anchor --brief` |
| `PreCompact` | `node .agent-playbook/scripts/pb.mjs checkpoint --snapshot` |

Other runtimes: wrap each turn (or a periodic tick) with `pb anchor --brief`; on resume run
`pb checkpoint`. See `skills/harden/SKILL.md`.

## Bridging an existing repo

If the target already has `processes/index.*`, `skills/index.*`, or a durable memory file,
**bridge — don't replace**:

- `scaffold` already skips them and reports what it skipped.
- Edit the target `playbook.yaml` `index`/`paths` to point at the existing files (the CLI reads
  both YAML and JSON).
- Point `index.memory.project_memory` at wherever durable memory already lives.
- Register a generic `run-task` process + skill in the existing indexes if missing.

Full judgment steps in `processes/install.yaml` / `skills/install/SKILL.md`.

## Wire config

- Add `js-yaml` to the target `package.json` and namespaced `pb` scripts
  (e.g. `pb:status`, `pb:validate`), then `npm install`.
- Append a generated-reports ignore to `.gitignore` (keep `.gitkeep`).

## Root Agent Pointer

Add a short pointer in the target repo's root `AGENTS.md` / `CLAUDE.md`:

```md
Before work, read `.agent-playbook/playbook.yaml`, then `.agent-playbook/SKILL.md`, then run:

node .agent-playbook/scripts/pb.mjs status
```

The canonical source of truth after install is `.agent-playbook/playbook.yaml`.

## Hardening note (Claude Code)

Agents cannot self-install the hooks: Claude Code's auto-mode **classifier** blocks writes to
`.claude/settings.json`. Hand the hook JSON to the human to paste in; do not attempt the write.
