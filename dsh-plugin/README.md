# @riverho/dsh-agent-playbook

A **DeepSeek Harness** plugin for [Agent-Playbook](https://github.com/riverho/agent-playbook).

The engine's whole thesis is one sentence: **"done" is an exit code, not a claim.** A task's
`acceptance_checks` are shell commands, and recording it `done` re-runs them and *refuses* if any
fail. This plugin brings that loop into the harness — with multi-agent attribution and isolated git
worktrees.

---

## Why a plugin, and what it deliberately does not do

| Owns | System |
|---|---|
| **Truth** — backlog, claims, journals, acceptance checks, worktrees | Agent-Playbook (the engine) |
| **Convenience** — agent identity, context injection, model-facing tools | this plugin (the harness) |

The plugin **never re-implements a gate.** Every action translates into a `pb` invocation. If
something cannot be expressed as a `pb` call, the engine does not support it yet — and inventing a
second opinion about "done" is exactly the failure this design refuses.

It also shells out rather than importing the engine. That is not laziness: every engine command
reports refusal with `process.exit()`, so an in-process call would terminate the *harness* instead
of returning an error. As a subprocess, the exit code remains the contract.

---

## What it gives you

### 1. Multi-agent writes stay attributable

Fan-out is the point, and it is where naive setups lose data. The plugin stamps every engine call
with a real identity:

| Variable | Meaning |
|---|---|
| `PB_AGENT_ID` | who is writing (defaults to the harness session id) |
| `PB_SESSION_ID` | which harness session it came from |
| `PB_PARENT_AGENT_ID` | the spawning agent, for sub-agents |
| `PB_AGENT_CHAIN` | the full delegation path (`root,sub,grand`) |
| `PB_CLAIM_TOKEN` | proof of entitlement to the task this agent holds |
| `PB_RUNTIME` | `dsh`, so records show which host wrote them |

So a sub-agent **writes as itself** and is recorded as itself, while the engine can still verify it
was entitled to touch its ancestor's claim. A refused write is flagged `ownership: unproven` — never
silently dropped, never silently allowed.

Under the hood the engine serializes every state write through one lock and an atomic replace, and
stamps each journal row with a monotonic `seq`. "Who wrote first, who wrote last, and on whose
behalf" is a recorded fact, not an inference from colliding timestamps.

### 2. Isolated worktrees, gated merges

`worker` actions drive a real git worktree per task:

```
create   → open a slot (atomic: one live slot per task, no orphan worktrees)
status   → ahead / behind / uncommitted / head
exec     → run a command INSIDE the worktree
verify   → run the task's acceptance_checks INSIDE the worktree
merge    → gated by merge-ready; refuses unless the branch actually carries verified work
remove   → tear the slot down
```

The merge gate reads the *branch*, not just the journal: a worktree that is missing, dirty, or has
**zero commits ahead of its base** cannot be merged, and a verification that has gone stale is
reported rather than trusted.

### 3. The constitution survives compaction

Before each agent step the plugin stages a short context block on the agent's inbox:
```
[agent-playbook]
playbook: my-project v0.3.6
loop: loop-7 — finish the worktree lifecycle
north star: Make "done" mean a verified exit code, not a claim.
backlog: 2 todo · 1 in_progress · 0 blocked · 4 done
in progress: T1 (alice)
task in hand: [T1] Do the thing
done means these exit 0:
  $ npm test
  $ node scripts/pb.mjs validate
Rule: "done" is an exit code, not a claim. Record with `pb record` — it re-runs the checks and refuses on failure.
```

The North Star, the active loop, the task in hand and **its checks** are re-injected every step, so a
long session or a compaction cannot lose the plot. When the backlog has nothing actionable the block
is suppressed (`quietWhenIdle`) rather than burning tokens.

### 4. The playbook's own skills are loadable

The project's `skills/<id>/SKILL.md` files are registered as harness skills, so its procedures load
the same way the harness's built-in ones do — including mode-local skills, because the ENGINE's own
resolution decides which are active (nothing is re-implemented in the plugin).

They are namespaced **`playbook-<id>`**: a harness skill is invoked by slot (`/name`) and a playbook
skill by path, so a bare id could shadow an unrelated harness skill. The catalog is discovered live
on each list, so a skill added to `skills/index.yaml` appears without a restart; bodies load on
demand rather than at discovery.

A loaded body is prefixed with its routing, because a playbook skill that says "follow the process"
is useless without knowing *which* process file the engine's skills-first routing keys on:

```
# Playbook skill: run-task
This skill belongs to the workspace playbook. Operate the project through it:
- skill file: skills/run-task/SKILL.md
- canonical process: processes/run-task.yaml — follow it step by step
- record work with the `playbook` tool; "done" is an acceptance check exiting 0, not a claim
```

---

## Install

The plugin **carries the engine**, so this is one install — no separate engine
checkout and no version to keep in step by hand.

```bash
# 1. the plugin (into the profile that runs your sessions)
npm install @riverho/dsh-agent-playbook

# 2. mount it — either add the package to your profile's bundle list, or paste the
#    row from cordis.patch.yml into your profile patch
```

The package declares `dsh.bundle.patch`, so listing it as a bundle is enough:

```json
{ "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "@riverho/dsh-agent-playbook"] } } }
```

Then scaffold a playbook for the workspace you want to operate, from the agent itself:

```
playbook action=init
```

That writes `.agents-playbook/` (engine + master + runtime files) into the session
workspace, hydrates it with the engine's own `init`, and validates the result — all from
the bundled engine. The workspace copy then takes over, so the playbook is
**self-hosting**: it can scaffold further playbooks, and it does not depend on the
plugin being installed to keep working.

If you already have a playbook (or want it somewhere else), skip step 2 and point the
plugin at it:

```yaml
- insert:
    - id: agent-playbook
      name: '@riverho/dsh-agent-playbook'
      config:
        playbookPath: ''                  # '' → discover: nested locations, then ancestors
        playbookDir: '.agents-playbook'   # where action=init scaffolds
        injectContext: true
        quietWhenIdle: true
        maxContextChars: 4000
        commandTimeoutMs: 120000
```

There is no engine install requirement to *load* the plugin: it looks for a playbook in
the well-known nested locations (`.agents-playbook`, `.playbook`, `agent-playbook`) and
then walks up from the session workspace. It stays dormant when there is none — except
that `action=init` always works, because that is what the bundled engine is for.

### Which engine runs, and where

Two separate things, deliberately:

| | meaning |
|---|---|
| **which engine** | the workspace's own copy if it has one, else the bundled one |
| **which playbook** | always a real workspace playbook — never the plugin's vendored copy |

A workspace playbook therefore wins over the bundle, and the bundle is never used as a
target. That matters because the plugin now contains a playbook-shaped tree: a naive
ancestor walk would "discover" it and operate on the wrong project.

## Configuration

| Field | Default | Meaning |
|---|---|---|
| `playbookPath` | `''` | Absolute path, or `''` to discover (nested locations, then ancestors). |
| `playbookDir` | `.agents-playbook` | Where `action=init` scaffolds a playbook. |
| `injectContext` | `true` | Stage the constitution on the agent's inbox each step. |
| `quietWhenIdle` | `true` | Stay silent when nothing is `todo` or `in_progress`. |
| `maxContextChars` | `4000` | Character cap on the staged block. |
| `commandTimeoutMs` | `120000` | Per-`pb`-invocation timeout. |

## The `playbook` tool

| Action | What it does |
|---|---|
| `status` | Orient: backlog counts, active loop, guardrail state, recent records. |
| `anchor` | Re-inject the constitution (North Star + current cycle). |
| `next` | Show the next claimable task and its checks, without claiming. |
| `claim` | Claim it. Returns the **claim token** — pass it to a sub-agent so it can record on your behalf. |
| `task` | One task's projection: status, holder, checks, gate quality, worker. |
| `check` | Run that task's `acceptance_checks` on demand. |
| `record` | Record an outcome. `status=done` re-runs the checks and **refuses on failure**. |
| `worker` | Worktree lifecycle: `create` / `status` / `exec` / `verify` / `merge` / `remove`. |
| `init` | Scaffold + hydrate a playbook from the bundled engine (works with none present). |
| `unlock` | Report and (with `force`) clear a leaked lock. |
| `repair` | Check or rebuild the state projection from the append-only journal. |

## Delegating to a sub-agent

```
1. playbook action=claim                     → task + claim token
2. spawn the sub-agent with:
     PB_AGENT_ID=<sub>
     PB_PARENT_AGENT_ID=<you>
     PB_AGENT_CHAIN=<you>,<sub>
     PB_CLAIM_TOKEN=<token>
3. the sub-agent works in `worker create`/`verify` and records as ITSELF, proven
4. playbook action=worker workerAction=merge  → only after the gate opens
```

## Development

```bash
npm run build:plugin          # bundle the engine into dsh-plugin/engine/ (generated, gitignored)
npm run pack:plugin           # build + `npm pack --dry-run` + manifest checks
node scripts/test-dsh-plugin-core.mjs    # host-independent logic (no harness needed)
DSH_PACKAGES=<path to @deepseek-ai> node scripts/test-dsh-plugin-index.mjs
```

`core.mjs` holds everything host-independent (identity, discovery, subprocess results,
context rendering) so it is testable with plain node. `index.js` is the thin Cordis
layer. The index suite loads the real module, registers the tool against a stub `ctx`,
and **executes it against a real playbook on disk**; the bundle suite proves the shipped
engine is complete, clean of this repository's state, and can bootstrap a workspace. Both
skip cleanly when their prerequisites are absent, rather than failing for something the
checkout cannot fix.

## License

MIT
