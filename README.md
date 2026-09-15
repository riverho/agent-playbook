# Agent-Playbook

**English** · [繁體中文](#繁體中文)

Current release: **v0.5.0** — **multi-agent leases**, complete **worktrees**, crash recovery, and the
**DeepSeek Harness plugin**. On npm as [`agents-playbook`](https://www.npmjs.com/package/agents-playbook)
· [what's in it](#whats-in-v050).

> **Done is an exit code, not prose.** The kernel is a `pb record --status done` that re-runs each
> task's `acceptance_checks` (shell commands) and *refuses* on failure. Anchoring, the North Star
> (`north_star`), the cycle brief, and carry-on portability all *support* that verification gate —
> they do not replace it. If a check is tautological, the gate is hollow; see `scripts/check-hollow.mjs`.

A **portable, agent-first playbook**. Drop it into any folder and an agent can run it in a loop
without friction: orient on a master file, pick a task, do the work, prove it with **executable
acceptance checks**, record, and roll the records up into a human-readable report. Everything
lives inside the folder — copy it anywhere and it still works (carry-on).

## Why

Agents lose the thread between sessions, drift from process, and — worst of all — declare work
"done" without proof. This playbook fixes all three with the minimum machinery that actually works:

1. **One master** everything re-anchors to (`playbook.yaml`, the "fixation"), kept salient by
   cheap re-injection (`pb anchor` + runtime hooks), so long context and compaction never lose the plot.
2. **Enforced done.** A task's `acceptance_checks` are shell commands. `pb record --status done`
   runs them and **refuses to record** if any fail. Exit codes keep the loop honest — process
   documents don't.
3. **Durable state on disk** (backlog, append-only journal), so context loss never means work loss.

That's the whole thesis. No specs pipeline, no DAG scheduler, no debt ledger — the playbook earns
complexity only when a real workload demands it.

## What's in v0.5.0

The release that turned a single-agent loop into a shared one. Existing single-agent playbooks keep
working unchanged — `pb next --claim`, `pb record` and `acceptance_checks` behave as before.

### Multi-agent leases and attributable writes

The gap this closes: with several agents on one backlog, nothing could say **who wrote first, who
wrote last, or on whose behalf** — fan-out silently overwrote itself, and a sub-agent had to
impersonate its parent to record anything.

- **One serialized transaction for all shared state** — O_EXCL lock, re-read inside the critical
  section, atomic replace. The previous read-modify-write of the whole object discarded concurrent
  writers' changes; proved by mutation, since disabling the lock turns the regression suite red with
  real lost updates.
- **Ordering is recorded, not inferred.** Every journal row carries a monotonic `seq` and its
  writer, and the row and the state touch commit in one transaction — so the two records can never
  disagree about who wrote last.
- **A claim is a lease.** `pb next --claim` mints a **claim token**. A writer proves entitlement three
  ways: it is the holder, it presents the token, or the holder appears in its declared delegation
  chain. A sub-agent therefore records **as itself**, with `ownership: token|chain`.
- **Unproven writes are flagged, not dropped** (`ownership: unproven`) — losing real work is worse
  than an unproven row.
- **Locks break on age only**, never on a liveness probe: a pid probe misreported live holders as
  dead on Windows, letting a waiter steal an active lock. `pb release` returns a claim to the pool;
  `pb unlock --force` is the escape hatch.

→ full detail under [Multi-agent](#multi-agent-claims-are-leases-writes-are-attributable)

### The DeepSeek Harness plugin

[`dsh-plugin/`](dsh-plugin/README.md) brings the loop into the harness: one `playbook` tool
(status / anchor / next / claim / task / check / record / worker / init / unlock / repair), the
playbook's own skills registered as harness skills (`playbook-<id>`), and the constitution — North
Star, active loop, task in hand and **its checks** — staged on the agent's inbox before every step,
so compaction cannot lose the plot.

It **bundles the engine** (one install, no version to keep in step by hand) and **never
re-implements a gate** — every action is a `pb` invocation, run as a subprocess so the exit code
stays the contract and a refusal can never terminate the host.

→ full detail under [DeepSeek Harness plugin](#deepseek-harness-plugin)

### Also in this release

| Area | What shipped |
| --- | --- |
| **Worktrees** | Atomic acquisition — one live slot per task — plus `status / exec / verify / merge / remove`; a merge gate that reads the **branch** (missing, dirty, or zero commits ahead ⇒ refused); `record --at <worktree>` for checks that ran in the worker tree. |
| **Crash recovery** | `pb repair-state --check` (exit 1 on drift, CI-wireable) and `--apply`, which rebuilds the projection from the journal; projection-only fields are preserved, because deleting them would be data loss dressed up as a repair. `pb checkpoint` now reports drift and a journal-ahead-of-projection gap. |
| **Engine as a library** | Importing `scripts/pb.mjs` no longer executes a command — it exports a read-only API (`status`, `tasks`, `task`, `journal`, `validate`, `workerStatus`, `mergeReady`, `claimOwnership`). Mutations stay on the CLI on purpose, since `process.exit()` would kill an in-process host. |
| **Tracked-state guard, fixed** | The guard against committing runtime state was inert on Windows (POSIX redirect under `cmd.exe`, `require` inside an ESM module, separator mismatch) and would have thrown once past that. Now portable — and it fires on this repo. |

Full detail in [`CHANGELOG.md`](CHANGELOG.md); release steps in [`RELEASE.md`](RELEASE.md).

## Layout

```
playbook.yaml      THE MASTER — indexes everything; loop contract; guardrails
SKILL.md           How any agent operates the playbook (read first)
AGENTS.md          Pointer for cross-tool compatibility (CLAUDE.md mirrors it)
                   — gitignored: not in the git repo, but shipped in the npm tarball
scripts/pb.mjs     The loop CLI — every command (see "Command reference")
processes/         Canonical, ordered workflows (+ index.yaml)
skills/            Short "how-to"s that route to processes (+ index.yaml)
modes/             Persona packs mounted on the invariant floor (+ index in playbook.yaml)
memory/            project-memory.md · backlog.yaml · journal.ndjson · loops · lessons
artifacts/reports/ Generated human-facing rollups
dsh-plugin/        DeepSeek Harness plugin (carries its own bundled engine)
```

`AGENTS.md` / `CLAUDE.md` are gitignored, so a git clone won't have them (the npm tarball does ship
`AGENTS.md`); `attic/` is not shipped at all.

## Quick start (in this folder)

```bash
npm install                       # one dependency: js-yaml
node scripts/pb.mjs bootstrap     # first empty install only: seed minimal run-task skill/process
node scripts/pb.mjs status        # orient
node scripts/pb.mjs next --claim  # pick + claim the next task (prints its acceptance checks)
# ...do the work via the skill it names...
node scripts/pb.mjs validate --task T1            # run the task's checks on demand
node scripts/pb.mjs record --task T1 --action execute --status done --notes "did the thing"
#   ^ re-runs the checks; refuses to record done if any fail
node scripts/pb.mjs report        # writes artifacts/reports/report-<date>.md
```

There are npm aliases too: `npm run status`, `npm run next`, `npm run validate`, `npm run report`.

## Install as a package

The engine ships as a CLI, so you do not have to clone anything. **Run these in the project that
will *use* the playbook — not inside the Agent-Playbook repo itself**, where `agents-playbook` would
become a dependency of itself and npm would helpfully install a second, stale copy.

```bash
npm install agents-playbook          # local → node_modules/.bin/pb
npx --package agents-playbook pb status
npm install -g agents-playbook       # global → `pb` on PATH
```

> ⚠️ **Mind the plural.** The engine is `agents-playbook`. The singular **`agent-playbook` on npm is
> an unrelated package by another author** — `npm install agent-playbook` succeeds and silently
> installs the wrong thing. The DSH plugin is a separate package, `dsh-agent-playbook`.

Then scaffold it into any repo:

```bash
pb scaffold --target <repo>/.agents-playbook   # copy-don't-clobber
cd <repo>/.agents-playbook && pb bootstrap && pb validate
```

`scaffold` copies the engine (never overwrites, except `pb.mjs` itself). `bootstrap` seeds minimal
process/skill stubs; `init` only creates missing runtime files. Keep it current with `pb update`
(pulls from `update.repo`, preserves `memory/` and `artifacts/`).

## The loop

**orient → select → act → verify → record → report → repeat.** One command per step:

| Step | Command |
| --- | --- |
| Orient | `node scripts/pb.mjs status` |
| Select | `node scripts/pb.mjs next --claim` |
| Act | open `skills/<id>/SKILL.md`, follow `processes/<id>.yaml` |
| Verify | `node scripts/pb.mjs validate` + `validate --task <id>` |
| Record | `node scripts/pb.mjs record ...` (done is enforced) |
| Report | `node scripts/pb.mjs report` |

See `SKILL.md` for the full contract and skills-first routing.

## Done is enforced, not declared

Tasks in `memory/backlog.yaml` carry executable checks:

```yaml
- id: T7
  title: Add a sitemap generator
  status: todo
  skill: run-task
  priority: 1
  acceptance_checks:
    - node scripts/generate-sitemap.mjs --dry-run
    - node scripts/pb.mjs validate
```

Each check runs with `cwd` = the playbook root; exit 0 = pass. `pb record --status done` runs them
all and exits 1 on any failure, telling the agent to fix the work or record `blocked` instead.
`--skip-checks` exists as an escape hatch, but the skip is stamped on the journal entry and
flagged in reports (`⚠checks-skipped`) — it can't be hidden.

A task without checks is verified on the agent's honor only, and `pb next` says so when claiming it.

Tasks may also declare `dependencies: [T1, T2]` — a task isn't claimable until its dependencies
are done.

## Hardening (context-loss survival)

State lives on disk, never only in chat. Two commands keep the playbook in an agent's attention:

- `pb anchor [--brief]` — prints the tiny constitution; cheap enough to re-inject every turn.
- `pb checkpoint [--snapshot]` — heartbeat: re-anchors, detects drift (multiple claims, claimed
  work with no record, red guardrails), and `--snapshot` writes `memory/RESUME.md` for cold resume.

Wire them into runtime hooks so the agent never has to remember (Claude Code example):
`SessionStart` → `pb anchor`, `UserPromptSubmit` → `pb anchor --brief`, `PreCompact` →
`pb checkpoint --snapshot`. See the `harden` skill. An OpenCode adapter already implements the
same contract under `adapters/opencode/`.

## Multi-agent: claims are leases, writes are attributable

N agents can share one backlog. A claim mints a **token**, and a writer proves entitlement three
ways: it IS the holder; it presents the token (`--token` / `PB_CLAIM_TOKEN`); or the holder appears
in its declared delegation chain (`PB_AGENT_CHAIN=root,sub,grand`).

A sub-agent therefore records **as itself** — `agent` + `agent_chain` + `ownership: token|chain` on
the journal row — rather than impersonating its parent, so fan-out stays auditable back to the task
that delegated it. An unproven write is recorded and flagged `ownership: unproven`: losing real work
is worse than an unproven row.

Every shared-state write goes through one serialized transaction (O_EXCL lock + atomic replace) and
each journal row carries a monotonic `seq`, so "who wrote first, who wrote last, and on whose behalf"
is a recorded fact instead of an inference from colliding timestamps. `pb release` returns a claim
to the pool (or sweeps abandoned ones with `--stale <minutes>`); `pb unlock` clears a leaked lock.

**Locking rule:** a lock is only ever broken by **age**, never by probing whether the holder is
alive — `process.kill(pid, 0)` lies across containers, and a wrong guess corrupts state. A lock has
a per-kind stale window, release is token-guarded, and `pb unlock --force` is the explicit escape
hatch when a killed holder outlives its window.

## Worktrees: isolated work, gated merges

```bash
pb worker create <task> --agent <a> --execute   # one live slot per task (atomic)
pb worker status <task> --json                  # ahead / behind / uncommitted / head
pb worker exec   <task> -- <cmd>                # run a command INSIDE the worktree
pb worker verify <task>                         # run the task's checks INSIDE the worktree
pb worker merge  <task> --execute               # gated by merge-ready; refuses unfinished work
pb worker remove <task> --delete-branch --execute
pb record --task <task> --status done --at <worktree>   # record checks that ran in the worker tree
```

The merge gate reads the branch, not just the journal: a worktree that is missing, dirty, or has
**zero commits ahead of its base** cannot be merged, and a verification that has gone stale is
reported rather than trusted. `worker checker` records an independent verdict, and
`worker provider-rate-limit` records a real provider 403/429 cooldown so a throttled worker is
distinguishable from a failing one.

All `worker` subcommands are **dry-run by default**; `--execute` applies.

## Crash recovery

`memory/journal.ndjson` is the append-only record; `memory/backlog-state.json` is a projection of it.
If a state write is lost, the projection is rebuildable:

```bash
pb repair-state --check     # exit 1 on drift (CI-wireable)
pb repair-state --apply     # rebuild from the journal
pb repair-state --strict    # drop projection-only fields instead of preserving them
```

`pb checkpoint` reports drift and a journal-ahead-of-projection gap as warnings, so silent divergence
surfaces at the heartbeat instead of being discovered later.

## DeepSeek Harness plugin

`dsh-plugin/` is a first-party-style harness plugin — [`dsh-agent-playbook`](https://www.npmjs.com/package/dsh-agent-playbook),
published on npm. It exposes one `playbook` tool
(status / anchor / next / claim / task / check / record / worker / init / unlock / repair), registers
the playbook's own skills as harness skills (`playbook-<id>`), and stages the constitution — North
Star, active loop, task in hand and **its checks** — on the agent's inbox before each step, so
compaction cannot lose the plot. It bundles the engine, so installation is one step and cannot drift
from the engine it was tested against.

Two rules define the boundary, and they are the whole design:

- **It never re-implements a gate.** Every action is a `pb` invocation. A second opinion about "done"
  is exactly what this project refuses.
- **It shells out rather than importing.** Every `pb` command reports refusal with `process.exit()`,
  so an in-process call would terminate the *host* instead of returning an error. As a subprocess the
  exit code stays the contract.

The plugin declares `inject = ['tools']` and pulls `skills` at runtime with `ctx.inject`, because
Cordis `inject` is all-or-nothing: a missing declared service means `apply()` never runs at all, and
a plugin that silently vanishes is worse than one that degrades.

## Modes and packs

A **mode** is a persona pack mounted *on* the invariant floor. It injects a `directive` plus style
`principles` through the anchor; it never weakens enforcement. There is no mode that skips
`acceptance_checks`. Resolution order is `task.mode ?? loop.mode ?? default_mode`.

Bundled modes: `coding` (the reference pack; empty directive = inherit the host prompt), `demo`,
`blogwatch`, `fable-5`, `wiki-news`, `attention-research`. `pb list modes` prints the catalog;
`pb pack build <id>` / `pb pack install <file.pbpack>` ship and mount one.

### Mode packs in practice: conformance-first intake (v0.3.3)

When a project starts from an approved visual design, establish the design contract **before broad
implementation-oriented codebase analysis**. Otherwise, legacy files and nearby examples can
silently redefine the approved design before the agent has a stable reference.

| Approved source | Skill | Source identity |
| --- | --- | --- |
| Pencil mockups via MCP | `$pencil-design-layout-conformance` | Pencil file/frame/node IDs + approved screenshots |
| Canonical HTML mockup | `$html-design-layout-conformance` | HTML entry point + checksum + stable `data-design-id` anchors |

Approve `DESIGN.md` and the Pencil or HTML source, including required viewports and UI states.
Then the intake order is:

1. Invoke the matching conformance skill and create `design-contract.yaml` from the **design
   source only**: provenance, states, viewports, semantic regions, geometry, and tolerances.
2. Analyze the codebase **through that contract**. Inspect only what is needed to map its regions:
   canonical component APIs, deprecated paths, compilable examples, tokens, and the existing test
   harness. Do not mine arbitrary nearby screens to infer the intended design.
3. Complete the component mapping, implement one golden screen, and prove the verification command
   fails on a deliberate layout shift before restoring it.
4. Only after the contract gate passes, implement production screen slices. Each slice must pass
   geometry, screenshot, responsive, applicable interaction, anti-gaming, and human-attestation gates.

For HTML sources, start from
`modes/coding/skills/html-design-layout-conformance/assets/design-contract.template.yaml`; for
Pencil sources, produce the same target-repository artifact with `source.kind: pencil` and stable
Pencil provenance. The adapter processes live under `modes/coding/processes/`.

## Loop epochs and lessons

Use `pb loop new` to open a durable loop epoch. New `pb record` entries are stamped with the active
`loop_id`, and loop-scoped artifacts live under `artifacts/loops/<loop_id>/`.

Close clean loops with `pb loop close --status done`. Close contaminated runs with
`pb loop close --status failed --reason "..."`; that writes a quarantine artifact and blocks the
next `pb loop new` until a lesson is recorded with `pb learn --loop <id> --source user --notes "..."`.
Promote reusable lessons into project memory, backlog tasks, or skills/processes.

`pb loop run --auto` executes the loop autonomously — claim, run commands, run checks, record
done/blocked, retry failed checks — and stops on blockers, manual tasks, honor-only tasks, or an
empty backlog.

## Guardrails

`node scripts/pb.mjs validate` checks the master + indices parse, every referenced file exists,
skills point to real processes, the backlog (statuses, dependencies, check declarations) and
journal are well-formed. It exits non-zero on failure, so it drops cleanly into CI or a
pre-commit hook. `validate --task <id>` runs one task's acceptance checks.

One trap worth knowing: this repo **git-tracks `memory/`**, including the append-only journal and the
shared-state projection. That is exactly the shared-state hazard the engine warns about — a tracked
projection can be merged, and merging two agents' journals is not a merge anyone can do correctly.
`pb validate` warns about it and `validate --strict` makes it fatal. If you want the strict gate
green, untrack the state that the engine owns:

```bash
git rm -r --cached memory artifacts
```

## Command reference

| Group | Commands |
| --- | --- |
| Loop | `status` · `next --claim` · `record` · `report` · `validate [--task]` |
| Task & plan | `task show <id>` · `plan --goal ".."` · `runcard list\|show <id>` |
| Multi-agent | `release --task <id> [--token] \| --stale <min>` · `unlock [--force]` · `repair-state [--check\|--apply]` |
| Worktrees | `worker create\|status\|exec\|verify\|merge\|remove\|checker\|merge-ready\|provider-rate-limit` |
| Loop epochs | `loop new\|status\|run\|close\|quarantine` · `learn` · `learn status` |
| Phase | `cycle [--new]` · `reflect` |
| Context | `anchor [--brief]` · `checkpoint [--snapshot]` |
| Processes | `run -- <cmd>` · `ps` · `stop` |
| Packs & modes | `list [processes\|skills\|modes]` · `pack build\|install` |
| Lifecycle | `scaffold` · `init` · `bootstrap` · `update [--check]` · `help` |

Run `node scripts/pb.mjs help` for flags. Statuses: `todo, in_progress, blocked, done`.

## Dependencies

One: [`js-yaml`](https://www.npmjs.com/package/js-yaml). Node >= 18.

## Release status

Being explicit about what is shipped and what is not:

| Artifact | State |
| --- | --- |
| Engine (`agents-playbook`) | **published**, `0.5.0` |
| Git tags | `v0.1.0`, `v0.3`, `v0.3.2` — no tag yet for `v0.4.0` / `v0.5.0` |
| Harness plugin (`dsh-agent-playbook`) | **published**, `0.5.0` (`npm install dsh-agent-playbook`, or `dsh plugin --profile <p> add dsh-agent-playbook`) |
| Live in-harness verification | pending (a boot either serves the Web UI or runs an LLM task, so it stays a human step) |

## What was deliberately cut

Earlier versions carried a spec/Work-Map layer (DAG scheduling, gates, waves, debt ledgers).
It was planning metadata the CLI never executed — bureaucracy cosplaying as machinery. It was
removed from the engine: no command reads it, and nothing here depends on it. A local `attic/`
copy may still exist on the author's machine, but it is gitignored and **not shipped** — a clone
gets the lean engine only. If a real workload ever needs orchestration, build it against
demonstrated need, not anticipation.

---

# 繁體中文

[English](#agent-playbook) · **繁體中文**

目前版本：**v0.5.0**（npm：[`agents-playbook`](https://www.npmjs.com/package/agents-playbook)）

> **「做完」係一個 exit code，唔係一句聲稱。** 整個內核就係 `pb record --status done`：佢會
> 重新執行該任務嘅 `acceptance_checks`（shell 指令），任何一條失敗就**拒絕記錄**。anchoring、
> North Star（`north_star`）、cycle brief、可攜性 —— 全部只係**支撐**呢道驗證閘，唔可以取代佢。

## 呢個係乜

一個**可攜、agent 優先嘅 playbook 引擎**。放入任何資料夾，agent 就可以無摩擦咁跑迴圈：讀 master
定位 → 揀任務 → 做嘢 → 用**可執行嘅驗收檢查**證明 → 記錄 → 匯總成人類可讀嘅報告。全部檔案都喺
資料夾入面，複製去邊都照跑（carry-on）。

## 核心理念

Agent 嘅三大毛病：跨 session 失憶、偏離流程、未做完就宣佈「搞掂」。呢個 playbook 用最少嘅機械解決：

1. **一個 master** —— 每次迭代都重新錨定 `playbook.yaml`（the fixation），靠 `pb anchor` 廉價
   重新注入，令長 context 同 compaction 都沖唔走。
2. **強制完成** —— 任務嘅 `acceptance_checks` 係 shell 指令，`pb record --status done` 會執行佢哋，
   失敗就拒絕記錄。**exit code 令迴圈誠實，流程文件唔會。**
3. **狀態落地** —— backlog 同 append-only journal 喺磁碟，context 冇咗唔等於工作冇咗。

## v0.5.0 有咩新

呢個版本將「單 agent 迴圈」變成「多 agent 共用」。舊有單 agent playbook **完全唔受影響** ——
`pb next --claim`、`pb record`、`acceptance_checks` 行為同以前一樣。

### 多代理：認領即租約，寫入可追溯

**佢補嘅洞：** 幾個 agent 共用一個 backlog 嗰陣，冇人講得出**邊個先寫、邊個後寫、代表邊個寫** ——
fan-out 會靜靜雞互相覆蓋，而 sub-agent 要冒充 parent 才記錄得到。

- **所有共享狀態經同一個序列化交易** —— O_EXCL 鎖、入到臨界區重新讀取、原子替換。舊寫法係將
  整個物件 read-modify-write，會丟失並行寫入者嘅改動；用突變測試證明過：停用鎖，回歸測試就變紅
  而且係真實嘅 lost update。
- **次序係記錄落嚟，唔係推斷。** 每行 journal 帶單調遞增嘅 `seq` 同寫入者，而 journal 行同狀態
  變更喺**同一個交易**內提交 —— 所以兩份紀錄永遠唔會對「邊個最後寫」有分歧。
- **認領即租約。** `pb next --claim` 鑄造一個 **claim token**。寫入者用三種方式之一證明自己有權：
  本身就係 holder、出示 token、或者 holder 出現喺佢申報嘅 delegation chain。所以 sub-agent
  **以自己身份**記錄，帶 `ownership: token|chain`。
- **無證明嘅寫入會標記而唔係丟棄**（`ownership: unproven`）—— 丟失真實工作比留低一行 unproven 更差。
- **鎖只按年齡打破**，永遠唔探測持有者死活：pid 探測喺 Windows 會將活住嘅持有者誤報為死咗，
  令等待者偷走一個仍然生效嘅鎖。`pb release` 將認領還返 pool；`pb unlock --force` 係逃生門。

→ 詳見[多代理（Multi-Agent）](#多代理multi-agent)

### DeepSeek Harness 外掛整合

[`dsh-plugin/`](dsh-plugin/README.md) 將迴圈帶入 harness：一個 `playbook` 工具
（status / anchor / next / claim / task / check / record / worker / init / unlock / repair）、
將 playbook 自己嘅 skills 註冊成 harness skills（`playbook-<id>`），並且喺每一步之前將憲章
（North Star、當前 loop、手上任務**同埋佢嘅檢查**）注入 agent 嘅 inbox，令 compaction 沖唔走個 plot。

佢**自帶引擎**（安裝一步搞掂，唔使人手對版本），而且**永遠唔會重新實作任何閘** —— 每個動作都係
一次 `pb` 呼叫，以 subprocess 執行，所以 exit code 保得住合約，拒絕亦永遠殺唔死 host。

→ 詳見 [DeepSeek Harness 外掛](#deepseek-harness-外掛)

### 同版本其他內容

| 範疇 | 內容 |
| --- | --- |
| **WorkTree** | 原子認領 —— 每個任務只有一個 live slot —— 加 `status / exec / verify / merge / remove`；合併閘讀**分支**（唔見咗、dirty、或者相對 base 零 commit ⇒ 拒絕）；`record --at <worktree>` 用嚟記錄喺 worker tree 跑過嘅檢查。 |
| **崩潰復原** | `pb repair-state --check`（有 drift 就 exit 1，可入 CI）同 `--apply`，由 journal 重建投影；只存在於投影嘅欄位會被保留，因為刪咗佢哋係「扮維修嘅資料損失」。`pb checkpoint` 而家會報 drift 同「journal 超前投影」嘅落差。 |
| **引擎即函式庫** | Import `scripts/pb.mjs` 唔再執行指令 —— 佢 export 一個**唯讀** API（`status`、`tasks`、`task`、`journal`、`validate`、`workerStatus`、`mergeReady`、`claimOwnership`）。變更操作刻意留喺 CLI，因為 `process.exit()` 會殺死 in-process host。 |
| **追蹤狀態守衛，已修** | 防止將 runtime 狀態 commit 入 git 嘅守衛喺 Windows 完全失效（`cmd.exe` 下嘅 POSIX redirect、ESM 內用 `require`、路徑分隔符不符），而且過到第一關都會拋錯。而家跨平台，並且喺呢個 repo 真係會響。 |

完整細節見 [`CHANGELOG.md`](CHANGELOG.md)；發佈步驟見 [`RELEASE.md`](RELEASE.md)。

## 快速開始

```bash
npm install                       # 只有一個依賴：js-yaml
node scripts/pb.mjs bootstrap     # 首次空安裝：產生最精簡嘅 skill/process
node scripts/pb.mjs status        # 定位
node scripts/pb.mjs next --claim  # 揀下一個任務並認領（會印出驗收檢查）
node scripts/pb.mjs validate --task T1
node scripts/pb.mjs record --task T1 --action execute --status done --notes "做咗乜"
node scripts/pb.mjs report        # 寫出 artifacts/reports/report-<date>.md
```

當套件用 —— **要喺「會用」呢個 playbook 嘅專案入面跑，唔好喺 Agent-Playbook repo 自己裏面跑**
（否則 `agents-playbook` 會變成自己嘅 dependency，npm 會靜靜雞裝多一份過期副本）：

```bash
npm install agents-playbook                        # 本機 → node_modules/.bin/pb
npm install -g agents-playbook                     # 全域 → 直接用 pb
pb scaffold --target <repo>/.agents-playbook       # 複製入其他 repo（唔會覆蓋）
```

> ⚠️ **小心複數。** 引擎叫 `agents-playbook`。npm 上單數嘅 **`agent-playbook` 係另一位作者嘅
> 無關套件** —— `npm install agent-playbook` 會成功，但裝錯嘢。DSH 外掛係另一個獨立套件：
> `dsh-agent-playbook`。

## 迴圈

**orient → select → act → verify → record → report → repeat**

| 步驟 | 指令 |
| --- | --- |
| 定位 | `pb status` |
| 揀任務 | `pb next --claim` |
| 做嘢 | 開 `skills/<id>/SKILL.md`，跟 `processes/<id>.yaml` |
| 驗證 | `pb validate` + `pb validate --task <id>` |
| 記錄 | `pb record ...`（done 會被強制驗證） |
| 報告 | `pb report` |

任務嘅檢查以 playbook 根目錄為 `cwd` 執行，exit 0 為通過。`--skip-checks` 係逃生門，但會蓋印喺
journal 並且喺報告度標記（`⚠checks-skipped`）—— 匿唔到。

## 多代理（Multi-Agent）

**呢個就係設計重點。** N 個 agent 可以共用同一個 backlog：

- **認領即租約（lease）** —— 認領會鑄造一個 **claim token**。
- **寫入可追溯** —— 寫入者要用三種方式之一證明自己有權：本身就係 holder、出示 token
  （`--token` / `PB_CLAIM_TOKEN`）、或者 holder 出現喺佢申報嘅 delegation chain
  （`PB_AGENT_CHAIN=root,sub,grand`）。
- **Sub-agent 以自己身份記錄** —— journal row 帶 `agent` + `agent_chain` +
  `ownership: token|chain`，唔會冒充 parent，所以 fan-out 一定追得返去委派佢嗰個任務。
  無證明嘅寫入會照記但標記 `ownership: unproven` —— **丟失真實工作比留低一行 unproven 更差**。

**「邊個先寫、邊個後寫、代表邊個寫」係記錄落嚟嘅事實，唔係靠碰撞嘅時間戳推斷：**

- 每次共享狀態寫入都經過**同一個序列化交易**（O_EXCL lock + 原子替換）。
- 每一行 journal 都帶**單調遞增嘅 `seq`**。
- `pb release` 將認領還返 pool（`--stale <分鐘>` 清掃被遺棄嘅認領）；`pb unlock` 清走洩漏嘅鎖。

**鎖定規則：** 鎖只會因為**年齡**被打破，永遠唔會用 `process.kill(pid, 0)` 探測持有者死活 ——
跨容器會講大話，猜錯就整壞狀態。每種鎖有自己嘅 stale window，釋放要 token 授權，
`pb unlock --force` 係殺死持有者之後嘅明確逃生門。

## WorkTree

每個任務一個真 git worktree，全部子指令**預設 dry-run**，要 `--execute` 才生效：

```bash
pb worker create <task> --agent <a> --execute   # 每個任務只有一個 live slot（原子）
pb worker status <task> --json                  # ahead / behind / uncommitted / head
pb worker exec   <task> -- <cmd>                # 喺 worktree 入面執行指令
pb worker verify <task>                         # 喺 worktree 入面跑任務檢查
pb worker merge  <task> --execute               # 受 merge-ready 閘控，未做完唔准合
pb worker remove <task> --delete-branch --execute
pb record --task <task> --status done --at <worktree>   # 記錄喺 worker tree 跑過嘅檢查
```

合併閘讀**分支**而唔係只讀 journal：worktree 唔見咗、dirty、或者**相對 base 零 commit** 都唔准合；
驗證過期會如實報告而唔係當佢有效。`worker checker` 記錄獨立判決，
`worker provider-rate-limit` 記錄真實嘅 provider 403/429 冷卻 —— 令「被限流」同「壞咗」分得清。

## 崩潰復原

`memory/journal.ndjson` 係 append-only 紀錄；`memory/backlog-state.json` 只係佢嘅投影（derived data）。

```bash
pb repair-state --check     # 有 drift 就 exit 1（可入 CI）
pb repair-state --apply     # 由 journal 重建投影
```

`pb checkpoint` 會將 drift 同「journal 超前投影」嘅落差報為警告，令無聲分歧喺心跳就浮面。

## DeepSeek Harness 外掛

`dsh-plugin/` 就係 harness 外掛 —— [`dsh-agent-playbook`](https://www.npmjs.com/package/dsh-agent-playbook)，
已經發佈上 npm。佢提供一個 `playbook` 工具（status / anchor / next / claim / task /
check / record / worker / init / unlock / repair），將 playbook 自己嘅 skills 註冊成 harness skills
（`playbook-<id>`），並且喺每一步之前將憲章（North Star、當前 loop、手上任務**同埋佢嘅檢查**）
注入 agent 嘅 inbox，令 compaction 沖唔走個 plot。佢自帶引擎，所以安裝一步搞掂，亦唔會同測試過嘅
引擎版本脫節。

兩條邊界規則就係全部設計：

- **佢永遠唔會重新實作任何閘。** 每個動作都係一次 `pb` 呼叫 —— 對「done」有第二種意見，正正係
  呢個專案拒絕嘅事。
- **佢 shell out 而唔係 import。** 每個 `pb` 指令都用 `process.exit()` 表達拒絕，所以 in-process
  呼叫會殺死 **host** 而唔係回傳錯誤。做 subprocess，exit code 才保得住合約。

## 指令速查

| 類別 | 指令 |
| --- | --- |
| 迴圈 | `status` · `next --claim` · `record` · `report` · `validate [--task]` |
| 任務／規劃 | `task show <id>` · `plan --goal ".."` · `runcard list\|show <id>` |
| 多代理 | `release --task <id> [--token] \| --stale <min>` · `unlock [--force]` · `repair-state [--check\|--apply]` |
| WorkTree | `worker create\|status\|exec\|verify\|merge\|remove\|checker\|merge-ready\|provider-rate-limit` |
| Loop epoch | `loop new\|status\|run\|close\|quarantine` · `learn` |
| 階段 | `cycle [--new]` · `reflect` |
| Context | `anchor [--brief]` · `checkpoint [--snapshot]` |
| 程序 | `run -- <cmd>` · `ps` · `stop` |
| 打包 | `list [processes\|skills\|modes]` · `pack build\|install` |
| 生命週期 | `scaffold` · `init` · `bootstrap` · `update [--check]` · `help` |

狀態：`todo, in_progress, blocked, done`。完整旗標請跑 `node scripts/pb.mjs help`。

## 目前狀態（講清楚）

| 產物 | 狀態 |
| --- | --- |
| 引擎（`agents-playbook`） | **已發佈** `0.5.0` |
| Git tag | 只有 `v0.1.0`、`v0.3`、`v0.3.2`；`v0.4.0` / `v0.5.0` 未有 tag |
| Harness 外掛（`dsh-agent-playbook`） | **已發佈** `0.5.0`（`npm install dsh-agent-playbook`，或 `dsh plugin --profile <p> add dsh-agent-playbook`） |
| 真實 harness 內驗證 | 待做（一次開機唔係開 Web UI 就係跑 LLM 任務，所以呢步留返俾人） |

## 已知陷阱

呢個 repo **將 `memory/` 納入 git 追蹤**，包括 append-only journal 同共享狀態投影。呢個正正係引擎
警告嘅共享狀態風險 —— 被追蹤嘅投影係可以被 merge 嘅，而「合併兩個 agent 嘅 journal」冇人做得啱。
`pb validate` 會警告，`validate --strict` 會當佢致命。想 strict 轉綠：

```bash
git rm -r --cached memory artifacts
```

## 快速上手：改成你自己嘅

- 加任務落 `memory/backlog.yaml` —— 盡量俾佢可執行嘅 `acceptance_checks`。
- 加流程：`processes/<id>.yaml`（＋註冊入 `processes/index.yaml`）同
  `skills/<id>/SKILL.md`（＋註冊入 `skills/index.yaml`）。
- 將持久事實寫入 `memory/project-memory.md`。

## 授權

MIT
