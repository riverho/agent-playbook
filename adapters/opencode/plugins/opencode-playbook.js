// opencode-playbook — Agent-Playbook adapter plugin for OpenCode.
//
// Maps OpenCode's idle-driven *cadence* onto the playbook's enforced *contract*.
// The plugin never decides whether work is "done" — it only re-arms turns and
// hands each turn to `scripts/pb.mjs`, whose acceptance_checks are the only gate.
//
// Multi-agent (playbook >= 0.5): every shell is stamped with the runtime and a
// stable session agent id, so `pb` records are attributable and two OpenCode
// sessions can share one backlog without impersonating each other. A delegated
// sub-agent can be handed PB_AGENT_CHAIN / PB_CLAIM_TOKEN by its launcher; the
// plugin forwards those and never invents a claim of its own.
//
// Hooks:
//   shell.env                        anchor PB_ROOT + agent identity for every shell
//   session.created                  capture the session id, then re-inject pb anchor
//   session.idle                     heartbeat: run one auto pass while a loop is armed
//   experimental.session.compacting  push the brief anchor into compaction context
//
// State: .opencode/opencode-playbook/loop.json  { active, until, interval }
//   Armed by the /pb-loop command (or by writing the file); session.idle reads it.
//   Default OFF — without an armed loop, idle does nothing (no runaway turns).

import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";

const RUNTIME = "opencode";

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

// The engine agent id for a session. Prefixed with the runtime so two hosts (or
// two OpenCode sessions) sharing one backlog never collide in the records.
function agentIdFor(sessionId) {
  return sessionId ? `${RUNTIME}:${sessionId}` : RUNTIME;
}

export const OpencodePlaybook = async ({ $, directory, worktree, client }) => {
  const root = findPlaybookRoot(worktree || directory || process.cwd());
  const stateDir = join(root, ".opencode", "opencode-playbook");
  const stateFile = join(stateDir, "loop.json");
  try { mkdirSync(stateDir, { recursive: true }); } catch { /* best effort */ }

  // The session id is the agent identity. It is captured first at
  // session.created and opportunistically from any hook input that carries it.
  let sessionId = process.env.PB_SESSION_ID || null;
  const captureSession = (input) => {
    const id = input && (input.sessionID || input.session?.id || input.info?.id || input.id);
    if (id) sessionId = String(id);
  };

  // Only the vars this adapter owns; the engine fills the rest from defaults.
  // Delegated proof (parent / chain / token) is forwarded, never fabricated.
  const identityVars = () => {
    const env = { PB_ROOT: root, PB_RUNTIME: RUNTIME, PB_AGENT_ID: agentIdFor(sessionId) };
    if (sessionId) env.PB_SESSION_ID = sessionId;
    for (const key of ["PB_PARENT_AGENT_ID", "PB_AGENT_CHAIN", "PB_CLAIM_TOKEN"]) {
      if (process.env[key]) env[key] = process.env[key];
    }
    return env;
  };

  // The plugin's own calls must carry the same identity as the agent's shells —
  // otherwise the heartbeat's records are attributed to an anonymous "agent".
  const pb = (...args) => $`node scripts/pb.mjs ${args}`
    .cwd(root)
    .quiet()
    .env({ ...process.env, ...identityVars() });

  // Debounce: OpenCode can emit several idle pulses around one turn boundary.
  let running = false;

  return {
    // Every shell the agent launches resolves the playbook and identity the same way.
    "shell.env": async (input, output) => {
      captureSession(input);
      Object.assign(output.env, identityVars());
    },

    // Fresh session → capture the identity, then re-anchor to the master.
    "session.created": async (input) => {
      captureSession(input);
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
