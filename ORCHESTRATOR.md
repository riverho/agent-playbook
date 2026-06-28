# Orchestrator — always-on daily monitoring with `blogwatch`

This playbook can run a **closed-loop daily monitor** for blogwatcher feeds and x.com (Twitter) accounts. The orchestrator is designed for always-on agents and cron-style invocation: it activates the `blogwatch` mode, builds a daily backlog from a config, drains it automatically, and surfaces any errors.

## Quick start

1. Configure watches in `modes/blogwatch/config/daily-watches.yaml`.
2. Run the orchestrator:
   ```bash
   node scripts/pb-daily-monitor.mjs
   ```
3. Exit code is `0` only when every watch task is recorded `done`. Any `blocked` or leftover `todo` task causes a non-zero exit and writes to the error log.

## How the loop works

```
heartbeat
  → ensure active loop + cycle brief (Q5 auto-filled)
  → pb mode set blogwatch
  → read config / plan one task per watch
  → pb loop run --auto --defer-blocked
  → read backlog state / append logs / print summary / exit
```

The orchestrator reuses the existing `pb` primitives; it does not edit skills or processes during a run.

## Config format

`modes/blogwatch/config/daily-watches.yaml`:

```yaml
watches:
  - id: my-watch
    source: x.com/@handle
    criteria: posts mentioning "agent-playbook"
    check: node ./my-fetcher.mjs --source x --handle @handle --token "$X_TOKEN"
```

- `id` — stable identifier.
- `source` — feed, handle, or URL.
- `criteria` — what to look for.
- `check` — executable command that fetches/inspects the source and exits `0` on success.

**Security:** credentials must come from environment variables inside `check`, never from this file or the playbook folder.

## Always-on logs

The orchestrator writes append-only JSON lines so other agents can read them without parsing prose.

| Log | Purpose | Review cadence |
|---|---|---|
| `artifacts/reports/orchestrator-errors.ndjson` | One line per blocked/failed watch or orchestrator error | Immediate when exit code is non-zero |
| `artifacts/reports/orchestrator-reflections.ndjson` | One line per run summarizing results and any proposed process/skill changes | Before `pb reflect` |
| `artifacts/reports/orchestrator-iterations.ndjson` | One line per proposed change to a process or skill, with status `pending\|applied\|deferred` | During process/skill improvement loops |

These logs are auto-generated. **Do not silently edit `watch-feeds` or `daily-monitor` skills/processes during an orchestrator run.** Instead, log a proposal in `orchestrator-iterations.ndjson` and apply it in a separate agent loop, then run `pb reflect` on the change.

## Error surfacing

When a watch fails:

1. The orchestrator prints the blocked watch id and title.
2. It appends a structured error entry with the task id, watch id, check command, and the tail of the auto-run output.
3. It exits non-zero so the caller (cron, CI, or an agent) knows to investigate.

## Iteration workflow

1. Read `orchestrator-errors.ndjson` to find failing watches.
2. Decide whether the fix belongs in the watch command, the `watch-feeds` process, or the `daily-monitor` orchestrator.
3. Add or update a proposal in `orchestrator-iterations.ndjson` with status `pending`.
4. Make the change, run the relevant checks, and update the proposal status to `applied`.
5. Run `pb reflect --notes "..."` to capture the lesson.

## Skill / process reference

- Skill: `modes/blogwatch/skills/daily-monitor/SKILL.md`
- Process: `modes/blogwatch/processes/daily-monitor.yaml`
- Script: `scripts/pb-daily-monitor.mjs`
- Config: `modes/blogwatch/config/daily-watches.yaml`
