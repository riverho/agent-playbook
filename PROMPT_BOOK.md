# Agent-Playbook Prompt Book

> Copy-paste prompts for any agent you work with.  
> Start every prompt with **`agent-playbook`** so the agent knows which operating system to use.

Each prompt below tells you **when to use it** and **what the agent should do**.  
Keep this file open while you work; it is faster than typing vague natural-language instructions.

---

## 1. Setup

### `agent-playbook scaffold here`
**When:** Drop the playbook into the repo you are currently in.

```text
agent-playbook scaffold here at ./.agent-playbook
```

**Agent does:**
- Run `node scripts/pb.mjs scaffold --target ./.agent-playbook`
- Then `node scripts/pb.mjs init`
- Then `node scripts/pb.mjs validate`
- Report what was created and what still needs bridging.

---

### `agent-playbook bootstrap`
**When:** The playbook folder exists but has no runnable skills/processes yet.

```text
agent-playbook bootstrap
```

**Agent does:**
- Run `node scripts/pb.mjs bootstrap`
- Run `node scripts/pb.mjs validate`

---

### `agent-playbook init`
**When:** The engine is present but runtime files (`journal.ndjson`, `backlog.yaml`, etc.) are missing.

```text
agent-playbook init
```

**Agent does:**
- Run `node scripts/pb.mjs init`
- Run `node scripts/pb.mjs validate`

---

## 2. Orient

### `agent-playbook status`
**When:** Start of session, after context loss, before claiming work, or whenever you feel lost.

```text
agent-playbook status
```

**Agent does:**
- Read `playbook.yaml`, `SKILL.md`, and `memory/project-memory.md`
- Run `node scripts/pb.mjs status`
- Summarize: active loop, cycle goal, next task, guardrail state

---

### `agent-playbook anchor`
**When:** Mid-session drift, after compaction, or before a high-stakes action.

```text
agent-playbook anchor
```

**Agent does:**
- Run `node scripts/pb.mjs anchor`
- Restate the North Star and current cycle goal

---

## 3. Phase loop (cycle → reflect → close)

### `agent-playbook open phase`
**When:** You are starting a new chunk of work with a clear goal and stop condition.

```text
agent-playbook open phase "Refactor auth module" until "All tests pass and PR is open"
```

**Agent does:**
- Run `node scripts/pb.mjs loop new --goal "Refactor auth module" --stop "All tests pass and PR is open"`
- Run `node scripts/pb.mjs cycle --new --goal "Refactor auth module" --stop "All tests pass and PR is open"`
- Fill Q5 of the cycle brief (`memory/cycle.md`)
- Run `node scripts/pb.mjs status`

---

### `agent-playbook reflect`
**When:** End of a phase, end of day, or after a batch of tasks are done.

```text
agent-playbook reflect: summarize what was done since the last reflection, whether it advanced the North Star and cycle goal, and what carries into the next phase.
```

**Agent does:**
- Run `node scripts/pb.mjs reflect --notes "..."`
- Run `node scripts/pb.mjs report`

---

### `agent-playbook close loop done`
**When:** The phase is complete, no tasks are in progress, and you are ready to close the loop.

```text
agent-playbook close loop done
```

**Agent does:**
- Run `node scripts/pb.mjs validate`
- Run `node scripts/pb.mjs loop close --status done`
- Run `node scripts/pb.mjs report`

---

### `agent-playbook close loop failed`
**When:** The phase is contaminated and must be quarantined.

```text
agent-playbook close loop failed: reason "..."
```

**Agent does:**
- Run `node scripts/pb.mjs loop close --status failed --reason "..."`
- Run `node scripts/pb.mjs learn --loop <id> --source user --notes "..."`

---

## 4. Task loop (plan → claim → execute → verify → record)

### `agent-playbook plan`
**When:** You have a high-level goal and want the agent to formalize it into backlog tasks.

```text
agent-playbook plan "Add OAuth2 login" with checks:
- npm run test:oauth
- node scripts/pb.mjs validate
```

**Agent does:**
- Run `node scripts/pb.mjs plan --goal "Add OAuth2 login" --check "npm run test:oauth" --check "node scripts/pb.mjs validate"`
- Show you the generated task and its checks
- Ask you to approve or refine before execution

---

### `agent-playbook next`
**When:** You want to see the next task without claiming it.

```text
agent-playbook next
```

**Agent does:**
- Run `node scripts/pb.mjs next`

---

### `agent-playbook claim`
**When:** You are ready to start working on the next task.

```text
agent-playbook claim next task
```

**Agent does:**
- Run `node scripts/pb.mjs next --claim`
- Open the skill/process named by the task
- Read and repeat the acceptance checks

---

### `agent-playbook auto`
**When:** Tasks are shell-scriptable and you want the agent to run the loop without prompting each turn.

```text
agent-playbook auto run up to 5 tasks with 2 retries, dry-run first
```

**Agent does:**
- Run `node scripts/pb.mjs loop run --auto --max-tasks 5 --retry 2 --dry-run`
- Show the preview
- Wait for your approval before removing `--dry-run`

**Safer variant for fully automated runs:**

```text
agent-playbook auto run up to 3 tasks with 1 retry
```

---

### `agent-playbook done`
**When:** A task is finished and its checks pass.

```text
agent-playbook done T3: implemented OAuth2 login flow
```

**Agent does:**
- Run `node scripts/pb.mjs validate --task T3`
- Run `node scripts/pb.mjs record --task T3 --action execute --status done --notes "implemented OAuth2 login flow"`
- Run `node scripts/pb.mjs validate`

---

### `agent-playbook blocked`
**When:** A task cannot be completed and needs an unblocker.

```text
agent-playbook blocked T3: waiting for API credentials from platform team
```

**Agent does:**
- Run `node scripts/pb.mjs record --task T3 --action execute --status blocked --notes "waiting for API credentials from platform team"`

---

## 5. Verification

### `agent-playbook validate`
**When:** You want a quick health check of the playbook itself.

```text
agent-playbook validate
```

**Agent does:**
- Run `node scripts/pb.mjs validate`

---

### `agent-playbook check task`
**When:** You want to run one task's acceptance checks on demand.

```text
agent-playbook check task T3
```

**Agent does:**
- Run `node scripts/pb.mjs validate --task T3`

---

## 6. Frontend / design

### `agent-playbook check screen`
**When:** You have a rendered UI and want to compare it to the pencil/Figma/design mockup.

```text
agent-playbook check screen: compare the current rendered UI to the pencil/Figma design. Use the design-aesthetic skill. Report visual mismatches (spacing, color, typography, hierarchy, logo, interaction states, accessibility) as a prioritized checklist. Include screenshots if possible.
```

**Agent does:**
- Load the `design-aesthetic` skill
- Inspect the current screen and the design source
- Produce a prioritized checklist of fixes
- Optionally create backlog tasks with `pb plan` for each fix

---

### `agent-playbook design review`
**When:** Before finalizing a UI screen or flow.

```text
agent-playbook design review: review this screen/flow against the design system. Flag component fidelity, semantic color, visual hierarchy, and accessibility gaps. Propose fixes as backlog tasks.
```

**Agent does:**
- Run `node scripts/pb.mjs status` to know the loop context
- Apply the `design-aesthetic` skill
- Create `pb plan` tasks for each required fix

---

## 7. Reporting and packaging

### `agent-playbook report`
**When:** You want a human-readable rollup of recent work.

```text
agent-playbook report
```

**Agent does:**
- Run `node scripts/pb.mjs report`
- Show the path to the generated report

---

### `agent-playbook package loop`
**When:** A loop has graduated and you want a portable export of its data.

```text
agent-playbook package loop loop-20260618-001 into artifacts/exports/loop-20260618-001
```

**Agent does:**
- Gather loop metadata from `memory/loops.yaml`
- Filter `memory/journal.ndjson`, `memory/lessons.ndjson`, `memory/processes.ndjson` to that `loop_id`
- Copy `artifacts/loops/<loop_id>/`
- Copy the relevant `artifacts/reports/report-<date>.md`
- Write a `README.md` and `MANIFEST.json` inside the export folder
- Report the export path

> Note: this is a manual packaging workflow until `pb loop package` is implemented.

---

## 8. Troubleshooting

### `agent-playbook checkpoint`
**When:** Suspected drift, before context compaction, or before a long-running operation.

```text
agent-playbook checkpoint --snapshot
```

**Agent does:**
- Run `node scripts/pb.mjs checkpoint --snapshot`
- Summarize `memory/RESUME.md`

---

### `agent-playbook why blocked`
**When:** `pb next --claim` or `pb loop run --auto` refused and you want the reason.

```text
agent-playbook why blocked
```

**Agent does:**
- Run `node scripts/pb.mjs status`
- Run `node scripts/pb.mjs checkpoint`
- Read `memory/cycle.md` and `memory/loops.yaml`
- Explain the exact blocker and the fix

---

### `agent-playbook learn`
**When:** Something went wrong and you want to capture the lesson for the next loop.

```text
agent-playbook learn from loop loop-20260618-001: "OAuth2 redirect URL was wrong because we assumed localhost; always verify redirect URLs in staging"
```

**Agent does:**
- Run `node scripts/pb.mjs learn --loop loop-20260618-001 --source user --notes "OAuth2 redirect URL was wrong because we assumed localhost; always verify redirect URLs in staging"`

---

## Quick reference: prompt prefixes

| Prefix | Use when you want to... |
|--------|--------------------------|
| `agent-playbook scaffold` | install the playbook into a repo |
| `agent-playbook init` / `bootstrap` | create missing runtime files or skills |
| `agent-playbook status` | orient |
| `agent-playbook open phase` | start a new loop + cycle |
| `agent-playbook plan` | turn a goal into a task |
| `agent-playbook claim` | start the next task |
| `agent-playbook auto` | run the loop autonomously |
| `agent-playbook done` / `blocked` | record a task outcome |
| `agent-playbook validate` / `check task` | verify |
| `agent-playbook check screen` / `design review` | frontend/design review |
| `agent-playbook reflect` / `close loop` | end a phase |
| `agent-playbook report` / `package loop` | human rollup or export |
| `agent-playbook checkpoint` / `why blocked` / `learn` | troubleshoot |

---

## Rules for the agent

1. **Always re-anchor first.** Run `pb status` before acting if you are not sure of the current state.
2. **One task in progress at a time.** Finish or record `blocked` before claiming another.
3. **Done means exit code 0.** Never record `done` without running the task's acceptance checks.
4. **Record everything.** Use `pb record` for every terminal status.
5. **Preserve hand-edited formatting.** The playbook stores status in `memory/backlog-state.json`; do not rewrite `memory/backlog.yaml` just to update status.
