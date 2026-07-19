---
name: daily-research-run
description: Run a project-owned attention-research daily scaffold for a specific window.
---

# daily-research-run

Use this skill when `attention-research` mode is active and the task came from a project scaffold under `/Users/river/.openclaw/workspace/projects/<project-id>/scaffolds/`.

Canonical process:
- `modes/attention-research/processes/daily-research-run.yaml`

## Rules

1. Project scaffold is source of truth for concrete paths and delivery target.
2. Use `attention-research-morning-run` for `window: morning` and `attention-research-afternoon-run` for `window: afternoon`.
3. Do not inline project paths into reusable mode files.
4. Record generated scaffold traces under the owning project.
5. On Tavily or Telegram failure, update each affected topic `META.json` per the window skill.

## Acceptance

- `node scripts/check-attention-research-mode.mjs` exits 0.
- `node scripts/test-attention-research-mode.mjs` exits 0.
- `node scripts/pb-daily-monitor.mjs --mode attention-research --project attention-research --window morning --dry-run` exits 0.
