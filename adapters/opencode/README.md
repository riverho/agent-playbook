# opencode-playbook — Agent-Playbook adapter for OpenCode

A thin bridge that lets [OpenCode](https://opencode.ai) drive the Agent-Playbook
loop. **Nothing here forks either engine.** The adapter shells out to the
unmodified `scripts/pb.mjs`; OpenCode stays stock. The playbook remains carry-on.

## The core idea: cadence over contract

Two systems each own a loop. We map them rather than merge them:

| Owns | System | Mechanism |
| --- | --- | --- |
| **Cadence** — "keep the turn going" | OpenCode | `session.idle` heartbeat |
| **Contract** — "what to do + did it actually pass" | Agent-Playbook | `pb` task selection + enforced `acceptance_checks` |

The adapter is the seam between them. OpenCode decides *when* to take another
turn; the playbook decides *what* that turn does and whether it really passed.
"Done" still means a verified exit code — OpenCode cannot declare victory
unchecked, because `pb record --status done` re-runs the checks regardless of
who drives it.

## Primary mode: auto loop (with deferral)

The plugin's `session.idle` hook invokes the playbook's autonomous driver:

```
node scripts/pb.mjs loop run --auto --defer-blocked
```

`--defer-blocked` (added under this adapter) changes the driver from
*stop-on-first-fault* to *keep-going-and-defer*: a task whose commands or checks
fail is recorded `blocked` and skipped, and the run continues to the next
claimable task. The run ends only when **no task can make progress** — every
remaining `todo` either has unmet dependencies or already failed this pass.
A task blocked only by a sibling that later goes `done` becomes claimable on a
later pass; one blocked by a hard failure stays deferred and the run terminates
`stalled` (surfacing which wall stopped progress) rather than `done`.

Co-pilot mode (OpenCode performs the `act` step itself for tasks that can't be
expressed as executable commands) is a later layer — not needed while backlogs
stay fully executable.

## Multi-agent identity (playbook v0.6.2)

The plugin is the adapter's half of the engine's multi-agent contract. On every
shell it stamps the identity a `pb` write should carry:

| Env | Set from | Purpose |
| --- | --- | --- |
| `PB_ROOT` | discovered playbook root | carry-on resolution |
| `PB_RUNTIME` | `opencode` | labels `origin_runtime` on each record |
| `PB_AGENT_ID` | `opencode:<session id>` | who wrote the row |
| `PB_SESSION_ID` | the OpenCode session | provenance |
| `PB_AGENT_CHAIN` / `PB_PARENT_AGENT_ID` / `PB_CLAIM_TOKEN` | forwarded when a launcher set them | delegated entitlement |

The plugin never mints a claim token — `pb next --claim` does, and the token is
the agent's to present. A sub-agent handed `PB_AGENT_CHAIN` records as itself
instead of impersonating its parent; a write that cannot prove ownership is still
recorded, but flagged `ownership: unproven` rather than dropped. The plugin's own
heartbeat calls carry the same identity, so `loop run`'s records are attributed
to the session, not to an anonymous `agent`.

This is what lets several OpenCode sessions (and other hosts) share one backlog:
who claimed a task, who wrote last, and on whose behalf are recorded facts.

## Layout

```
adapters/opencode/
  opencode.json          config: registers the plugin
  plugins/
    opencode-playbook.js  identity + session.idle driver + shell.env anchor + session.created re-anchor
  commands/
    pb-loop.md            /pb-loop  → run one auto pass (defer-blocked)
    pb-status.md          /pb-status → orient
  agents/
    playbook.md           bounded subagent: bash scoped to pb.mjs, read-only elsewhere
```

## Install into a target repo

Copy this folder's contents into the target's `.opencode/` (or point
OpenCode's global config at it). A future `pb scaffold --opencode` will automate
this drop, mirroring the existing engine-scaffold pattern.

## Hardening hooks

The playbook's context-loss design (`pb anchor` / `pb checkpoint`) maps onto
OpenCode lifecycle events; see the `opencode` profile under
`hardening.auto_inject` in `playbook.yaml`:

- `session.created` → `pb anchor`
- `experimental.session.compacting` → push `pb anchor --brief` into the compaction context
- `session.idle` → `pb checkpoint`

Principle, unchanged: externalize state to disk, re-anchor cheaply, auto-inject.
