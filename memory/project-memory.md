# Project Memory

Purpose: durable, in-folder operating memory for every agent that runs this playbook.
This file is read on every session, right after `playbook.yaml`. Keep it short and true.

## How this playbook works

1. `playbook.yaml` is the master (the "fixation"). Re-anchor to it every loop iteration.
2. The loop is: **orient → select → act → verify → record → report**, one command per step.
3. Skills live in `skills/`, processes in `processes/`, the CLI in `scripts/pb.mjs`.
4. Work is **agent-first**: the machine record is `memory/journal.ndjson`; humans read the
   rollups in `artifacts/reports/`. Never hand-edit the journal — use `pb record`.
5. Everything stays inside this folder. Copy the folder and it still works (carry-on).

## Operating Rules

1. Skills-first. Find the matching skill before improvising. If none fits, write one.
2. One task `in_progress` per agent at a time. Finish or block it before claiming another.
3. Smallest change that satisfies the task's `acceptance_checks`.
4. Keep `pb validate` green before and after acting.
5. When you learn something durable about this project, add it here as a numbered rule — that is
   how the playbook gets smarter over time.
6. After a failed or confusing loop, capture the user's reflection before starting the next loop;
   promote the lesson to project memory, backlog, or a new/updated skill only when it is reusable.
7. **Windows runner — `.cmd`/`.bat` shims (npm, pnpm, yarn) require `cmd.exe /d /c` wrapping.**
   `execFileSync` and `spawn` with `shell:false` cannot launch `.cmd`/`.bat` files on Windows —
   Node returns `EINVAL` (or `ENOENT` for bare names without `PATHEXT` lookup). The playbook
   dispatches shims by calling `cmd.exe /d /c <file> <args>`. Use the helpers in
   `scripts/pb.mjs` (`runCommandSync`, `spawnCommand`) — do not call `execFileSync`/`spawn`
   directly for shim dispatch.
8. **Windows runner — `cmd.exe /d /c` argv must not contain cmd-special chars unquoted.** When
   `file` or any argv element contains `( ) < > & |` and is unquoted, `cmd.exe` interprets them
   (e.g., `setTimeout(()=>{}, 5000)` — the `>` becomes redirection). Node's default Windows
   auto-quoting only quotes whitespace/`"`, not these specials. Practical workaround: put the
   script in a `.js` file and invoke `node ./sleeper.js` (no specials in argv). Do NOT pass
   `/s` to `cmd.exe` — `/s` + a leading quote strips both leading and trailing quote (cmd.exe
   rule 2), which breaks paths like `C:\Program Files\...`.
9. **Windows runner — risk surface is narrow.** Tests that invoke `process.execPath` (a real
   `.exe`) via `execFileSync`, or that use `execSync` (goes through the shell), are unaffected.
   The risk surface is user-defined `acceptance_checks` and `pb run -- <cmd>`. When adding a new
   test script or runner path, default to `runCommandSync`/`spawnCommand` rather than reaching
   for `execFileSync`/`spawn` directly.

## Project Facts

_(None yet.)_

## Memory Budget

Keep this file lean. Hot, always-true operating rules stay here; cold, historical, or task-specific
detail belongs in task notes or reflection entries, not durable project memory.
