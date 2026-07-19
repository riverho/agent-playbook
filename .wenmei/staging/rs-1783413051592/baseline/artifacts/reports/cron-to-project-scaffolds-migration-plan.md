# Plan — Migrate Daily Cron Tasks into Project-Centric Scaffolds

## Decision Confirmed

Canonical scaffold location:

```text
/Users/river/.openclaw/workspace/projects/<project-id>/scaffolds/
```

This replaces the wrong mode-centric idea. Modes/skills remain reusable; project folders own concrete daily inputs, paths, schedules, and acceptance commands.

## Current Hermes Cron Inventory

Active jobs found in `~/.hermes/cron/jobs.json` and `cronjob list`:

| Job ID | Name | Schedule | Deliver | Project | Current status |
|---|---|---|---|---|---|
| `91c5924d48c4` | AR morning digest | `0 8 * * *` | `telegram:8564578672` | `attention-research` | enabled, last ok |
| `b38e23518570` | AR afternoon update | `0 16 * * *` | `telegram:8564578672` | `attention-research` | enabled, last ok |

Both cron prompts currently hardcode project-specific paths:

```text
~/.openclaw/skills/attention-research/CONFIG/topics.yaml
~/.openclaw/skills/attention-research/PROMPTS/TOPICS/<topic>.md
~/.openclaw/workspace/docs/research/topics/<topic>/news/<topic>-YYYY-MM-DD.md
```

These are project instance inputs and should move into the `attention-research` project scaffold layer.

## Workspace Project List

Top-level project folders under `/Users/river/.openclaw/workspace/projects`:

```text
.obsidian
FinceptTerminal
GEO-website
LabClaw
Loop-engineering
agent-orchestrator
attention-repo
attention-research
attention-research-premium
attention-sandbox
autoresearch-master
backup
brand-identity
chinese-chess-game
cmsa
educational-game
hermes-agent
kimi-web-search
lastmile
llm-wiki
memory-vault
projects
run_cloudflared_tunnel.app
summon-ai
summon-forge
topic-discovery
warp
wenmei
```

Only `attention-research` currently has active Hermes daily cron jobs. `wiki`/LLM Wiki work is currently outside this tree at `/Users/river/wiki`, but if we want it under the confirmed convention, create a project folder:

```text
/Users/river/.openclaw/workspace/projects/wiki/
```

or reuse the existing repo project:

```text
/Users/river/.openclaw/workspace/projects/llm-wiki/
```

Recommendation: use `llm-wiki` for the reusable code/repo and `wiki` only if River wants a project wrapper for the live `/Users/river/wiki` vault. Do not conflate the two without an explicit decision.

## Target Model

Cron becomes a thin trigger. The project scaffold owns the job definition.

```text
Hermes cron
  -> runs Agent-Playbook mode/flow with --project <project-id>
  -> project scaffold supplies concrete inputs
  -> mode/skill supplies reusable procedure
  -> project scaffold generated trace records what backlog tasks were created
```

No project paths should live in reusable mode configs except examples.

## Proposed Folder Structure — `attention-research`

Create:

```text
/Users/river/.openclaw/workspace/projects/attention-research/
├── project.yaml
├── scaffolds/
│   ├── index.yaml
│   ├── cron/
│   │   ├── ar-morning-digest.yaml
│   │   └── ar-afternoon-update.yaml
│   ├── modes/
│   │   └── attention-research/
│   │       ├── morning-run.yaml
│   │       └── afternoon-run.yaml
│   ├── templates/
│   │   ├── cron-job.yaml
│   │   ├── topic-monitor-run.yaml
│   │   └── telegram-digest.yaml
│   ├── generated/
│   │   └── <loop-id-or-date>/
│   │       ├── scaffold-input.yaml
│   │       ├── planned-tasks.yaml
│   │       ├── cron-context.yaml
│   │       └── scaffold-report.md
│   └── proposals/
│       ├── pending/
│       ├── applied/
│       └── deferred/
└── artifacts/
    └── reports/
        └── cron/
```

### `/projects/attention-research/project.yaml`

```yaml
id: attention-research
description: Daily attention-research topic monitoring and digest delivery
root: /Users/river/.openclaw/workspace/projects/attention-research
owners:
  - river
scaffold_root: /Users/river/.openclaw/workspace/projects/attention-research/scaffolds
artifact_root: /Users/river/.openclaw/workspace/projects/attention-research/artifacts
modes:
  attention-research:
    morning: /Users/river/.openclaw/workspace/projects/attention-research/scaffolds/modes/attention-research/morning-run.yaml
    afternoon: /Users/river/.openclaw/workspace/projects/attention-research/scaffolds/modes/attention-research/afternoon-run.yaml
cron:
  - id: ar-morning-digest
    hermes_job_id: 91c5924d48c4
    schedule: "0 8 * * *"
    scaffold: /Users/river/.openclaw/workspace/projects/attention-research/scaffolds/cron/ar-morning-digest.yaml
  - id: ar-afternoon-update
    hermes_job_id: b38e23518570
    schedule: "0 16 * * *"
    scaffold: /Users/river/.openclaw/workspace/projects/attention-research/scaffolds/cron/ar-afternoon-update.yaml
```

### `/projects/attention-research/scaffolds/index.yaml`

```yaml
project: attention-research
version: 1.0.0
scaffolds:
  - id: ar-morning-digest
    kind: cron
    mode: attention-research
    schedule: "0 8 * * *"
    file: scaffolds/cron/ar-morning-digest.yaml
    emits: memory/backlog.yaml
    generated: scaffolds/generated
  - id: ar-afternoon-update
    kind: cron
    mode: attention-research
    schedule: "0 16 * * *"
    file: scaffolds/cron/ar-afternoon-update.yaml
    emits: memory/backlog.yaml
    generated: scaffolds/generated
```

### `/projects/attention-research/scaffolds/cron/ar-morning-digest.yaml`

```yaml
id: ar-morning-digest
kind: hermes-cron
hermes_job_id: 91c5924d48c4
name: AR morning digest
schedule: "0 8 * * *"
deliver: telegram:8564578672
mode: attention-research
run_config: ../modes/attention-research/morning-run.yaml
prompt_template: templates/attention-research-cron-prompt.md
acceptance:
  - topic news files created or updated for today
  - META.json lastMorningUpdate set to today for each enabled topic
  - digest contains source links
  - errors recorded in META.json when Tavily fails
```

### `/projects/attention-research/scaffolds/cron/ar-afternoon-update.yaml`

```yaml
id: ar-afternoon-update
kind: hermes-cron
hermes_job_id: b38e23518570
name: AR afternoon update
schedule: "0 16 * * *"
deliver: telegram:8564578672
mode: attention-research
run_config: ../modes/attention-research/afternoon-run.yaml
prompt_template: templates/attention-research-cron-prompt.md
acceptance:
  - topic news files created or updated for today
  - META.json lastAfternoonUpdate set to today for each enabled topic
  - digest contains source links
  - errors recorded in META.json when Tavily fails
```

### `/projects/attention-research/scaffolds/modes/attention-research/morning-run.yaml`

```yaml
runs:
  - id: attention-research-morning
    window: morning
    search_provider: tavily
    topics_file: /Users/river/.openclaw/skills/attention-research/CONFIG/topics.yaml
    prompt_dir: /Users/river/.openclaw/skills/attention-research/PROMPTS/TOPICS
    output_root: /Users/river/.openclaw/workspace/docs/research/topics
    meta_field: lastMorningUpdate
    retry_field: retryCount
    deliver: telegram:8564578672
    check: >-
      node scripts/attention-research-daily.mjs
      --project attention-research
      --window morning
      --date today
```

### `/projects/attention-research/scaffolds/modes/attention-research/afternoon-run.yaml`

```yaml
runs:
  - id: attention-research-afternoon
    window: afternoon
    search_provider: tavily
    topics_file: /Users/river/.openclaw/skills/attention-research/CONFIG/topics.yaml
    prompt_dir: /Users/river/.openclaw/skills/attention-research/PROMPTS/TOPICS
    output_root: /Users/river/.openclaw/workspace/docs/research/topics
    meta_field: lastAfternoonUpdate
    retry_field: retryCount
    deliver: telegram:8564578672
    check: >-
      node scripts/attention-research-daily.mjs
      --project attention-research
      --window afternoon
      --date today
```

## Proposed Folder Structure — Future `wiki` / `llm-wiki`

If we migrate the new `wiki-news` daily workflow into the same system, use one of these.

### Option A — live vault wrapper project

```text
/Users/river/.openclaw/workspace/projects/wiki/
├── project.yaml
└── scaffolds/
    ├── index.yaml
    ├── cron/
    │   └── wiki-news-daily.yaml
    └── modes/
        └── wiki-news/
            └── daily-runs.yaml
```

Good if `/Users/river/wiki` is the real product and `llm-wiki` repo is just tooling.

### Option B — use existing repo project

```text
/Users/river/.openclaw/workspace/projects/llm-wiki/
├── project.yaml
└── scaffolds/
    ├── index.yaml
    ├── cron/
    │   └── wiki-news-daily.yaml
    └── modes/
        └── wiki-news/
            └── daily-runs.yaml
```

Good if `llm-wiki` repo is the project identity.

Recommendation: choose Option A only if River wants project IDs to map to live operational systems; choose Option B if project IDs should map to repos. My preference: Option A for operations (`wiki`) and keep `/projects/llm-wiki` for code/repo work.

## Migration Phases

### Phase 0 — Inventory and freeze current cron behavior

Do not change schedules yet.

Actions:

1. Snapshot current Hermes cron config from `~/.hermes/cron/jobs.json`.
2. Save each current prompt verbatim under project scaffold history:

```text
projects/attention-research/scaffolds/archive/2026-06/original-cron-91c5924d48c4.md
projects/attention-research/scaffolds/archive/2026-06/original-cron-b38e23518570.md
```

Acceptance:

```bash
test -f /Users/river/.openclaw/workspace/projects/attention-research/scaffolds/archive/2026-06/original-cron-91c5924d48c4.md
test -f /Users/river/.openclaw/workspace/projects/attention-research/scaffolds/archive/2026-06/original-cron-b38e23518570.md
```

### Phase 1 — Create project scaffold folders

Create only files/folders; no cron mutation.

Acceptance:

```bash
test -f /Users/river/.openclaw/workspace/projects/attention-research/project.yaml
test -f /Users/river/.openclaw/workspace/projects/attention-research/scaffolds/index.yaml
test -f /Users/river/.openclaw/workspace/projects/attention-research/scaffolds/cron/ar-morning-digest.yaml
test -f /Users/river/.openclaw/workspace/projects/attention-research/scaffolds/cron/ar-afternoon-update.yaml
```

### Phase 2 — Add reusable runner/mode interface

Current cron prompts are Hermes-agent prose. To plug into Agent-Playbook cleanly, add a reusable runner contract.

Possible mode ID:

```text
attention-research
```

Files, if not already covered by existing skills:

```text
modes/attention-research.yaml
modes/attention-research/skills/daily-research-run/SKILL.md
modes/attention-research/processes/daily-research-run.yaml
scripts/attention-research-daily.mjs
scripts/check-attention-research-mode.mjs
scripts/test-attention-research-mode.mjs
```

But do not duplicate existing Hermes skills unnecessarily. If the current `attention-research-morning-run` and `attention-research-afternoon-run` skills are sufficient, the runner can call those workflows rather than inventing logic.

Acceptance:

```bash
node scripts/check-attention-research-mode.mjs
node scripts/test-attention-research-mode.mjs
node scripts/pb.mjs validate
```

### Phase 3 — Add `--project` resolution to Agent-Playbook orchestrator

Update `pb-daily-monitor.mjs` to accept:

```bash
--project attention-research
```

Resolution order:

```text
1. explicit --config
2. projects/<project-id>/project.yaml -> modes.<mode>.default_scaffold or cron.<id>.scaffold
3. projects/<project-id>/scaffolds/index.yaml matching mode/window
4. mode.scaffold.config fallback only
```

Acceptance:

```bash
node scripts/pb-daily-monitor.mjs --mode attention-research --project attention-research --config /Users/river/.openclaw/workspace/projects/attention-research/scaffolds/modes/attention-research/morning-run.yaml --dry-run
node scripts/pb-daily-monitor.mjs --mode wiki-news --project wiki --dry-run  # once wiki project exists
node scripts/test-daily-monitor.mjs
node scripts/pb.mjs validate
```

### Phase 4 — Create replacement cron jobs in shadow mode

Do not remove old jobs immediately.

Create new jobs with names like:

```text
AR morning digest — project-scaffold shadow
AR afternoon update — project-scaffold shadow
```

Schedule them manually or one-shot first, not at the same daily time.

Prompt shape should be tiny and self-contained:

```text
Run the Agent-Playbook project scaffold for attention-research morning digest.
Workdir: /Users/river/.openclaw/workspace/projects/Loop-engineering/Agent-Playbook
Command/intent: node scripts/pb-daily-monitor.mjs --mode attention-research --project attention-research --config /Users/river/.openclaw/workspace/projects/attention-research/scaffolds/modes/attention-research/morning-run.yaml
Use the scaffold file as source of truth. Do not inline project paths from memory.
```

Acceptance:

```bash
cronjob list shows both old and shadow jobs
shadow job last_status ok after manual run
output matches old job output shape
```

### Phase 5 — Cutover

After at least one successful morning and one successful afternoon shadow run:

1. Pause old jobs:
   - `91c5924d48c4`
   - `b38e23518570`
2. Enable replacement jobs at `0 8 * * *` and `0 16 * * *`.
3. Keep old jobs paused for one week before removal.

Acceptance:

```text
old jobs paused
new jobs enabled
next_run_at correct
last_status ok after first scheduled run
```

### Phase 6 — Trace generation

Each run writes:

```text
/Users/river/.openclaw/workspace/projects/attention-research/scaffolds/generated/YYYY-MM-DD-morning/
/Users/river/.openclaw/workspace/projects/attention-research/scaffolds/generated/YYYY-MM-DD-afternoon/
```

Containing:

```text
scaffold-input.yaml
planned-tasks.yaml
cron-context.yaml
run-output.md
scaffold-report.md
```

Acceptance:

```bash
test -f /Users/river/.openclaw/workspace/projects/attention-research/scaffolds/generated/<date>-morning/scaffold-report.md
test -f /Users/river/.openclaw/workspace/projects/attention-research/scaffolds/generated/<date>-afternoon/scaffold-report.md
```

## Project Folder Skeletons to Create Eventually

For all project directories, the non-invasive skeleton can be:

```text
/Users/river/.openclaw/workspace/projects/<project-id>/
├── project.yaml                  # optional until project enters scaffold system
└── scaffolds/
    ├── index.yaml
    ├── cron/
    ├── modes/
    ├── templates/
    ├── generated/
    ├── proposals/
    │   ├── pending/
    │   ├── applied/
    │   └── deferred/
    └── archive/
```

Do not create this for every project immediately. Create it when a project gets a recurring scaffold or cron migration. Otherwise the workspace gets noisy.

## Immediate Scope

Migrate only the two active daily cron jobs first:

```text
attention-research / AR morning digest
attention-research / AR afternoon update
```

Defer:

```text
wiki-news daily cron creation
X-profile-watch cron migration
any inactive/legacy cron history migration
```

## Open Design Questions

1. Should `attention-research` become an Agent-Playbook mode, or should the project scaffold call existing Hermes skills directly?
   - Recommendation: use an Agent-Playbook mode only if we need backlog/task traceability. Otherwise a script-only project scaffold runner is lighter.

2. Should replacement cron jobs call a shell script (`no_agent=True`) or an LLM prompt?
   - Recommendation: if output shape is deterministic, use script-only cron. If summarization and judgment are still needed, keep LLM cron but make the prompt point to project scaffold files.

3. Should `/Users/river/wiki` become `/projects/wiki` or belong to `/projects/llm-wiki`?
   - Recommendation: decide separately before scheduling `wiki-news` as daily cron.

## Recommended Next Step

Implement Phase 0 and Phase 1 for `attention-research` only. This creates project-centric scaffolds and archives existing cron prompts without changing runtime behavior.

Then run one manual shadow execution before any cron cutover.
