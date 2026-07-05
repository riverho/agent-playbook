---
name: daily-wiki-refresh
description: Run the complete daily blogwatcher -> LLM Wiki refresh and verify it with executable checks.
---

# daily-wiki-refresh

Use this skill when the active mode is `wiki-news` and a daily refresh task has been scaffolded by the orchestrator.

Canonical process:
- `modes/wiki-news/processes/daily-wiki-refresh.yaml`

## Principle

The daily job is not "make a digest". It is a verified maintenance loop:

```text
acquire -> ingest -> DB-delta backfill -> rebuild synthesis -> verify -> record
```

## How to apply

1. **Orient** — run `pb status` and confirm `wiki-news` mode is active.
2. **Run the wrapper** — execute the task's acceptance check, usually `node scripts/wiki-news-daily.mjs --wiki ... --db ... --since today --limit ...`.
3. **Inspect the report** — open the generated report under `artifacts/reports/wiki-news/`.
4. **Record only green** — record done only when the wrapper exits 0 and the RSS architecture check passed.
5. **Block on verification failures** — source-level 301/429/404 warnings are acceptable only if DB-delta backfill and final verification pass.

## Acceptance

- `node scripts/check-wiki-news-mode.mjs` exits 0.
- `node scripts/test-wiki-news-mode.mjs` exits 0.
- The daily wrapper exits 0 for a live run, or prints a complete plan for `--dry-run`.
