# Agent-Playbook Install

This is the canonical lifecycle for applying the playbook to a repository.

## Local install / uninstall (the `pb` bootstrapper)

Install the engine globally so the `pb` command is on your PATH. A global `pb`
operates on its **own** package files (`ROOT = scripts/..`), so its job is to
*bootstrap* a working playbook into a repo — not to run the loop. Run the loop
from the per-repo `.agents-playbook/scripts/pb.mjs` that `scaffold` drops in.

**PowerShell (Windows — no Git Bash required):**

```powershell
.\local-install.ps1          # install deps + link `pb`
.\local-install.ps1 -pack    # also run a tarball smoke test
.\local-uninstall.ps1        # tear down
```

**sh / Git Bash / Mac / Linux:**

```bash
./local-install.sh           # install deps + link `pb`
./local-install.sh --pack    # also run a tarball smoke test
./local-uninstall.sh         # tear down
```

Or manually:

```bash
npm install            # one dep: js-yaml
npm link               # puts `pb` on PATH

cd <repo>
pb scaffold --target ./.agents-playbook
cd .agents-playbook && npm install && node scripts/pb.mjs validate

npm rm -g agents-playbook    # uninstall
```

`npm link` is reversible and leaves no files in your repos — it only adds the
`pb` shim to the global npm bin. `npm rm -g agents-playbook` removes it.

## Target Location

Install the working playbook inside the repository, not in agent app data.

Recommended:

```text
repo/
  .agents-playbook/
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
   node <engine>/scripts/pb.mjs scaffold --target <repo>/.agents-playbook
   ```

2. **Bootstrap** if the target has structure but no usable skills/processes:

   ```bash
   cd <repo>/.agents-playbook
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

5. **For design-led projects, establish conformance before broad codebase analysis.**

   Start with approved `DESIGN.md` plus one approved visual source. Select the matching coding-pack
   skill:

   - Pencil MCP source → `$pencil-design-layout-conformance`
   - Canonical HTML source → `$html-design-layout-conformance`

   Invoke the skill before asking the agent to scan the repository for implementation patterns.
   The first pass freezes source provenance, required states/viewports, semantic regions, geometry,
   and tolerances in `<repo>/design-contract.yaml`. It must not infer design rules from the codebase.

   For HTML, copy the bundled schema before filling it:

   ```bash
   cp .agents-playbook/modes/coding/skills/html-design-layout-conformance/assets/design-contract.template.yaml design-contract.yaml
   ```

   Then perform a **contract-guided** codebase analysis limited to:

   - canonical production components and public APIs;
   - deprecated/legacy paths that must not be used;
   - design tokens and compilable reference examples;
   - the compiler, browser, screenshot, and interaction-test harness.

   Map each contract region to a production component, build one golden screen, and prove the
   verification command catches a deliberate layout shift. Production screen implementation starts
   only after `LAYOUT CONTRACT READY` or `HTML LAYOUT CONTRACT READY` is evidence-backed.

6. **Seed real tasks** in `memory/backlog.yaml` — each with executable `acceptance_checks`
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

7. **Operate**:

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
| `SessionStart` | `node .agents-playbook/scripts/pb.mjs anchor` |
| `UserPromptSubmit` | `node .agents-playbook/scripts/pb.mjs anchor --brief` |
| `PreCompact` | `node .agents-playbook/scripts/pb.mjs checkpoint --snapshot` |

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
Before work, read `.agents-playbook/playbook.yaml`, then `.agents-playbook/SKILL.md`, then run:

node .agents-playbook/scripts/pb.mjs status
```

The canonical source of truth after install is `.agents-playbook/playbook.yaml`.

## Hardening note (Claude Code)

Agents cannot self-install the hooks: Claude Code's auto-mode **classifier** blocks writes to
`.claude/settings.json`. Hand the hook JSON to the human to paste in; do not attempt the write.
