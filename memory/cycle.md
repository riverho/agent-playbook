---
phase: 28
started: "2026-07-05T18:22:50.494Z"
goal: "L1 Pack artifact (v0.3.6): a mode leaves the repo as a file and comes back alive"
stop: "All 8 seeded tasks done by exit code; test-pack-roundtrip.mjs green; full suite green"
---
# Cycle Brief — phase 28

> Confirm this at the START of each phase, before claiming work. The North Star does
> not change; this cycle's goal does. Fill all five, then `node scripts/pb.mjs status`.

## 1. What is this cycle's goal?
L1 Pack artifact (v0.3.6): a mode leaves the repo as a file and comes back alive

## 2. What challenges do I foresee?
- Sub-agents (codex/opencode) claim "done" in prose — gate everything on the task acceptance_checks run by the orchestrator, never on their transcripts (finding-is-hypothesis).
- pack install mutates playbook.yaml modes: map + modes/index.yaml — the bidirectional pb validate guard must stay green after every install test; sandbox all install tests in scratch copies.
- Tarball paths: absolute-path / out-of-dir refusal in pack build is easy to get subtly wrong; test with hostile fixtures, not just the happy path.
- Parallel sub-agents editing scripts/pb.mjs concurrently will conflict — serialize pb.mjs-touching tasks (alias, install), parallelize only disjoint files.

## 3. What were the previous challenges?
- From loop-20260705-002 reflect: (a) lib extraction broke sandboxing tests' file manifests — when adding scripts/lib or new dirs, update test manifests; (b) validation must run AFTER injection (finding-3 lesson); (c) the full suite catches what unit checks miss — run npm test before recording done on anything touching pb.mjs.

## 4. Where do I stop / hand back?
All 8 seeded tasks done by exit code; test-pack-roundtrip.mjs green; full suite green

## 5. Conflicts with my own (agent) memory?
No conflict. Host memory says codex crashed on this machine (2026-07-05 session); smoke-tested this session — codex exec now exits 0, fix applied. Treating the live probe as truth. The plan doc lives at docs/pb-improvements-04072026.md in-repo (a copy exists in the harness skill dir; the in-repo copy is canonical per carry-on rule).
