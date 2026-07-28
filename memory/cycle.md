---
phase: 31
started: "2026-07-21T17:19:04.870Z"
goal: "Fresh Orca-spine enrichment for Agent-Playbook: PB owns worker worktree protocol, portable RunCards, checker gates, provider cooldown, and JSON surfaces for Wenmei integration."
stop: "Backlog is experiment-specific, acceptance checks pass, implementation committed in feat/orca-worker-runcard-spine, source main untouched."
---
# Cycle Brief — phase 31

> Confirm this at the START of each phase, before claiming work. The North Star does
> not change; this cycle's goal does. Fill all five, then `node scripts/pb.mjs status`.

## 1. What is this cycle's goal?
Fresh Orca-spine enrichment for Agent-Playbook: PB owns worker worktree protocol, portable RunCards, checker gates, provider cooldown, and JSON surfaces for Wenmei integration.

## 2. What challenges do I foresee?

The main risk is duplicating Wenmei/Orca runtime concepts inside PB instead of making PB the small protocol/truth layer. Keep the slice minimal: schema, JSON surfaces, dry-run worker lifecycle, checker verdicts, provider cooldown metadata, and tests. Do not import UI/product bloat.

## 3. What were the previous challenges?

The stale source backlog contained unrelated pack/review debt. River explicitly approved a fresh-start Agent-Playbook worktree, so the old backlog was archived and this loop should only carry Orca/Wenmei protocol-enrichment tasks.

## 4. Where do I stop?

Stop when the fresh backlog is drained, acceptance checks pass, PB validate is green, the implementation is committed on feat/orca-worker-runcard-spine, and the source main worktree remains untouched. No push/release/tag unless River asks.

## 5. Do I have any conflicting memory?

None. River approved switching agents/resources at will and applying the five-hour retry rule if a real provider rate limit occurs.
