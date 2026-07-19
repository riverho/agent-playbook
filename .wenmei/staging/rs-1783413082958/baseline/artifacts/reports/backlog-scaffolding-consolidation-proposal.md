# Revised Proposal — Project-Centric Backlog Scaffolding

River correction: the scaffold layer must be **project-centric**, not mode-centric.

The previous `scaffolds/modes/<mode-id>/...` proposal is wrong because it couples scaffold inputs to reusable modes. If the same `wiki-news`, `blogwatch`, or future mode is reused for another project/purpose, mode-owned scaffold config becomes polluted with project-specific paths, schedules, source lists, and acceptance checks.

## Correct Principle

Modes and skills are reusable capability packs.

Projects own scaffold inputs.

```text
mode/skill = reusable HOW
project scaffold = purpose-specific WHAT/WHERE/WHEN
memory/backlog.yaml = live queue generated from scaffold
```

A mode should declare the shape of scaffold input it can consume, but it should not own the project instance data by default.

## Better Layout

Use a project-centric scaffold root:

```text
projects/
└── <project-id>/
    ├── project.yaml
    ├── scaffolds/
    │   ├── index.yaml
    │   ├── modes/
    │   │   ├── wiki-news/
    │   │   │   └── daily-runs.yaml
    │   │   └── blogwatch/
    │   │       └── daily-watches.yaml
    │   ├── templates/
    │   ├── generated/
    │   │   └── <loop-id>/
    │   │       ├── scaffold-input.yaml
    │   │       ├── planned-tasks.yaml
    │   │       └── scaffold-report.md
    │   └── proposals/
    │       ├── pending/
    │       ├── applied/
    │       └── deferred/
    └── artifacts/
        └── reports/
```

For the current wiki/news work:

```text
projects/wiki/
├── project.yaml
└── scaffolds/
    ├── index.yaml
    └── modes/
        └── wiki-news/
            └── daily-runs.yaml
```

The reusable mode stays here:

```text
modes/wiki-news.yaml
modes/wiki-news/skills/...
modes/wiki-news/processes/...
```

The project-specific run config moves here:

```text
projects/wiki/scaffolds/modes/wiki-news/daily-runs.yaml
```

## Mode Contract Change

Current mode scaffold descriptor is too instance-specific:

```yaml
scaffold:
  config: modes/wiki-news/config/daily-wiki-runs.yaml
```

Better: mode declares a default schema/example, while the orchestrator receives the project config path.

```yaml
# modes/wiki-news.yaml
scaffold:
  items: runs
  skill: daily-wiki-refresh
  id_field: id
  goal_template: "Refresh ${wiki_path} from ${blogwatcher_db} for ${window}"
  check_field: check
  example_config: modes/wiki-news/examples/daily-wiki-runs.yaml
```

Then daily run uses project config:

```bash
node scripts/pb-daily-monitor.mjs \
  --mode wiki-news \
  --project wiki \
  --config projects/wiki/scaffolds/modes/wiki-news/daily-runs.yaml
```

Or if `--project wiki` is provided and no `--config` is provided, the orchestrator resolves:

```text
projects/wiki/scaffolds/modes/<mode-id>/default.yaml
```

or reads `projects/wiki/scaffolds/index.yaml` for the active scaffold.

## Project Descriptor

```yaml
# projects/wiki/project.yaml
id: wiki
description: River's LLM Wiki knowledge base
root: /Users/river/wiki
owners:
  - river
scaffold_root: projects/wiki/scaffolds
artifact_root: projects/wiki/artifacts
modes:
  wiki-news:
    default_scaffold: projects/wiki/scaffolds/modes/wiki-news/daily-runs.yaml
```

## Project Scaffold Index

```yaml
# projects/wiki/scaffolds/index.yaml
project: wiki
scaffolds:
  - id: wiki-news-daily
    mode: wiki-news
    purpose: Daily blogwatcher/RSS -> LLM Wiki maintenance
    file: projects/wiki/scaffolds/modes/wiki-news/daily-runs.yaml
    emits: memory/backlog.yaml
    generated: projects/wiki/scaffolds/generated
```

## Example Project Scaffold

```yaml
# projects/wiki/scaffolds/modes/wiki-news/daily-runs.yaml
runs:
  - id: wiki-news-daily
    wiki_path: /Users/river/wiki
    blogwatcher_db: /Users/river/.blogwatcher-cli/blogwatcher-cli.db
    window: today
    limit: 120
    check: >-
      node scripts/wiki-news-daily.mjs
      --wiki /Users/river/wiki
      --db /Users/river/.blogwatcher-cli/blogwatcher-cli.db
      --since today
      --limit 120
```

This is now clearly project-owned. Another project can reuse `wiki-news` with a different config:

```text
projects/client-a/scaffolds/modes/wiki-news/daily-runs.yaml
projects/research-lab/scaffolds/modes/wiki-news/daily-runs.yaml
```

No mode pollution.

## What Lives Where

### Reusable mode/skill layer

```text
modes/wiki-news.yaml
modes/wiki-news/skills/...
modes/wiki-news/processes/...
scripts/wiki-news-daily.mjs
scripts/check-wiki-news-mode.mjs
scripts/test-wiki-news-mode.mjs
```

Owns:
- process shape
- skill instructions
- scaffold field mapping
- wrapper executable
- validation behavior

Does not own:
- River's `/Users/river/wiki` path
- River's blogwatcher DB path
- source-specific run limits
- project schedule
- project-specific backlog goals

### Project scaffold layer

```text
projects/<project-id>/scaffolds/...
```

Owns:
- concrete paths
- concrete sources
- concrete run windows
- concrete acceptance commands
- generated scaffold traces
- project-specific proposals

### Live state layer

Keep unchanged:

```text
memory/backlog.yaml
memory/backlog-state.json
memory/journal.ndjson
memory/loops.yaml
```

Owns:
- current queue
- claim state
- journal records
- loop epochs

## Orchestrator Changes

Add project awareness to `pb-daily-monitor.mjs`:

```bash
node scripts/pb-daily-monitor.mjs --mode wiki-news --project wiki
```

Resolution order for scaffold config:

```text
1. explicit --config <path>
2. --project <id> -> projects/<id>/project.yaml -> modes.<mode>.default_scaffold
3. --project <id> -> projects/<id>/scaffolds/index.yaml active entry for mode
4. mode.scaffold.config only as a backward-compatible fallback / example
```

Generated traces should go to the project, not the mode:

```text
projects/<project-id>/scaffolds/generated/<loop-id>/
```

If no `--project` is supplied, generated traces can stay in existing artifacts/reports or loop artifacts for backward compatibility.

## Migration Plan

### Phase 1 — Add project layer without breaking existing mode configs

Create:

```text
projects/wiki/project.yaml
projects/wiki/scaffolds/index.yaml
projects/wiki/scaffolds/modes/wiki-news/daily-runs.yaml
```

Copy current `modes/wiki-news/config/daily-wiki-runs.yaml` into the project scaffold path.

Acceptance:

```bash
test -f projects/wiki/project.yaml
test -f projects/wiki/scaffolds/modes/wiki-news/daily-runs.yaml
node scripts/pb-daily-monitor.mjs --mode wiki-news --config projects/wiki/scaffolds/modes/wiki-news/daily-runs.yaml --dry-run
node scripts/pb.mjs validate
```

### Phase 2 — Add `--project` resolution

Teach `pb-daily-monitor.mjs`:

```bash
--project wiki
```

Acceptance:

```bash
node scripts/pb-daily-monitor.mjs --mode wiki-news --project wiki --dry-run
node scripts/test-daily-monitor.mjs
node scripts/test-wiki-news-mode.mjs
node scripts/pb.mjs validate
```

### Phase 3 — Move generated traces under project scaffold root

Write every scaffold run trace to:

```text
projects/wiki/scaffolds/generated/<loop-id>/
```

Acceptance:

```bash
node scripts/pb-daily-monitor.mjs --mode wiki-news --project wiki --dry-run
test -d projects/wiki/scaffolds/generated || true
node scripts/pb.mjs validate
```

### Phase 4 — Downgrade mode-owned config to example only

Move:

```text
modes/wiki-news/config/daily-wiki-runs.yaml
  -> modes/wiki-news/examples/daily-wiki-runs.yaml
```

Mode retains schema/example; project owns active config.

## Why This Is Better

This preserves reuse:

```text
same mode + same skills + different project scaffold = different purpose
```

It avoids this anti-pattern:

```text
modes/wiki-news/config/client-a.yaml
modes/wiki-news/config/river-wiki.yaml
modes/wiki-news/config/random-experiment.yaml
```

That would turn a reusable mode into a junk drawer.

## Final Recommendation

Use:

```text
projects/<project-id>/scaffolds/
```

not top-level mode-centric:

```text
scaffolds/modes/<mode-id>/
```

The clean model is:

```text
Reusable capabilities: modes/, skills/, processes/, scripts/
Project-specific backlog scaffolds: projects/<project-id>/scaffolds/
Live execution state: memory/
Human reports: artifacts/reports/
```

For the current work, start with:

```text
projects/wiki/scaffolds/modes/wiki-news/daily-runs.yaml
```

and run it with:

```bash
node scripts/pb-daily-monitor.mjs --mode wiki-news --project wiki
```
