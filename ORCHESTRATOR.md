# Orchestrator — always-on monitoring & flows (mode-agnostic)

The orchestrator runs a **closed monitoring loop for any mode**, and composes modes into
**flows**. It is designed for always-on agents and cron-style invocation. The heartbeat is
mode-agnostic: it activates a mode, scaffolds a backlog **from the mode's own descriptor**,
drains it, and surfaces errors or capability gaps. It hardcodes no mode's shape.

> The catalog is data, not prose. Don't memorize which modes exist — **look them up** with
> `pb list modes`. This file teaches *how the loop works*; the mode list lives in
> `modes/index.yaml`.

## 1. Find the right mode (the menu)

```bash
node scripts/pb.mjs list modes          # every mode + a one-line abstract  (which streamline set?)
node scripts/pb.mjs mode show <id>      # that mode's directive, principles, and skill+process menu
node scripts/pb.mjs mode skills <id>    # bare skill ids (machine-readable)
node scripts/pb.mjs mode processes <id> # bare process ids (machine-readable)
```

`pb validate` asserts `modes/index.yaml` and the master's `modes:` map agree — a menu that
disagrees with the master fails validation, so the catalog never lies.

## 2. Run one mode (the heartbeat)

```bash
node scripts/pb-daily-monitor.mjs --mode <id> [--config <file>] [--input <dir>] [--output <dir>] [--dry-run]
```

```
heartbeat
  → ensure active loop + cycle brief (Q5 auto-filled)
  → pb mode set <id>
  → capability-gap gate: is the mode's scaffold skill in its menu?  (no → propose + stop)
  → scaffold a backlog from the mode's `scaffold` descriptor (one task per config item)
  → pb loop run --auto --defer-blocked
  → read backlog state / append logs / print summary / exit
```

The orchestrator reuses the existing `pb` primitives; it **does not edit skills or processes
during a run** (read-only on its own machinery — see §5).

**Exit codes:**

| Code | Meaning |
|---|---|
| `0` | Every scaffolded task drained `done`. |
| `1` | One or more tasks ended `blocked`/`todo` — see the error log. |
| `2` | Capability gap — the mode's scaffold skill isn't in its menu; a proposal was logged, nothing was scaffolded. |

## 3. What makes a mode orchestratable — the `scaffold` descriptor

A mode is orchestratable when its mode file (`modes/<id>.yaml`) declares a `scaffold` block.
The orchestrator reads this instead of knowing the mode's shape:

```yaml
scaffold:
  config: modes/<id>/config/items.yaml   # the input file
  items: watches                         # the array key inside the config
  skill: watch-feeds                     # skill each task is planned against
  id_field: id                           # each item's stable id
  goal_template: "Monitor ${source} for ${criteria}"  # ${field} filled from the item
  check_field: check                     # the item field used as the task's acceptance_check
```

Every scaffolded task carries an **executable `acceptance_check`** (the item's `check_field`).
That is what makes "drain to done" honest — `pb loop run --auto` re-runs the check and refuses to
mark a task done if it fails.

**Worked example — the `blogwatch` mode.** Config in `modes/blogwatch/config/daily-watches.yaml`:

```yaml
watches:
  - id: my-watch
    source: x.com/@handle
    criteria: posts mentioning "agent-playbook"
    check: node ./my-fetcher.mjs --source x --handle @handle --token "$X_TOKEN"
```

**Security:** credentials must come from environment variables inside `check`, never from this
file or the playbook folder.

## 4. Compose modes into a flow

A **flow** is an ordered sequence of monitor modes. Sequencing lives in the flow file —
modes carry no `next:` pointers, so each stays reusable across flows. Handoff is **explicit
artifact dirs**: a step writes its `output` dir; the next step reads it as `input`.

```bash
node scripts/pb-flow.mjs --flow <id>   # runs flows/<id>.yaml
```

```yaml
# flows/<id>.yaml
id: daily-digest
steps:
  - mode: gather
    output: artifacts/flows/daily-digest/gather
  - mode: summarize
    input:  artifacts/flows/daily-digest/gather   # = the previous step's output
    output: artifacts/flows/daily-digest/summary
```

Runner semantics:

- **One loop epoch per flow run** — the runner opens it; each step reuses it, so `pb reflect`
  sees the whole sequence as one unit of learning.
- **Fail-fast** — a step whose backlog doesn't drain halts the flow with a non-zero exit; later
  steps are skipped.
- **Handoff contract** — a fixed `handoff.yaml` file with a `handoff` key, so chained modes need
  not share an items key; only the per-record fields the consumer's descriptor needs must line up.

Validate flow structure (real modes, dirs inside the playbook, `output → input` wiring) with:

```bash
node scripts/check-flow.mjs
```

See `flows/example-digest.yaml` for a runnable, commented example.

## 5. Capability gaps → proposals (build in a separate loop)

The heartbeat is **read-only on its own machinery**. When the scaffold needs a skill that isn't in
the mode's menu, the orchestrator does **not** scaffold an unroutable task — it appends a
`pending` building-plan proposal to `orchestrator-iterations.ndjson` and exits `2`. Building the
missing skill/process happens in a **separate evolution loop**, never inside a monitoring run.

> Do not silently edit a mode's skills/processes during an orchestrator run. Log a proposal,
> then apply it in a separate agent loop and run `pb reflect` on the change.

## 6. Always-on logs

Append-only JSON lines, so other agents read them without parsing prose.

| Log | Purpose | Review cadence |
|---|---|---|
| `artifacts/reports/orchestrator-errors.ndjson` | One line per blocked/failed item or orchestrator error | Immediately when exit code is non-zero |
| `artifacts/reports/orchestrator-reflections.ndjson` | One line per run: results + any proposed process/skill changes | Before `pb reflect` |
| `artifacts/reports/orchestrator-iterations.ndjson` | One line per proposed change (`pending\|applied\|deferred`), incl. capability-gap building plans | During process/skill improvement loops |

## 7. Error surfacing & iteration workflow

When an item fails: the orchestrator prints the blocked task, appends a structured error entry
(task id, item id, check command, output tail), and exits non-zero so the caller (cron, CI, agent)
investigates. To iterate:

1. Read `orchestrator-errors.ndjson` to find failing items.
2. Decide whether the fix belongs in the item's `check`, the mode's scaffold/skill, or the runner.
3. Add/update a proposal in `orchestrator-iterations.ndjson` with status `pending`.
4. Make the change in a separate loop, run the relevant checks, set the proposal `applied`.
5. Run `pb reflect --notes "..."` to capture the lesson.

## 8. Reference

| Thing | Where |
|---|---|
| Mode menu | `pb list modes` · `pb mode show <id>` · `pb mode skills\|processes <id>` |
| Single-mode runner | `scripts/pb-daily-monitor.mjs --mode <id>` |
| Flow runner | `scripts/pb-flow.mjs --flow <id>` |
| Flow structural check | `scripts/check-flow.mjs` |
| Mode catalog (data) | `modes/index.yaml` |
| Example flow | `flows/example-digest.yaml` |
| Worked-example mode | `modes/blogwatch.yaml` (+ `modes/blogwatch/` pack, `modes/blogwatch/config/daily-watches.yaml`) |
| Behavioral tests | `scripts/test-orchestrator-generic.mjs` · `scripts/test-scaffold-gap.mjs` · `scripts/test-flow-runner.mjs` · `scripts/test-daily-monitor.mjs` |

To add a new monitorable mode: give it a pack (skill + process), add a `scaffold` descriptor to its
mode file, register it in `playbook.yaml` `modes:` **and** `modes/index.yaml`, then
`node scripts/pb.mjs validate`.
