// ============================================================================
//  index.js — the Cordis/DeepSeek Harness layer.
// ----------------------------------------------------------------------------
// Thin by design: resolve the playbook, attach its constitution to the model's
// context, and expose one `playbook` tool that translates intents into `pb`
// invocations. All the logic worth testing lives in core.mjs.
//
// Why the tool shells out instead of importing the engine: every `pb` command
// reports refusal with `process.exit()`. In-process, that would terminate the
// harness rather than return an error, so exits stop being a contract. As a
// subprocess, the exit code IS the gate — and `pb record --status done` still
// re-runs the task's acceptance_checks and refuses on failure, whoever calls it.
// ============================================================================

import { existsSync, readFileSync as readFileSyncImpl } from 'node:fs';
import { dirname, join } from 'node:path';
import z from '@deepseek-ai/schemastery';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import {
  buildContextBlock, buildPlaybookSkills, bundledEngine, engineVersion, identityEnv,
  parseClaimToken, parseClaimedTask, parseJsonOutput, parseSkillFile,
  renderPlaybookSkillBody, resolveAgentId, resolveEngine, runPb,
} from './core.mjs';

export const name = 'agent-playbook';
// ONLY `tools` is a hard requirement. Cordis does not activate a plugin at all while any
// declared `inject` entry is missing (verified against the real cordis: a plugin declaring
// an absent service never reaches `apply()`), and `inject` has no required/optional form —
// the object form maps a name to intercept CONFIG, not to "optional". So declaring `skills`
// here would have made the whole plugin silently inactive in any profile that ships the
// tool registry without the skill registry: no tool, no error, nothing to debug.
//
// The skill registry is therefore a RUNTIME dependency, declared through `ctx.inject`
// inside `apply` — the pattern the first-party `dsh-agent-default-model` uses for
// `settings`. That grants access when the service exists, defers the registration until it
// appears, and leaves the tool surface working when it never does.
export const inject = ['tools'];

export const Config = z.object({  // Where the playbook lives. Omitted → discovered from the session workspace,
  // walking ancestors (the .agents-playbook / monorepo case).
  playbookPath: z.string().default(''),
  // Where `action=init` scaffolds a playbook when the workspace has none.
  playbookDir: z.string().default('.agents-playbook'),
  // Attach the constitution (North Star, loop, in-hand task, checks) before each
  // agent step so context loss and compaction cannot lose the plot.
  injectContext: z.boolean().default(true),
  // Suppress the context block when nothing is actionable (empty backlog), so a
  // finished playbook does not spend tokens on every turn.
  quietWhenIdle: z.boolean().default(true),
  // Character cap on the injected block.
  maxContextChars: z.number().default(4000),
  // How long a single `pb` invocation may run.
  commandTimeoutMs: z.number().default(120_000),
});

// Human/model-readable rendering of a tool result. Kept in the plugin (not the
// engine) because it is a presentation choice: the engine's stdout is the machine
// channel, and the model sees this.
function renderToolResult(args, value) {
  if (value?.error) {
    return `playbook ${args.action}: ${value.error}${value.detail ? `\n${value.detail}` : ''}`;
  }
  const parts = [];
  if (value?.status) parts.push(JSON.stringify(value.status, null, 2));
  else if (value?.result) parts.push(JSON.stringify(value.result, null, 2));
  if (value?.task) parts.push(`claimed task: ${value.task}${value.claim_token ? `\nclaim token: ${value.claim_token}` : ''}`);
  if (value?.text) parts.push(String(value.text).trim());
  if (value?.code && value.code !== 0) parts.push(`(exit ${value.code})`);
  return parts.filter(Boolean).join('\n') || `playbook ${args.action}: ok`;
}

export function apply(ctx, config = {}) {
  const cfg = {
    playbookPath: config.playbookPath ?? '',
    playbookDir: config.playbookDir ?? '.agents-playbook',
    injectContext: config.injectContext ?? true,
    quietWhenIdle: config.quietWhenIdle ?? true,
    maxContextChars: config.maxContextChars ?? 4000,
    commandTimeoutMs: config.commandTimeoutMs ?? 120_000,
  };

  // Per-agent bookkeeping: the resolved root, the engine entry, and the claim token
  // for work this agent holds. A sub-agent gets its own entry, and its identity
  // chain names the parent, so the engine can verify entitlement.
  const store = new Map();
  const stateFor = (agent) => {
    const id = resolveAgentId({ agentId: agent?.id, sessionId: agent?.session?.id });
    if (!store.has(id)) {
      const workspace = agent?.session?.cwd || agent?.cwd || process.cwd();
      // pbPath (which engine) and cwd (which playbook) are separate on purpose: with
      // the engine bundled, the plugin can run against a workspace playbook that has
      // no engine of its own — and it must never target its own vendored copy.
      const engine = resolveEngine({ workspace, explicit: cfg.playbookPath });
      store.set(id, {
        id,
        sessionId: agent?.session?.id,
        workspace,
        root: engine.cwd,
        pb: engine.pbPath,
        engineSource: engine.source,
        engineVersion: engine.engine_version,
        workspaceVersion: engine.workspace_version,
        claimTokens: new Map(),
      });
    }
    return store.get(id);
  };

  // Re-resolve after an install/init so the agent picks up a freshly scaffolded
  // playbook without a session restart.
  const refresh = (state) => {
    const engine = resolveEngine({ workspace: state.workspace, explicit: cfg.playbookPath });
    state.root = engine.cwd;
    state.pb = engine.pbPath;
    state.engineSource = engine.source;
    state.engineVersion = engine.engine_version;
    state.workspaceVersion = engine.workspace_version;
    return state;
  };

  const call = (state, args, extraEnv = {}) => runPb(args, {
    pbPath: state.pb,
    cwd: state.root,
    timeoutMs: cfg.commandTimeoutMs,
    env: identityEnv({
      agentId: state.id,
      sessionId: state.sessionId,
      runtime: 'dsh',
      ...extraEnv,
    }),
  });

  const statusJson = (state) => {
    if (!state.root) return null;
    const r = call(state, ['status', '--json']);
    return r.ok ? parseJsonOutput(r.stdout) : null;
  };

  // ---------------------------------------------------------------------------
  // tool: playbook
  // ---------------------------------------------------------------------------
  const tool = defineTool({
    name: 'playbook',
    description:
      'Operate the Agent-Playbook loop in this workspace: orient (status/anchor), select work ' +
      '(next/claim), run a task\'s acceptance checks, record outcomes, and manage isolated git ' +
      'worktrees. "Done" in a playbook is an exit code, not a claim: `record` with status=done ' +
      're-runs the task\'s checks and REFUSES if any fail. Prefer this tool over shelling out to ' +
      'pb directly — it stamps your agent identity so multi-agent writes stay attributable.',
    parameters: {
      action: {
        type: 'string',
        required: true,
        description: 'One of: status, anchor, next, claim, task, check, record, worker, init, unlock, repair.',
      },
      task: { type: 'string', description: 'Task id (for task/check/record/worker).' },
      status: { type: 'string', description: 'Record status: done | blocked | in_progress (for action=record).' },
      notes: { type: 'string', description: 'Free-text note stored on the journal row (for action=record).' },
      files: { type: 'string', description: 'Comma-separated file list attributed to the record.' },
      skill: { type: 'string', description: 'Skill id to attach when planning or recording.' },
      workerAction: { type: 'string', description: 'create | status | exec | verify | merge | remove (for action=worker).' },
      workerAgent: { type: 'string', description: 'Agent label for the worktree slot (defaults to your agent id).' },
      command: { type: 'string', description: 'Command to run inside the worker worktree (for workerAction=exec).' },
      dryRun: { type: 'boolean', description: 'Preview without mutating where the engine supports it.' },
      force: { type: 'boolean', description: 'Pass --force where the engine supports it (recorded as forced).' },
    },
    // Every first-party tool needs an output contract: a schema for the value, and a
    // renderer producing the model-visible content blocks.
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          code: { type: 'number' },
          task: { type: 'string' },
          claim_token: { type: 'string' },
          status: { type: 'json' },
          result: { type: 'json' },
          text: { type: 'string' },
          error: { type: 'string' },
          detail: { type: 'string' },
        },
      },
      render(args, value) {
        return [{ type: 'text', text: renderToolResult(args, value) }];
      },
    },
    async execute({ action, task, status, notes, files, workerAction, workerAgent, command, dryRun, force } = {}, execCtx) {
      const state = stateFor(execCtx?.agent);
      // `init` is the one action that must work with NO playbook in the workspace: it
      // scaffolds one from the engine the plugin carries.
      if (action === 'init') {
        const bundled = bundledEngine();
        const target = join(state.workspace, cfg.playbookDir || '.agents-playbook');
        if (!bundled) {
          return { ok: false, error: 'no engine available', detail: 'This build has no bundled engine and the workspace has no playbook. Install the engine, or use a plugin build that bundles it.' };
        }
        const r = runPb(['scaffold', '--target', target], { pbPath: bundled.pb, cwd: bundled.root, env: {} });
        if (!r.ok) return { ok: false, code: r.code, text: r.stderr || r.stdout, error: 'scaffold failed' };
        refresh(state);
        const after = state.root
          ? runPb(['validate'], { pbPath: state.pb, cwd: state.root, env: {} })
          : { ok: false, code: 1, stderr: 'scaffold did not produce a discoverable playbook' };
        return {
          ok: after.ok,
          code: after.code,
          text: `${r.stdout || r.stderr}\n${after.stdout || after.stderr}`.trim(),
          result: { target, engine: bundled.root, engine_version: engineVersion(bundled.pb), validated: after.ok },
        };
      }
      if (!state.root) {
        return {
          ok: false,
          error: 'no playbook found',
          detail: 'No playbook.yaml in this workspace or its ancestors. Run `playbook action=init` to scaffold one from the engine this plugin carries.',
        };
      }
      const flag = (b) => (b ? ['--force'] : []);
      const dry = (b) => (b ? ['--dry-run'] : []);

      switch (action) {
        case 'status': {
          const r = call(state, ['status', '--json']);
          return { ok: r.ok, code: r.code, status: parseJsonOutput(r.stdout), text: r.stderr || r.stdout };
        }
        case 'anchor': {
          const r = call(state, ['anchor']);
          return { ok: r.ok, code: r.code, text: r.stdout || r.stderr };
        }
        case 'next': {
          const r = call(state, ['next']);
          return { ok: r.ok, code: r.code, text: r.stdout || r.stderr };
        }
        case 'claim': {
          const r = call(state, ['next', '--claim', ...flag(force)]);
          const claimed = parseClaimedTask(r.stdout);
          const token = parseClaimToken(r.stdout);
          // Keep the token so a sub-agent of this agent can prove entitlement, and so
          // this agent can release the claim later without re-reading the file.
          if (claimed && token) state.claimTokens.set(claimed, token);
          return { ok: r.ok, code: r.code, task: claimed, claim_token: token, text: r.stdout || r.stderr };
        }
        case 'task': {
          if (!task) return { ok: false, error: 'task id required' };
          const r = call(state, ['task', 'show', task, '--json']);
          return { ok: r.ok, code: r.code, task: parseJsonOutput(r.stdout), text: r.stderr };
        }
        case 'check': {
          if (!task) return { ok: false, error: 'task id required' };
          const r = call(state, ['validate', '--task', task]);
          return { ok: r.ok, code: r.code, text: r.stdout || r.stderr };
        }
        case 'record': {
          if (!task || !status) return { ok: false, error: 'task and status required' };
          const token = state.claimTokens.get(task);
          const args = ['record', '--task', task, '--action', 'execute', '--status', status];
          if (notes) args.push('--notes', notes);
          if (files) args.push('--files', files);
          if (token) args.push('--token', token);
          if (force) args.push('--force');
          const r = call(state, args);
          if (r.ok && ['done', 'blocked'].includes(status)) state.claimTokens.delete(task);
          return { ok: r.ok, code: r.code, text: r.stdout || r.stderr };
        }
        case 'worker': {
          if (!task) return { ok: false, error: 'task id required' };
          const sub = workerAction || 'status';
          const agentLabel = workerAgent || state.id;
          const base = ['worker', sub, task];
          if (sub === 'exec') {
            if (!command) return { ok: false, error: 'command required for workerAction=exec' };
            base.push('--', command);
          } else {
            base.push('--agent', agentLabel);
          }
          if (['create', 'merge', 'remove'].includes(sub)) base.push(...flag(force), ...(dryRun ? ['--dry-run'] : ['--execute']));
          if (sub === 'status' || sub === 'verify') base.push('--json');
          const r = call(state, base);
          return { ok: r.ok, code: r.code, result: parseJsonOutput(r.stdout), text: r.stderr || r.stdout };
        }
        case 'unlock': {
          const r = call(state, ['unlock', ...flag(force)]);
          return { ok: r.ok, code: r.code, text: r.stdout || r.stderr };
        }
        case 'repair': {
          const r = call(state, ['repair-state', ...(dryRun ? ['--check'] : ['--apply']), '--json']);
          return { ok: r.ok, code: r.code, result: parseJsonOutput(r.stdout), text: r.stderr };
        }
        default:
          return { ok: false, error: `unknown action "${action}"`, detail: 'Valid: status, anchor, next, claim, task, check, record, worker, init, unlock, repair.' };
      }
    },
  });

  ctx.tools.register(tool);

  // ---------------------------------------------------------------------------
  // skill catalog: expose the playbook's own skills to the harness
  // ---------------------------------------------------------------------------
  // Namespaced `playbook-<id>`: a harness skill is invoked by slot and a playbook
  // skill by path, so a bare id could collide with an unrelated harness skill of the
  // same name. The catalog is DISCOVERED LIVE from the engine on each list, so a skill
  // added to `skills/index.yaml` appears without a restart, and the engine's own mode
  // resolution decides which skills are active (nothing is re-implemented here).
  //
  // Registered through `ctx.inject` (see the `inject` note above): the registry is a
  // runtime dependency, so a deployment without it still gets the tool.
  {
    const readFileSync = (path) => readFileSyncImpl(path, 'utf8');
    const provider = {
      name: 'agent-playbook',
      async list(options = {}) {
        const workspace = options.cwd || process.cwd();
        const engine = resolveEngine({ workspace, explicit: cfg.playbookPath });
        if (!engine.cwd || !engine.pbPath) return [];
        const r = runPb(['list', 'skills', '--json'], {
          pbPath: engine.pbPath, cwd: engine.cwd, timeoutMs: cfg.commandTimeoutMs, env: {},
        });
        if (!r.ok) return [];
        const catalogs = parseJsonOutput(r.stdout);
        const candidates = buildPlaybookSkills({ catalogs, root: engine.cwd, readFile: readFileSync });
        return candidates.map((c) => {
          const { content, ...summary } = c;
          void content;
          return summary;
        });
      },
      async get(candidate) {
        // The candidate carries everything `get` needs; a disappearing file is a
        // `undefined` return, which the registry treats as "no longer loadable".
        const locator = candidate?.locator;
        if (!locator?.file) return undefined;
        const root = candidate?.metadata?.playbook_root || cfg.playbookPath;
        if (!root) return undefined;
        const full = join(root, locator.file);
        let text;
        try { text = readFileSync(full); } catch { return undefined; }
        const { frontmatter, body } = parseSkillFile(text);
        return {
          name: candidate.name,
          description: candidate.description,
          ...(frontmatter.whenToUse ? { whenToUse: frontmatter.whenToUse } : {}),
          invocation: { modelInvocable: true, userInvocable: true },
          source: 'custom',
          provider: 'agent-playbook',
          resourceBase: { kind: 'directory', path: dirname(full) },
          path: full,
          metadata: candidate.metadata,
          content: renderPlaybookSkillBody({ id: locator.id, process: locator.process, file: locator.file, body }),
        };
      },
    };
    // `ctx.inject` may be absent in a test double; registering is a bonus either way.
    if (typeof ctx.inject === 'function') {
      ctx.inject(['skills'], (skillsCtx) => {
        if (skillsCtx?.skills?.registerProvider) skillsCtx.skills.registerProvider(provider);
      });
    } else if (ctx.skills?.registerProvider) {
      ctx.skills.registerProvider(provider);
    }
  }

  // ---------------------------------------------------------------------------
  // context injection: keep the constitution salient across compaction
  // ---------------------------------------------------------------------------
  // Mechanism (verified against the shipped `dsh-agent-instructions` package, which
  // does exactly this): stage a user-role message on the agent's inbox for the next
  // STEP boundary. It becomes part of the next request, so the North Star, the
  // active loop, and the checks of the task in hand survive compaction and long
  // sessions — which is the whole point of the engine's re-anchor design.
  if (!cfg.injectContext) return;
  ctx.on('agent/pre-step', async ({ agent, signal }, next) => {
    const decision = await next();
    if (decision.kind === 'reject') return decision;
    // An aborted step is being torn down: staging context for a batch that will not run
    // is wasted work, and its message could surface on a later, unrelated step.
    if (signal?.aborted) return decision;

    const state = stateFor(agent);
    if (!state.root || !existsSync(state.pb)) return decision;
    const status = statusJson(state);
    if (!status) return decision;

    const counts = status.backlog?.counts || {};
    const idle = (counts.todo ?? 0) === 0 && (counts.in_progress ?? 0) === 0;
    if (cfg.quietWhenIdle && idle) return decision;

    // The task in hand, if this agent holds one — its checks are what "done" means.
    const held = (status.backlog?.in_progress || []).find((t) => t.claimed_by === state.id);
    let task = null;
    if (held?.id) {
      const tr = call(state, ['task', 'show', held.id, '--json']);
      if (tr.ok) task = parseJsonOutput(tr.stdout)?.task || null;
    }

    // Surface projection drift: a silent disagreement between the record and the view
    // is exactly the failure mode this project refuses to tolerate, so the model is
    // told about it rather than discovering it later.
    let driftWarning = null;
    const drift = call(state, ['repair-state', '--check', '--json']);
    if (drift.code !== 0) {
      const driftJson = parseJsonOutput(drift.stdout);
      if (driftJson?.drift?.length) driftWarning = `state projection disagrees with the journal in ${driftJson.drift.length} task(s) — playbook action=repair`;
      else if (driftJson?.lost_state_write) driftWarning = 'the journal is ahead of the state projection — a write was lost; playbook action=repair';
    }

    const block = buildContextBlock({ status, task, driftWarning, maxChars: cfg.maxContextChars });
    if (!block) return decision;
    try {
      const message = createUserMessage({
        content: [{ type: 'text', text: block }],
        source: { kind: 'agent-playbook', form: 'instructions' },
      });
      // `agent.inject(message)` is the purpose-built API for model-facing context: it
      // queues for the next pre-step WITHOUT waking the driver, which is exactly this
      // case (the step is already running). `inbox.append('next-step', …)` is the older
      // shape used by first-party `dsh-agent-instructions`, and is the fallback so a
      // deployment whose Agent lacks `inject` still gets the context rather than nothing.
      if (typeof agent.inject === 'function') agent.inject(message);
      else agent.inbox.append('next-step', message);
    } catch (e) {
      // Staging context is a convenience; failing to stage it must never fail the
      // agent's step. The tool surface still works.
      ctx.logger?.warn?.('agent-playbook: could not stage context: %o', e);
    }
    return decision;
  });
}
