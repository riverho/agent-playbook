# Agent-Playbook — Architecture Review

**Date:** 2026-06-16
**Scope:** the whole engine — `playbook.yaml`, `scripts/pb.mjs`, `SKILL.md`, `memory/*`, `processes/*`, `skills/*`, `README.md`, `INSTALL.md`, `HANDOFF-2026-06-11.md`.
**Method:** read every core file, **ran the CLI**, and built controlled experiments in a throwaway copy to attack the system's central claim. Evidence is reproducible (Appendix A).
**Lens:** Context / Harness / Loop — the three axes of everything you wrap around a stateless model — plus one question applied to every boundary: *does it behave like a selective membrane, or a permissive echo chamber?*

---

> **Status — 2026-06-16 (plan executed).** Every review recommendation doable in-repo is implemented and verified by a real acceptance check: the hollow-check detector (`scripts/check-hollow.mjs`) + a fixation rule; tri-state `pb report`; README led by the gate; phase-loop docs synced; the harden classifier note; `project-memory` budget + selective `anchor`; cycle-brief Q5 enforcement; a concurrency smoke test. Backlog: **10 done, 2 blocked** — `T4` (summon-forge learning case) and `T6` (journal evidence) need the summon-forge repo, which is not mounted here. `pb validate` is green and `check-hollow` reports 0 actionable hollow gates. See §8 for the ticked checklist.

## 1. Verdict

The kernel is real, and it is the rare kind that ages *well*: **"done" is an exit code, not a sentence.** I verified that `pb record --status done` genuinely re-runs a task's `acceptance_checks` and **refuses** when they fail. As agents get more autonomous, a gate that blocks false victory gets *more* valuable, not less. This is the durable core, and it is well built.

But the same experiments exposed the thing that undercuts the entire thesis: **when a task's check is tautological, the gate goes green without the work being done — and now it wears a ✓ badge that makes the lie look more trustworthy than honest prose would.** In this repo, **6 of 7 backlog tasks** use `node scripts/pb.mjs validate` (a *structural* check) as their *only* acceptance check. For those tasks, "enforced done" silently degrades back into "declared done."

Structurally, the system is **over-invested in the Loop** (anti-drift machinery the host harness now absorbs), **thin on the Harness**, and **barely engineers Context at all** — which is ironic for what is, at root, a context-management tool for agents.

There is a second hole one level up, and it is the **same disease**: the playbook has **no North Star and no reflection step**. `reflect` appears zero times in the repo, and no field anywhere states where the project is headed. So the *learning loop is open* — purpose never enters, evidence is never compared against it, nothing is written back — even though the playbook explicitly claims to "learn." A system that ran for days and never noticed its own hollow checks is one that *cannot self-correct, because it cannot reflect.*

Priority: the hollow check and the open loop are **one failure seen twice** — motion without a gradient. Fix them first; everything else is secondary.

---

## 2. How to read this review (the C/H/L frame)

A language model is a stateless function: tokens in, tokens out, nothing remembered between calls. Everything that turns it into an *agent* lives **outside** the model, along three axes:

| Axis | Governs | In this playbook |
| --- | --- | --- |
| **Context** | what is in the window *now* (a frame) | `anchor`, `status`, `project-memory.md` — loaded wholesale |
| **Harness** | the apparatus: tools, permissions, I/O (the body) | the `pb` CLI + YAML conventions, riding the host runtime |
| **Loop** | the dynamics over time (the sequence of frames) | the six-step loop, the done-gate, anchor/checkpoint/drift |

The three are one substrate (externalized cognition around a stateless core) seen along three dimensions. A good review asks which axis is over- and under-built — and whether each boundary keeps a *gradient* alive (a true membrane lets the right things through and is changed by them) or collapses into sameness (an echo chamber: a filter that only ever confirms itself). The done-gate is supposed to be a membrane between *work-done* and *work-not-done*. The hollow check turns it into an echo chamber that says "pass" to everything.

---

## 3. Evidence (reproducible)

### 3.1 The engine works, and the gate is real
`pb validate` is green on the real repo; `status` and `list` work. The refusal path fires correctly:

```
$ pb record --task TFAIL --action execute --status done   # work NOT done
Running 1 acceptance check(s) for [TFAIL] before recording done:

Refusing to record [TFAIL] as done — acceptance checks failed.
Fix the work, or record --status blocked with notes. (--skip-checks overrides, and is stamped on the entry.)
  FAIL  test -f DID_THE_WORK.txt
exit=1
```

The escape hatch is honest — the skip is stamped on the journal entry and flagged in reports (`⚠checks-skipped`):

```
$ pb record --task TFAIL --status done --skip-checks
WARNING: recording done with 1 acceptance check(s) SKIPPED. The journal will say so.
Recorded [TFAIL] execute → done (checks: skipped)
exit=0
```

### 3.2 The gate is hollow when the check is tautological
A task representing "reposition the pitch (README never touched)" whose only check is `pb validate`:

```
$ pb record --task TVACUOUS --action execute --status done   # README untouched
Running 1 acceptance check(s) for [TVACUOUS] before recording done:
  PASS  node scripts/pb.mjs validate
Recorded [TVACUOUS] execute → done (checks: passed)
exit=0
```

Recorded **done, checks: passed** — with a green ✓ — though no work was done. This is not hypothetical: **your own `T2`** ("Record one durable project fact") was recorded `done / checks: passed`, yet its check (`pb validate`) cannot verify whether a fact was actually added. The badge attests to nothing.

### 3.3 How widespread (the detector, run against your real backlog)
```
  ID     STATUS        GATE QUALITY               TITLE
  --------------------------------------------------------------------------
  T1     done          HOLLOW (structural-only)  Smoke-test the playbook loop end to en
  T2     done          HOLLOW (structural-only)  Record one durable project fact in mem
  T3     todo          HOLLOW (structural-only)  Reposition pitch around the verificati
  T4     todo          REAL   (tests the work)   Run the summon-forge learning case
  T5     todo          HOLLOW (structural-only)  Fix journal append atomicity in pb.mjs
  T6     todo          HOLLOW (structural-only)  Replace essay argument with journal ev
  T7     todo          HOLLOW (structural-only)  Document the harden-step classifier li
  --------------------------------------------------------------------------
  6 hollow gate(s) total; 4 on actionable tasks.
```

Only `T4` writes a check that tests the task's actual outcome (the summon-forge journal holding ≥4 entries).

### 3.4 The learning loop is open (grep receipts)
Searching the whole repo:

```
reflect | reflection                    → 0 matches
north star | objective | goal | mission → 0 (only process `purpose:`, README "## Why", LICENSE)
```

- `CLAUDE.md` says only *"Read SKILL.md before acting. Read project-memory.md second."* — it carries the engine's description, **no objective and no duty to reflect.** Both `CLAUDE.md` and `AGENTS.md` are `.gitignore`d (lines 9–10): local pointer files, not tracked source.
- The pointer is **one-way**: `install.yaml` writes a *"Playbook Loop Layer"* note **into** `CLAUDE.md`/`AGENTS.md` pointing back at the playbook. Nothing flows the other way — no objective read in, no evidence written back.
- The only writeback channel is `project-memory.md` rule 5 ("add what you learn") — manual, honor-only, storing operational *facts* (a binary's path), not reflective learning, gated by nothing.
- `pb anchor`, re-injected every turn, prints the `fixation` (method invariants) and **no purpose** — because no purpose field exists. Method is refreshed every turn; the goal is refreshed never.

---

## 4. What's done right

**The kernel — done-as-exit-code.** `acceptance_checks` are shell commands; `record --status done` re-runs them and refuses on failure (§3.1). This is a *verification gate*, not a model-capability patch, so it doesn't rot as models improve. In membrane terms it is a real, selective boundary on the Loop's most important state transition (`in_progress → done`), conditioned on truth rather than prose.

**An honest escape hatch.** `--skip-checks` is the one bypass, and it is *visible* — stamped in the journal, flagged `⚠checks-skipped` in reports. The gradient survives even when the gate is bypassed, because the bypass cannot hide. Good design.

**Taste and restraint.** The earlier spec/Work-Map/DAG/debt-ledger layer was cut to `attic/` with the note "bureaucracy cosplaying as machinery." Earning complexity against demonstrated need (rather than anticipation) is exactly right, and rare.

**Operational maturity.** The malformed-master `try/catch` so hook-invoked `anchor`/`checkpoint` never crash a session; format tolerance (YAML *or* JSON); master-driven path resolution with fallbacks; a single dependency (`js-yaml`); genuinely relocatable "carry-on" layout. These are the marks of someone who has run the thing in anger.

**Honest self-assessment.** `HANDOFF-2026-06-11.md` already diagnoses that the anti-drift machinery ages badly and the gate ages well. The author is not fooling himself — which is why this review can go straight to the unresolved part.

---

## 5. What's wrong

### P0 — The hollow check (the headline)
6/7 tasks gate "done" on `pb validate`, which only proves the *playbook* is well-formed, never that the *task* was accomplished (§3.2–3.3). The failure mode is worse than having no gate: a missing gate produces honest uncertainty, while a hollow gate produces **false confidence with a green badge.** The report's `✓checks` becomes a signal you cannot trust. This is the membrane losing selectivity and becoming an echo chamber — the ritual of verification without the discrimination. And it lands precisely on the system's reason to exist.

### P0 — The learning loop is open (no North Star, no reflection, no writeback)
The same disease, one level up. No field anywhere states the project's North Star, and `reflect` appears zero times in the codebase (§3.4). Three joints of the virtuous cycle are all severed: **purpose never enters** (no goal in the anchored layer), **nothing compares evidence to purpose** (no reflection step), and **nothing is written back** (the one channel, project-memory rule 5, is manual, honor-only, and stores facts, not learning).

This could be a defensible scope choice — *"planning is the human's job"* — except the playbook **explicitly claims to learn** (`SKILL.md`: "that's how the playbook learns"; rule 5: "grow as you learn"). Advertising learning while omitting reflection is internally contradictory: it has the *vocabulary* of learning (append a fact, write a skill) without the *operation* (compare outcome to intent, then change the plan). The proof is empirical — it ran for days and never surfaced its own hollow checks; an external review had to. Absent self-correction is the signature of absent reflection.

A subtlety for the fix: the North Star must **not** live only in `CLAUDE.md`. The host loads `CLAUDE.md` once at session start, after which it decays out of context; `pb anchor` re-injects only the fixation, never `CLAUDE.md`. Put purpose where method already lives — `playbook.yaml`, re-anchored every turn — and have `CLAUDE.md`/`AGENTS.md` point at it.

And one altitude is missing entirely. A North Star is an *invariant*; real projects also run in **phases**, each with a *cycle goal* that shifts as team discussions and agent/sub-agent handoffs come back. The playbook has no phase layer and no **forward** brief — only, once fixed, a backward `reflect`. Re-confirming purpose every turn is not the same as re-confirming *this cycle's* purpose before the cycle begins.

### P0 — Two memories, no arbiter (folder vs. agent/host memory)
There are two memory systems and nothing reconciles them. **Folder memory** (`north_star`, `memory/`) is the project's — forward-looking, versioned, shared, portable. **Agent/host memory** is the runtime's — summaries of past sessions, backward-looking, private, and *not* carried in the folder. They will disagree (a goal restated in an old chat vs. the current `north_star`). Why this is a P0, not a nicety:

- **It silently breaks carry-on.** The promise is "copy the folder, get the same behavior." But if host memory colors how the agent reads the goal, behavior is a function of the folder *plus* an invisible layer that doesn't travel. Same folder, a different machine or a fresh agent → different behavior.
- **The drift is untraceable.** The journal records actions, not "the agent believed X from old memory." A conflict can drive behavior with no paper trail — the worst kind.
- **It inverts time.** Host memory is the past; the playbook is the future. With no arbiter, the past silently overwrites the future.

The fix is the fixation principle extended to memory: for project matters the folder outranks host memory; host memory is context, not authority; on conflict you *surface* it rather than silently resolve it. Since `pb anchor` is the only thing re-injected every turn, that rule must live there — not in `CLAUDE.md`, which loads once and decays.

### P1 — Two silent escape valves, not one
The honest bypass (`--skip-checks`, flagged) is fine. The *un*-flagged degradations are: (a) **no checks** — `record` warns but still exits 0; and (b) **tautological checks** — fully green, no `⚠`. Valve (b) is invisible in the report, so `✓checks` and `⚠checks-skipped` are not exhaustive: a third, hidden state ("verified nothing") masquerades as the first.

### P1 — Thin, self-referential evidence
The journal holds three real entries; backlog `T3–T7` are mostly about improving the playbook's *own* pitch and docs. A system whose thesis is "you need usage, not benchmarks" has very little usage, and most of it is the tool working on itself. The one outward-facing task (`T4`, summon-forge) is the only one with a real check — and it is still `todo`. (The author flags this in HANDOFF S2/S4; restating because it is the real risk, above any design flaw.)

### P2 — Documentation entropy
The loop ("orient → select → act → verify → record → report") is restated in **seven** places: `playbook.yaml`, `SKILL.md`, `README.md`, `AGENTS.md`, `project-memory.md`, `skills/run-task/SKILL.md`, `processes/run-task.yaml`. They agree today; they will drift. For a system whose whole point is a single fixation, the prose has no single source of truth.

### P2 — Journal append atomicity
`pb record` appends to `memory/journal.ndjson` with no locking, while "one task in_progress **per agent**" advertises concurrency. Self-identified as `T5`; real, lower-frequency.

---

## 6. The C/H/L verdict (the structural read)

**Loop — over-built; conflates two different jobs.** It bundles (a) *orientation* (anchor, checkpoint, drift detection, per-turn re-injection) with (b) *state-transition gating* (the done-gate). Job (a) ages badly — modern harnesses ship native task state, memory, and compaction summaries, absorbing it (HANDOFF concedes this). Job (b) is the durable kernel. **Split them, lead with (b), demote (a) to "table stakes."** And note a *third* job neither covers: a **teleological membrane** — a step that asks whether the tasks just closed actually advanced the goal. Orientation keeps you on the path; the gate keeps you honest about one task; nothing keeps the *path itself* aimed at the destination. That missing step is reflection. Worse, only one *timescale* is engineered: the per-task loop exists, but the per-phase loop — a forward brief and a backward reflect bracketing each phase — does not, though the cycle goal shifts between phases even when the North Star holds. Vision, cycle goal, task are three altitudes; the playbook operates only the lowest.

**Harness — thin, and that is both the moat and the risk.** It is a portable CLI riding on whatever runtime hosts it; it has no tool/permission layer of its own. Portability is the *one* differentiator a host harness cannot absorb (a carry-on folder runs identically under Claude Code, Codex, cron, or CI). Lean into that explicitly — but stop calling it more than it is: conventions plus one script.

**Context — barely engineered; the biggest gap, and the ironic one.** A tool for managing an agent's context does almost no context *engineering*. `anchor`, `status`, and `project-memory.md` are loaded **wholesale and statically**, every session — and `project-memory.md`'s rule 5 tells you to *grow it as you learn*, i.e. unbounded monotonic growth. The "anchor" will become a context dump, the opposite of selective permeability; as it grows it will manufacture the very drift it exists to prevent. The mechanism that decides *what enters the window each turn* has no selectivity. **This is the axis to invest in next, and it is exactly the membrane design the whole project is a metaphor for.**

One line: **Loop is maxed, Harness is just-enough, Context is nearly blank — and Context is the face that should be strongest.**

---

## 7. Improvement plan (prioritized)

> **Implementation status (2026-06-16).** The phase-loop and memory-precedence fixes below are now built and verified in this repo: `playbook.yaml` carries a `north_star` and two new fixation rules; `pb cycle` and `pb reflect` exist; `pb anchor` re-injects North Star + cycle goal/stop + the memory-precedence rule every turn; `pb checkpoint` warns on a missing/stale brief and on "N done since last reflect"; `memory/cycle.md` holds the five-question brief. Verified by running the loop end to end (brief → reflect → stale-detection), with `validate` green. The hollow-check detector (Appendix B) ships as documented but is not yet wired in as a guardrail.

### P0 — Close the hollow-check loophole *(ship the detector; it's written and tested)*
1. **Add the detector** (Appendix B) as `scripts/check-hollow.mjs`, or fold its logic into `pb validate` as a non-fatal warning + a `--strict` fatal mode.
2. **Make it self-applying** — give *its own* backlog task a real check, so the recommendation eats its own dog food:
   ```yaml
   - id: T8
     title: Detect and forbid hollow acceptance_checks
     status: todo
     skill: run-task
     priority: 1
     acceptance_checks:
       - node scripts/check-hollow.mjs .      # exits 1 while any actionable task is hollow
   ```
3. **Backfill real checks** for `T3, T5, T6, T7`. Examples that test the *work*:
   - `T3` (reposition README): `grep -q "exit code, not prose" README.md && head -40 README.md | grep -qi "acceptance"`
   - `T5` (atomic append): a concurrency smoke test script that exits 0 only when N parallel `record`s yield N well-formed lines.
   - `T7` (harden docs): `grep -q "classifier" skills/harden/SKILL.md INSTALL.md`
4. **Add a fixation rule** to `playbook.yaml`: *"A task's acceptance_checks must test the task's own artifacts. `pb validate` alone is not a task check."*

### P0 — Close the learning loop (North Star + reflect + writeback)
Three small additions, one per severed joint — sized to match the taste that moved the DAG layer to `attic/`, not to regrow it:
1. **One field.** Add `north_star:` (one sentence) to `playbook.yaml`; have `pb anchor` re-inject it alongside the fixation. Purpose now refreshes every turn, exactly like method. `CLAUDE.md`/`AGENTS.md` only point at it.
2. **One command.** Add `pb reflect`: print the tasks recorded `done` since the last reflection + their journal notes + the `north_star`, and force one question — *did these advance it, and what should change?* Record the answer as an `action: reflect` journal entry. Judgment can't be gated by an exit code (don't build another hollow check), so make its **absence** detectable instead: `pb checkpoint` drift adds *"N tasks done since last reflect."*
3. **Close the writeback.** A reflection that yields a durable change writes to `project-memory.md` (tracked); if it changes direction, it updates `north_star` in `playbook.yaml`. The open line becomes a loop.

**Two nested loops.** Those three close the *task* loop around an invariant North Star. Real work also needs an outer **phase** loop, because the cycle goal shifts between phases (team discussions, sub-agent returns) even when the North Star holds. Bracket each phase with a forward brief and the backward reflect:

4. **A cycle brief (forward).** At each phase start, confirm `memory/cycle.md` answering four questions — *(1) this cycle's goal, (2) foreseen challenges, (3) previous challenges, (4) where I stop.* `pb anchor` re-injects (1) and (4) every turn alongside the North Star; (3) is seeded from the last cycle's `reflect`. Don't bury this as prose in `CLAUDE.md` — it decays out of context and is honor-only (same disease); make it a disk artifact and let `pb checkpoint` warn when a task is claimed under a missing or stale brief. The brief is the re-confirmation point: a human (or lead agent) reconciles divergence and confirms intent at phase edges while the inner task loop stays autonomous — and question 4 doubles as a stop fence, the declared hand-back point that cures run-on autonomy.

Two small fields, two small commands (`reflect`, `cycle`), two drift warnings — the outer loop wrapping the inner. Still no DAG, no gate theater.

### P0 — Arbitrate the two memories *(implemented)*
A fixation rule now declares folder memory authoritative over host memory for project matters, `pb anchor` re-injects it every turn, and the cycle brief's fifth question forces the agent to name any conflict between its own memory and the North Star/goal — moving that reconciliation onto disk, where it is visible and carry-on-safe. What is left is teeth: a conflict the agent surfaces is still resolved on honor. A future step could require the brief's question 5 to be non-empty (even just "none") before `pb cycle` considers the phase opened, so "I checked my memory against the folder" leaves a trace.

### P1 — Make `✓checks` trustworthy (tri-state reporting)
Teach `pb report` three gate states instead of two: `✓verified` (real check passed), `·honor` (no checks), `⚠hollow` (structural-only). Right now "verified nothing" renders identically to "verified the work." The report is the human-facing membrane; give it selectivity.

### P1 — Reposition around the gate (your `T3`) — but in the right order
Lead the README/essay with the refusing `record`; demote anchoring to a supporting paragraph. **Caveat:** do P0 first. Marketing the gate while 6/7 of your own gates are hollow is a credibility risk — fix the substance, then make the claim.

### P1 — Engineer the Context axis (the strategic bet)
- **Bound `project-memory.md`.** Add a size/segment budget and a tiering rule (hot facts always loaded; cold facts indexed and pulled on demand).
- **Make the anchor selective.** `anchor`/`status` should assemble *task-relevant* context (the claimed task, its checks, its skill, the last journal entries for it) rather than dumping the whole constitution every turn.
- **Add eviction/compaction** for memory, so "the playbook learns" (rule 5) does not mean "the playbook bloats." This is the difference between a membrane and a flood.

### P2 — Atomic journal append (your `T5`)
A single `appendFileSync` of one complete line is *mostly* atomic on one volume, but verify O_APPEND on Windows; otherwise add an in-process write queue or document a single-writer constraint and add a concurrency smoke test (then make that test `T5`'s acceptance check).

### P2 — Single-source the loop description
Keep the canonical loop in `playbook.yaml` only; have the other six docs *point* to it (or generate their copy). One fixation, one statement of the loop.

### P2 — Earn outward evidence
Run `T4`. A single real instance of `record` refusing a premature "done" *in someone else's codebase* is worth more than the entire essay.

---

## 8. Definition of "near-perfect" (acceptance checks for this review)

Eating the dog food: the recommendations themselves get executable gates. This review is "done" when —

- [x] `node scripts/check-hollow.mjs .` exits 0 (no actionable task has a hollow gate).
- [x] `pb report` distinguishes `⚠hollow` from `✓verified`.
- [x] `playbook.yaml` `fixation` forbids `pb validate` as a sole task check.
- [x] `project-memory.md` has a stated growth bound / tiering rule.
- [ ] `T4`'s journal shows ≥4 entries (real outward usage exists). — **blocked:** summon-forge not available in this environment.
- [x] `playbook.yaml` declares a `north_star`, and `pb anchor` re-injects it every turn.
- [x] `pb checkpoint` warns when tasks have been completed with no `reflect` since.
- [x] each phase opens with a confirmed cycle brief (goal / foreseen + prior challenges / stop condition); `pb checkpoint` warns when one is missing or stale.
- [x] `playbook.yaml` fixation declares folder-over-host memory precedence, and `pb anchor` re-injects it every turn.

A verification system whose own review ships with verification — and a learning loop that closes at two timescales, per task and per phase. That is the bar.

---

## Appendix A — Reproducing the evidence
```bash
# baseline
node scripts/pb.mjs validate && node scripts/pb.mjs status

# the gate is real: a failing check is refused (exit 1)
#   add a task whose check is `test -f DID_THE_WORK.txt`, then:
node scripts/pb.mjs record --task TFAIL --action execute --status done           # REFUSED

# the gate is hollow: a `pb validate`-only check passes with no work done
node scripts/pb.mjs record --task TVACUOUS --action execute --status done        # PASSES

# how widespread:
node scripts/check-hollow.mjs .

# is there a North Star or any reflection? (both come back empty in live files)
grep -ri 'reflect\|north star\|objective\|goal\|mission' .
```

## Appendix B — `scripts/check-hollow.mjs` (written and verified against this repo)
```js
#!/usr/bin/env node
// pb lint:checks — detect HOLLOW acceptance_checks: a "done" gate that tests
// only playbook *structure* (pb validate) and not the task's actual work.
// Exit 1 if any actionable (todo/in_progress) task has a hollow gate.
import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';
const ROOT = process.argv[2] || '.';
const bl = yaml.load(readFileSync(ROOT + '/memory/backlog.yaml', 'utf8')) || {};
const structuralOnly = (c) =>
  /(^|\s)(node\s+scripts\/pb\.mjs|pb(\.mjs)?|npm\s+run)\s+validate\b/.test(c.trim()) && !/--task/.test(c);
let hollow = 0, actionableHollow = 0;
console.log('  ID     STATUS        GATE QUALITY               TITLE');
console.log('  ' + '-'.repeat(74));
for (const t of bl.tasks || []) {
  const checks = (t.acceptance_checks || []).filter((c) => typeof c === 'string' && c.trim());
  let cls;
  if (!checks.length) cls = 'NONE   (honor-only)     ';
  else if (checks.every(structuralOnly)) {
    cls = 'HOLLOW (structural-only)'; hollow++;
    if (['todo', 'in_progress'].includes(t.status)) actionableHollow++;
  } else cls = 'REAL   (tests the work) ';
  console.log(`  ${String(t.id).padEnd(6)} ${String(t.status).padEnd(13)} ${cls}  ${(t.title || '').slice(0, 38)}`);
}
console.log('  ' + '-'.repeat(74));
console.log(`  ${hollow} hollow gate(s) total; ${actionableHollow} on actionable tasks.`);
process.exit(actionableHollow ? 1 : 0);
```

*Heuristic, not a proof: it catches the `pb validate`-only pattern that dominates this backlog. Extend the denylist (e.g. `true`, `echo`) and consider warning on any check that names no file, script, or test.*
