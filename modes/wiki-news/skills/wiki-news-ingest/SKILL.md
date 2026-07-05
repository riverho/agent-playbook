---
name: wiki-news-ingest
description: Run or debug the acquisition and ingest half of the daily LLM Wiki news refresh.
---

# wiki-news-ingest

Use this skill when you need to run, inspect, or debug blogwatcher/RSS acquisition for `/Users/river/wiki`.

Canonical process:
- `modes/wiki-news/processes/wiki-news-ingest.yaml`

## Rules

1. `blogwatcher-cli` is the acquisition queue of record.
2. Direct feed/article fetch failures are logged, not hidden.
3. DB-delta backfill is mandatory when direct fetches hit redirects/rate limits.
4. Raw files must contain evidence or explicit extraction failure metadata, never placeholder prose.
5. Do not mutate blogwatcher read/unread state unless River explicitly asks.

## Standard commands

```bash
BLOGWATCHER_DB=/Users/river/.blogwatcher-cli/blogwatcher-cli.db blogwatcher-cli scan
/Users/river/.hermes/venvs/wiki-rss/bin/python /Users/river/wiki/scripts/rss_deep_ingest.py
/Users/river/.hermes/venvs/wiki-rss/bin/python /Users/river/wiki/scripts/blogwatcher_delta_ingest.py --since <YYYY-MM-DD> --limit <n>
```
