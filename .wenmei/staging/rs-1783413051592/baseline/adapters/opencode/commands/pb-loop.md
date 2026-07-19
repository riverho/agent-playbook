---
description: Run one autonomous Agent-Playbook pass (orient → select → act → verify → record), deferring blocked tasks
agent: playbook
subtask: true
---

You are operating the Agent-Playbook loop. The playbook root is the directory
containing `playbook.yaml`.

Current state:

!`node scripts/pb.mjs status`

Run one autonomous pass over the backlog. Tasks whose checks fail are recorded
`blocked` and skipped — the run continues to the next claimable task and stops
only when nothing else can make progress:

!`node scripts/pb.mjs loop run --auto --defer-blocked`

Then report, in two or three sentences: how many tasks went `done`, which (if
any) are `blocked` and why, and whether the run finished `done` (backlog drained)
or `stalled` (remaining tasks all blocked / unmet deps). Do not claim a task is
done unless `pb` recorded it done — its acceptance_checks are the only gate.

$ARGUMENTS
