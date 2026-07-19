// opencode-playbook — Agent-Playbook adapter plugin for OpenCode.
//
// Maps OpenCode's idle-driven *cadence* onto the playbook's enforced *contract*.
// The plugin never decides whether work is "done" — it only re-arms turns and
// hands each turn to `scripts/pb.mjs`, whose acceptance_checks are the only gate.
//
// Hooks:
//   shell.env                        anchor PB_ROOT for every shell the agent runs
//   session.created                  re-inject the constitution (pb anchor)
//   session.idle                     heartbeat: run one auto pass while a loop is armed
//   experimental.session.compacting  push the brief anchor into compaction context
//
// State: .opencode/opencode-playbook/loop.json  { active, until, interval }
//   Armed by the /pb-loop command (or by writing the file); session.idle reads it.
//   Default OFF — without an armed loop, idle does nothing (no runaway turns).

import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";

// Resolve the playbook root: explicit env wins, else walk up from this file
// looking for the master (playbook.yaml / playbook.json).
function findPlaybookRoot(startDir) {
  if (process.env.PB_ROOT && existsSync(process.env.PB_ROOT)) return process.env.PB_ROOT;
  let dir = startDir;
  for (let i = 0; i < 8 && dir; i++) {
    if (existsSync(join(dir, "playbook.yaml")) || existsSync(join(dir, "playbook.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}

function readLoopState(stateFile) {
  try {
    return JSON.parse(readFileSync(stateFile, "utf8"));
  } catch {
    return { active: false };
  }
}

export const OpencodePlaybook = async ({ $, directory, worktree, client }) => {
  const root = findPlaybookRoot(worktree || directory || process.cwd());
  const stateDir = join(root, ".opencode", "opencode-playbook");
  const stateFile = join(stateDir, "loop.json");
  try { mkdirSync(stateDir, { recursive: true }); } catch { /* best effort */ }

  const pb = (...args) => $`node scripts/pb.mjs ${args}`.cwd(root).quiet();

  // Debounce: OpenCode can emit several idle pulses around one turn boundary.
  let running = false;

  return {
    // Every shell the agent launches resolves the playbook the same way.
    "shell.env": async (_input, output) => {
      output.env.PB_ROOT = root;
    },

    // Fresh session → re-anchor to the master so the agent starts oriented.
    "session.created": async () => {
      try { await pb("anchor"); } catch { /* anchor is best-effort */ }
    },

    // The heartbeat. While a loop is armed, each idle boundary runs one
    // autonomous pass. --defer-blocked keeps the run moving past a faulted
    // task; pb itself decides done vs stalled. We never override its verdict.
    "session.idle": async () => {
      if (running) return;
      const st = readLoopState(stateFile);
      if (!st.active) return;
      if (st.until && Date.now() > Date.parse(st.until)) return; // loop expired
      running = true;
      try {
        await pb("loop", "run", "--auto", "--defer-blocked");
        await pb("checkpoint"); // drift detection between turns
      } catch {
        // A non-zero exit just means the pass stalled; leave it for the human.
      } finally {
        running = false;
      }
    },

    // Keep the cycle goal + North Star in the compaction summary.
    "experimental.session.compacting": async (_input, output) => {
      try {
        const out = await pb("anchor", "--brief");
        const text = (out && (out.stdout?.toString?.() ?? String(out))) || "";
        if (text.trim()) output.context.push(text.trim());
      } catch { /* best effort */ }
    },
  };
};
