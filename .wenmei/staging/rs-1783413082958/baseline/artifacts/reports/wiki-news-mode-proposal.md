# Proposal — `wiki-news` Agent-Playbook Mode

Purpose: make the blogwatcher → LLM Wiki news ingest repeatable as a daily orchestrator mode, not an ad-hoc Hermes session procedure.

This proposal follows `ORCHESTRATOR.md`: mode catalog is data, the mode owns its scaffold descriptor, every scaffolded task has an executable acceptance check, and capability gaps become separate triage/proposal work — never inline edits during a monitor run.

## Mode Summary

Mode id: `wiki-news`

Description:
Daily LLM Wiki news maintenance mode. It uses `blogwatcher-cli` as acquisition state, ingests reachable RSS/article content, backfills from the blogwatcher SQLite queue when feeds are redirected/rate-limited, rebuilds wiki indexes/entities/topics, and verifies the RSS wiki architecture.

What it automates:

```text
blogwatcher-cli scan
  -> full RSS/article ingest when direct feeds are reachable
  -> blogwatcher DB delta backfill for 301/429/404 gaps
  -> rebuild article/entity/topic/digest/root indexes
  -> run RSS wiki architecture check
  -> emit a daily artifact report
```

## Proposed File Layout

```text
modes/wiki-news.yaml
modes/wiki-news/config/daily-wiki-runs.yaml
modes/wiki-news/skills/index.yaml
modes/wiki-news/skills/daily-wiki-refresh/SKILL.md
modes/wiki-news/skills/wiki-news-ingest/SKILL.md
modes/wiki-news/skills/wiki-news-verify/SKILL.md
modes/wiki-news/processes/index.yaml
modes/wiki-news/processes/daily-wiki-refresh.yaml
modes/wiki-news/processes/wiki-news-ingest.yaml
modes/wiki-news/processes/wiki-news-verify.yaml
scripts/wiki-news-daily.mjs
scripts/check-wiki-news-mode.mjs
scripts/test-wiki-news-mode.mjs
```

Also register:

```yaml
# playbook.yaml
modes:
  wiki-news: modes/wiki-news.yaml
```

```yaml
# modes/index.yaml
- id: wiki-news
  description: Daily LLM Wiki news ingestion from blogwatcher + RSS sources.
  abstract: >-
    Pack-local daily-wiki-refresh + wiki-news-ingest + wiki-news-verify skills/processes ∪ engine ops;
    scans blogwatcher, ingests/rebuilds the wiki, backfills DB deltas, and verifies the RSS wiki architecture.
```

## Mode YAML Sketch

```yaml
id: wiki-news
description: >-
  Daily LLM Wiki news ingestion mode: blogwatcher acquisition, RSS/article extraction,
  DB-delta backfill, wiki synthesis/index rebuild, and architecture verification.

directive: |
  You are operating in wiki-news mode. Your job is to keep /Users/river/wiki current as a
  compounding LLM Wiki, not a feed dump.

  - blogwatcher-cli is acquisition state, not synthesis.
  - The wiki owns raw archives, normalized article pages, entity ledgers, concept pages, timelines, and indexes.
  - Always preserve source_name, feed_url, source_url, published, ingested, sha256, and blogwatcher_id when available.
  - Use DB-delta backfill whenever direct feed/article fetches hit redirects/rate limits.
  - Verify with the RSS architecture check before recording done.
  - Never store credentials in the mode pack.

skills_index: modes/wiki-news/skills/index.yaml
processes_index: modes/wiki-news/processes/index.yaml

scaffold:
  config: modes/wiki-news/config/daily-wiki-runs.yaml
  items: runs
  skill: daily-wiki-refresh
  id_field: id
  goal_template: "Refresh ${wiki_path} from ${blogwatcher_db} for ${window}"
  check_field: check

principles:
  - id: acquisition_not_synthesis
    kind: advice
    text: blogwatcher-cli discovers and remembers URLs; the wiki performs synthesis.
  - id: db_delta_required
    kind: advice
    text: Backfill from the blogwatcher SQLite queue when direct fetches fail with 301/429/404.
  - id: architecture_check_green
    kind: check
    text: RSS wiki architecture must validate after every daily refresh.
    check: node scripts/check-wiki-news-mode.mjs && python ~/.hermes/skills/research/llm-wiki/scripts/check-rss-wiki-architecture.py /Users/river/wiki
```

## Config Sketch

```yaml
# modes/wiki-news/config/daily-wiki-runs.yaml
runs:
  - id: wiki-news-daily
    wiki_path: /Users/river/wiki
    blogwatcher_db: /Users/river/.blogwatcher-cli/blogwatcher-cli.db
    window: today
    since: "$(date +%F)"
    criteria: >-
      scan blogwatcher, ingest reachable feeds, backfill recent DB queue rows,
      rebuild wiki indexes, and pass architecture validation
    check: >-
      node scripts/wiki-news-daily.mjs
      --wiki /Users/river/wiki
      --db /Users/river/.blogwatcher-cli/blogwatcher-cli.db
      --since today
      --limit 120
```

Note: if the current orchestrator does not expand shell expressions inside config fields, `scripts/wiki-news-daily.mjs` should interpret `--since today` itself.

## Skillset Proposal

### 1. `daily-wiki-refresh`

Role: the daily orchestrator-facing skill. This is the scaffold skill referenced by `modes/wiki-news.yaml`.

Use when:
- cron or a user asks to run the daily wiki news refresh
- the mode heartbeat scaffolds the daily refresh item

Process:
- `modes/wiki-news/processes/daily-wiki-refresh.yaml`

Responsibilities:
1. Re-anchor: `pb status`, confirm mode `wiki-news`.
2. Run the wrapper: `scripts/wiki-news-daily.mjs --wiki ... --db ... --since today --limit 120`.
3. Inspect the generated daily artifact report.
4. Record done only if wrapper exits 0 and architecture check passes.
5. If wrapper exits non-zero, read the structured error report and record/leave blocked.

### 2. `wiki-news-ingest`

Role: lower-level ingest procedure used by the wrapper and humans.

Use when:
- direct feed ingest or DB-delta ingest needs to be run/debugged manually
- a single source is failing and needs isolated inspection

Process:
- `modes/wiki-news/processes/wiki-news-ingest.yaml`

Responsibilities:
1. Run `blogwatcher-cli scan` with stable `BLOGWATCHER_DB`.
2. Run `/Users/river/wiki/scripts/rss_deep_ingest.py`.
3. Run `/Users/river/wiki/scripts/blogwatcher_delta_ingest.py --since <date> --limit <n>`.
4. Preserve every direct fetch failure in the run report.
5. Never edit raw archives except replacing known-bad placeholder artifacts.

### 3. `wiki-news-verify`

Role: validation and quality gate.

Use when:
- after daily refresh
- after adding sources/scripts/entity extraction logic
- before recording done

Process:
- `modes/wiki-news/processes/wiki-news-verify.yaml`

Responsibilities:
1. Run RSS architecture check.
2. Validate YAML frontmatter across `/Users/river/wiki`.
3. Verify counts are non-regressive unless documented:
   - article pages
   - raw article pages
   - entity pages
   - concept pages
   - `_meta` indexes
4. Check root `index.md` points to `_meta/source-index.md`, `_meta/article-index-*`, `_meta/entity-index.md`, `_meta/topic-index.md`, `_meta/daily-digest-*`, and `_meta/x-profile-index.md`.
5. Append `wiki/log.md` with counts and errors.

## Process Proposal

### `daily-wiki-refresh.yaml`

```yaml
name: daily-wiki-refresh
version: 1.0.0
purpose: >-
  Run the complete daily blogwatcher -> LLM Wiki refresh and verify it with executable checks.

required_inputs:
  - wiki_path
  - blogwatcher_db
  - since/window
  - limit

canonical_steps:
  - step: 1
    name: Orient
    requirements:
      - Run `pb status`.
      - Confirm the task belongs to `wiki-news` mode.
      - Read `modes/wiki-news/config/daily-wiki-runs.yaml` for runtime args.
  - step: 2
    name: Acquire
    requirements:
      - Run `blogwatcher-cli scan` with the configured DB.
      - Capture success/failure/new-article counts.
  - step: 3
    name: Ingest
    requirements:
      - Run `rss_deep_ingest.py` for reachable feeds.
      - Run `blogwatcher_delta_ingest.py` against the SQLite queue for recent rows.
      - Treat feed 301/429/404 as expected acquisition gaps, not completion blockers, if DB backfill succeeds.
  - step: 4
    name: Rebuild synthesis
    requirements:
      - Run `rebuild_news_indexes.py`.
      - Ensure entity/topic ledgers reflect all normalized article pages.
  - step: 5
    name: Verify
    requirements:
      - Run `check-rss-wiki-architecture.py /Users/river/wiki`.
      - Run frontmatter validation.
      - Write artifact report under `artifacts/reports/wiki-news/YYYY-MM-DD.md`.
  - step: 6
    name: Record
    requirements:
      - `pb record --status done` only when all checks exit 0.
      - On non-zero, leave task blocked and include the artifact report path.

acceptance_checks:
  - node scripts/wiki-news-daily.mjs --wiki /Users/river/wiki --db /Users/river/.blogwatcher-cli/blogwatcher-cli.db --since today --limit 120
  - node scripts/check-wiki-news-mode.mjs
  - node scripts/pb.mjs validate
```

### `wiki-news-ingest.yaml`

```yaml
name: wiki-news-ingest
version: 1.0.0
purpose: >-
  Run or debug the acquisition and ingest half of wiki-news daily refresh.

canonical_steps:
  - step: 1
    name: Scan blogwatcher
    requirements:
      - `BLOGWATCHER_DB=<db> blogwatcher-cli scan`
      - Save scan counts to the run report.
  - step: 2
    name: Full feed ingest
    requirements:
      - Run `rss_deep_ingest.py`.
      - Capture source failures.
  - step: 3
    name: DB delta backfill
    requirements:
      - Run `blogwatcher_delta_ingest.py --since <date> --limit <n>`.
      - Record number of rows considered and new article pages.
  - step: 4
    name: Failure triage
    requirements:
      - For repeated source failures, create a triage proposal; do not patch mode machinery inline.
```

### `wiki-news-verify.yaml`

```yaml
name: wiki-news-verify
version: 1.0.0
purpose: >-
  Verify the LLM Wiki remains a synthesized RSS/news wiki after daily refresh.

canonical_steps:
  - step: 1
    name: Architecture check
    requirements:
      - Run `check-rss-wiki-architecture.py`.
      - Exit non-zero on errors.
  - step: 2
    name: Frontmatter check
    requirements:
      - Parse every markdown frontmatter block with PyYAML.
  - step: 3
    name: Count check
    requirements:
      - Count article/raw/entity/concept/meta pages.
      - Compare against previous daily report if present.
  - step: 4
    name: Navigation check
    requirements:
      - Ensure root index and RSS monitoring page point to the wide maps.
```

## Wrapper Script Contract

`scripts/wiki-news-daily.mjs` should be the single executable acceptance check for daily mode tasks.

Required behavior:

```text
inputs:
  --wiki <path>
  --db <path>
  --since today|YYYY-MM-DD
  --limit <n>

steps:
  1. resolve since=today to local date
  2. run BLOGWATCHER_DB=<db> blogwatcher-cli scan
  3. run <wiki>/scripts/rss_deep_ingest.py
  4. run <wiki>/scripts/blogwatcher_delta_ingest.py --since <date> --limit <n>
  5. run <wiki>/scripts/rebuild_news_indexes.py
  6. run check-rss-wiki-architecture.py <wiki>
  7. run frontmatter parse validation
  8. write artifacts/reports/wiki-news/wiki-news-YYYY-MM-DD.md
  9. exit 0 only if verification passes
```

The wrapper should treat source-level fetch failures as reportable warnings when the final architecture check passes. It should exit non-zero when:
- blogwatcher scan cannot run at all
- required wiki scripts are missing
- rebuild fails
- architecture check reports errors
- frontmatter parsing fails
- article count drops unexpectedly without an explicit allow flag

## Daily Run Command

Manual:

```bash
node scripts/pb-daily-monitor.mjs --mode wiki-news
```

Cron-friendly:

```bash
cd /Users/river/.openclaw/workspace/projects/Loop-engineering/Agent-Playbook
node scripts/pb-daily-monitor.mjs --mode wiki-news
```

## Why separate from existing `blogwatch` mode?

Existing `blogwatch` is a signal-monitoring mode for feeds/x.com alerts. `wiki-news` is a wiki-maintenance mode. It does not merely alert; it mutates `/Users/river/wiki` by ingesting, normalizing, rebuilding indexes, and verifying architecture.

Separation keeps mode intent clean:

- `blogwatch`: alert-oriented monitoring
- `wiki-news`: knowledge-base maintenance and synthesis
- `x-entity-wiki-discovery`: optional downstream social-intelligence enrichment

## Acceptance for Implementing This Proposal

Minimum implementation is complete when these pass:

```bash
node scripts/check-wiki-news-mode.mjs
node scripts/test-wiki-news-mode.mjs
node scripts/pb.mjs validate
node scripts/pb-daily-monitor.mjs --mode wiki-news --dry-run
```

A live daily run is complete when:

```bash
node scripts/pb-daily-monitor.mjs --mode wiki-news
```

exits 0 and the generated report says the RSS architecture check passed.

## Open Decisions

1. Whether `wiki-news` should also run `x-entity-wiki-discovery` after entity index rebuild, or whether that should remain a separate flow step.
   Recommendation: keep separate and compose with `pb-flow.mjs` later:
   `wiki-news -> x-entity-wiki-discovery`.

2. Whether The Batch should stay in the configured sources while unstable.
   Recommendation: keep it but mark failed/unavailable in source index; do not let it block daily success.

3. Whether the daily wrapper should mark blogwatcher articles read after successful ingest.
   Recommendation: initially no. Treat read/unread as human review state until River explicitly wants the agent to mutate it.
