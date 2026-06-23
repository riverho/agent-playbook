---
phase: 7
started: "2026-06-23T03:02:32.612Z"
goal: "Stage 2 — composable pack indices. A mode/pack may carry its OWN skills + processes; the engine resolves skill/process lookups as (active_mode's skills_index/processes_index) UNION (engine globals). Prove it with a real second pack that mounts with ZERO engine (pb.mjs) changes. coding's pointers stay at the global files, so coding behavior is unchanged. Floor stays invariant; this is pure composition over the modes seam built in phase 6."
stop: "skillFor/validate/list resolve from active_mode UNION engine; a pack-local skill resolves only under its mode; packs validated as carry-on (no deps inside a pack); a demo pack mounts and exposes its skill with NO pb.mjs change; every task checker .mjs green; pb validate green; recorded done; reflect."
---
# Cycle Brief — phase 7

> Confirm this at the START of each phase, before claiming work. The North Star does
> not change; this cycle's goal does. Fill all five, then `node scripts/pb.mjs status`.

## 1. What is this cycle's goal?
Stage 2 — composable pack indices. A mode/pack may carry its OWN skills + processes; the engine resolves skill/process lookups as (active_mode's skills_index/processes_index) UNION (engine globals). Prove it with a real second pack that mounts with ZERO engine (pb.mjs) changes. coding's pointers stay at the global files, so coding behavior is unchanged. Floor stays invariant; this is pure composition over the modes seam built in phase 6.

## 2. What challenges do I foresee?
(pre-mortem: what is most likely to go wrong this phase)

**Resolution must be a UNION, and coding must be unchanged.** `skillFor` (pb.mjs:496), validate's
index reads (~631-666), and `cmdList` (~1633) read the global indices only. Route them through
`active_mode.skills_index/processes_index ∪ engine globals`. coding's pointers already AT the
global files, so its union == globals == no change. Guard this with a regression: existing
skills (harden, nl, run-task) must still resolve under coding.

**Additive, not override.** A pack adds skills; it should not shadow/break engine skills. On id
collision, decide one rule (engine wins, or pack wins) and test it. Default: pack entries are
additive; engine ids stay resolvable.

**The proof is "ZERO pb.mjs change."** The demo pack must mount purely from YAML — if making it
work needs engine edits, the seam is wrong. The demo-pack test asserts resolution works from data
alone (no demo-specific branch in pb.mjs).

**Carry-on per pack.** A pack is pure md+yaml — no package.json/node_modules inside a pack dir.
Validation must enforce this the day packs land, or "carry-on" rots.

**Don't break phase-6.** Modes resolution, anchor injection, atomic claim, routing all stand;
this phase only adds index composition. Run full `npm test` each task.

## 3. What were the previous challenges?
Phase 6 shipped the modes seam (directive + principles + resolution) and the multi-agent floor
(agent_id, per-agent WIP, atomic claim, mode routing), each with a behavioral test, full
regression green throughout. The Stage-2-ready pointers (`skills_index`/`processes_index` on each
mode) were placed in phase 6 precisely so this phase is a repoint + resolver change, not a rewrite.
A per-task test caught a real duplicate-declaration bug before record — keep that discipline.

## 4. Where do I stop / hand back?
skillFor/validate/list resolve from active_mode UNION engine; a pack-local skill resolves only under its mode; packs validated as carry-on (no deps inside a pack); a demo pack mounts and exposes its skill with NO pb.mjs change; every task checker .mjs green; pb validate green; recorded done; reflect.

## 5. Conflicts with my own (agent) memory?
No conflict. This phase continues the phase-6 arc: turn the engine domain-pure by letting packs
carry their own skills/processes. The North Star ("done = verified exit code") and the floor are
untouched; this is composition over the existing modes seam.
