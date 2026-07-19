---
name: watch-feeds
description: Monitor configured blogwatch and x.com sources, capture evidence, and record structured alerts through the playbook.
---

# watch-feeds

Use this skill when the active loop is in `blogwatch` mode and you need to monitor blogwatcher feeds and/or x.com (Twitter) accounts for relevant signals.

Canonical process:
- `modes/blogwatch/processes/watch-feeds.yaml`

## When to use

- A user asks "watch x.com/@account for mentions of X".
- A user asks "check the blogwatcher feed for new posts about Y".
- A user asks "alert me when Z appears in the monitored sources".

## The principle

> The playbook is the record of truth. Monitoring produces **structured alerts**, not prose summaries. Every alert is recorded via `pb record` with evidence attached.

## How to apply

1. **Orient** — run `pb status` and confirm you are in `blogwatch` mode. Read the watch criteria from the current task notes or the user's request.
2. **Identify sources** — list the exact blogwatcher feeds and/or x.com accounts/handles to monitor.
3. **Fetch or observe** — use the user's provided tools or browser to gather the latest items. Do not install new dependencies or store credentials inside the playbook.
4. **Filter for signal** — keep only items that match the criteria. For each match, capture:
   - source URL
   - timestamp
   - author/handle or feed name
   - verbatim excerpt or title
5. **Classify** — label each match as `info`, `lead`, or `anomaly`.
6. **Record** — use `pb record --task <id> --action watch --status done --notes "<structured notes>"` to log findings. If follow-up is needed, add a new backlog task via `pb plan`.
7. **Escalate** — surface `anomaly`-class findings to the user immediately with evidence.

## Rules

1. Never store credentials or API tokens in the playbook folder.
2. Never fabricate URLs, timestamps, or excerpts.
3. Prefer the smallest fetch that satisfies the watch criteria.
4. If a source cannot be reached, record `blocked` with the reason.

## Acceptance

The skill is present and usable when:

- `node scripts/check-blogwatch-mode.mjs` exits 0.
- `node scripts/test-blogwatch-pack.mjs` exits 0 (the `watch-feeds` skill resolves only under `blogwatch`).
