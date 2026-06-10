# Harden (survive context loss)

Use this skill when an agent loses the playbook over a long session — drifts off the loop, forgets the rules, stops recording, or a fresh/resumed session never re-reads the master. Applies to any runtime (Claude Code, OpenClaw, Hermes, …); the failure is shared: **attention decays as context grows, compacts, or hands off.**

Canonical process:
- `processes/harden.yaml`

## The principle
You cannot win by keeping everything in context. Survive by:
1. **State on disk** — backlog, journal, memory. Context loss ≠ work loss. Rehydrate with `pb status`.
2. **Cheap re-anchor** — `pb anchor` prints the constitution; `pb checkpoint` adds drift detection.
3. **Auto re-inject** — wire the runtime to re-feed the anchor so the agent never has to remember.

## Commands
- `node scripts/pb.mjs anchor` — full constitution (invariants + loop + rehydrate command).
- `node scripts/pb.mjs anchor --brief` — a few lines, safe to inject **every turn**.
- `node scripts/pb.mjs checkpoint` — heartbeat: re-anchor + detect drift (claimed-but-not-recorded, >1 in_progress, failing guardrails) and print the corrective next command.
- `node scripts/pb.mjs checkpoint --snapshot` — also writes `memory/RESUME.md`, a single "where you are" breadcrumb for after compaction.

## Auto-injection by runtime
- **Claude Code** — `.claude/settings.json` hooks (project-level, so each repo anchors to its own playbook):
  - `SessionStart` → `node scripts/pb.mjs anchor`
  - `UserPromptSubmit` → `node scripts/pb.mjs anchor --brief`
  - `PreCompact` → `node scripts/pb.mjs checkpoint --snapshot`
- **Other runtimes (OpenClaw / Hermes / …)** — wrap each turn (or a periodic tick) with `pb anchor --brief`; on resume run `pb checkpoint`. Any runtime that can run a shell command before a turn can host the anchor.

## Rules
- Keep the injected anchor **tiny** (`--brief`) — negligible tokens, maximum recency.
- The anchor is generated from `playbook.yaml`, so it never drifts from the master.
- `anchor`/`checkpoint` must never crash a session — they tolerate a malformed master.
