---
name: daily-monitor
description: Run the blogwatch daily monitoring orchestrator that plans watch tasks, drains the backlog, and logs reflections.
---

# daily-monitor

Use this skill when you need to run the closed-loop daily monitoring orchestrator for blogwatcher + x.com feeds.

Canonical process:
- `modes/blogwatch/processes/daily-monitor.yaml`

## When to use

- A user asks to "run the daily monitor", "start the blogwatch loop", or "check feeds today".
- You need to generate a daily backlog of watch tasks and drain it automatically.

## How to apply

1. **Configure watches** — edit `modes/blogwatch/config/daily-watches.yaml` (or pass `--config <path>`). Each watch needs:
   - `id` — stable identifier for the watch.
   - `source` — the feed, handle, or URL to monitor.
   - `criteria` — what to look for.
   - `check` — an executable command that fetches/inspects the source and exits 0 on success.
2. **Run the orchestrator**:
   ```bash
   node scripts/pb-daily-monitor.mjs
   ```
3. **Observe the loop** — the script:
   - prints a heartbeat timestamp,
   - activates `blogwatch` mode,
   - plans one task per watch,
   - drains the backlog with `pb loop run --auto --defer-blocked`,
   - appends errors/reflections/iteration proposals to `artifacts/reports/orchestrator-*.ndjson`,
   - exits 0 if all watches pass, non-zero if any are blocked or left todo.
4. **Review logs** — inspect `artifacts/reports/orchestrator-errors.ndjson`, `orchestrator-reflections.ndjson`, and `orchestrator-iterations.ndjson`.
5. **Act on iterations** — if a watch repeatedly fails, propose a process/skill change and log it in `orchestrator-iterations.ndjson` with status `pending`. Do **not** silently edit `watch-feeds` during an auto-run; reflect and apply changes in a separate agent loop.

## Rules

- Never store credentials or API tokens in the playbook folder; pass them via environment variables in `check` commands.
- Do not mutate skills or processes during an orchestrator run; only log iteration proposals.
- Keep the orchestrator carry-on: pure Node stdlib + `pb` primitives, no new dependencies.

## Acceptance

- `node scripts/test-daily-monitor.mjs` exits 0.
- `node scripts/pb.mjs validate` exits 0.
