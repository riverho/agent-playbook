#!/usr/bin/env node
// scripts/test-dsh-stop-gate.mjs
// ----------------------------------------------------------------------------
// Can the harness FORCE an agent to finish verifying before a turn ends?
//
// That is the whole question behind binding Agent-Playbook's "done is an enforced exit
// code" to the runtime instead of to the agent's cooperation. The answer is
// `agent/turn-stopping`, and the value of this suite is that it pins the four facts the
// gate depends on, each at its real source rather than at a summary of it:
//
//   1. the event exists and is agent-scoped;
//   2. the handler RECEIVES the agent (the loop dispatches `{ turn, signal }`, so this is
//      the fact most likely to be wrong, and it is the one the docs do not show);
//   3. the handler cannot be lied to about the subject — an injected `agent` beats one
//      carried in the payload;
//   4. it is dispatched SERIAL, so the handler takes exactly ONE argument. `agent/pre-step`
//      is a waterfall `(payload, next)`, and copying that shape here would silently break
//      the gate.
//
// Facts 1-3 are executed against the REAL dispatch machinery (`agentEvents().serial`, the
// same function the loop calls), not a stub. Fact 4 is read from the loop because it is a
// source-level property: the turn ends only if the inbox is STILL empty after the dispatch,
// which is precisely what makes `steer()` able to keep it open.
//
// What this does NOT prove: that steering a real agent through a real turn behaves well.
// That needs a live model call. `dsh-plugin/probes/stop-gate.mjs` records that evidence
// from a real session; RELEASE.md states the gap.
// ----------------------------------------------------------------------------

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

let pass = 0;
let fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { console.log(`  PASS  ${name}`); pass++; }
  else { console.error(`  FAIL  ${name}${extra ? `\n        ${extra}` : ''}`); fail++; }
}

const DSH_CANDIDATES = [
  process.env.DSH_PACKAGES,
  'C:/Users/RH/AppData/Local/npm-cache/_npx/1e7f6d9597241db0/node_modules/@deepseek-ai',
  join(process.env.LOCALAPPDATA || '', 'npm-cache/_npx'),
].filter(Boolean);
function harnessDir() {
  for (const base of DSH_CANDIDATES) {
    if (base && existsSync(join(base, 'dsh-tools/package.json'))) return base;
  }
  return null;
}
const harness = harnessDir();
if (!harness) {
  console.log('  SKIP  harness packages not available — set DSH_PACKAGES to a @deepseek-ai directory to run this suite');
  console.log('\ntest-dsh-stop-gate: skipped (0 pass, 0 fail)');
  process.exit(0);
}
const url = (rel) => pathToFileURL(join(harness, rel)).href;

// --- 1. the event is declared, and it is agent-scoped ------------------------
{
  const invariant = readFileSync(join(harness, 'dsh-scope/lib/invariant.js'), 'utf8');
  ok('agent/turn-stopping is a scope-filtered event whose subject is the payload agent',
    /"agent\/turn-stopping":\s*\(args\)\s*=>\s*args\[0\]\["agent"\]/.test(invariant),
    'dsh-scope declares the routing subject; without it the event is not agent-scoped');
  ok('it is routed identically to agent/pre-step (the event this plugin already consumes)',
    /"agent\/pre-step":\s*\(args\)\s*=>\s*args\[0\]\["agent"\]/.test(invariant));
}

// --- 2-4. execute the REAL dispatch path ------------------------------------
const { Context } = await import(url('cordis/lib/index.js'));
const { agentEvents } = await import(url('dsh-agent/lib/index.js'));

{
  const ctx = new Context();
  const seen = [];
  ctx.on('agent/turn-stopping', async (payload, ...rest) => {
    seen.push({ payload, extraArgs: rest.length });
    return 'handler-return';
  });

  const agent = { id: 'gate-probe', session: { id: 'gate-session' }, inbox: { nextStep: [] } };
  const signal = new AbortController().signal;
  let returned;
  let threw = null;
  try {
    // EXACTLY the call the loop makes: dispatch.serial(name, { turn, signal }).
    returned = await agentEvents(ctx, agent).serial('agent/turn-stopping', { turn: 7, signal });
  } catch (e) { threw = e; }

  ok('dispatching as the loop does reaches the listener', !threw && seen.length === 1,
    threw ? String(threw.message) : `fired=${seen.length}`);
  const got = seen[0]?.payload;
  ok('the handler RECEIVES the agent even though the loop passes only { turn, signal }',
    got?.agent === agent, `payload keys: ${JSON.stringify(Object.keys(got ?? {}))}`);
  ok('the turn number and abort signal ride along', got?.turn === 7 && got?.signal === signal);
  ok('it is dispatched SERIAL: the handler takes exactly ONE argument (not (payload, next))',
    seen[0]?.extraArgs === 0, `extra args after payload: ${seen[0]?.extraArgs}`);
  ok('serial awaits the handler and returns its value',
    returned === 'handler-return', `returned=${JSON.stringify(returned)}`);
}

// --- 3. the injected subject cannot be spoofed ------------------------------
{
  const ctx = new Context();
  let got = null;
  ctx.on('agent/turn-stopping', (payload) => { got = payload; });
  const real = { id: 'real-agent' };
  const decoy = { id: 'decoy-agent' };
  await agentEvents(ctx, real).serial('agent/turn-stopping', { turn: 1, agent: decoy });
  ok('a payload carrying its own `agent` cannot override the dispatched subject',
    got?.agent === real && got?.agent !== decoy,
    `received=${got?.agent?.id} (must be real-agent, never decoy-agent)`);
}

// --- 4. the loop's break rule: the reason steering can keep a turn open ------
{
  const loop = readFileSync(join(harness, 'dsh-agent-loop/lib/index.js'), 'utf8');
  const at = loop.indexOf('"agent/turn-stopping"');
  ok('the loop dispatches agent/turn-stopping', at !== -1);

  // The gate works only because the SAME emptiness test runs again AFTER the dispatch:
  // a handler that steers makes the inbox non-empty, so the break is skipped and the turn
  // continues. If a future version tested emptiness only once, steering from here would
  // become a no-op and this suite must go red rather than let the gate rot silently.
  const after = at === -1 ? '' : loop.slice(at, at + 260);
  const empties = (after.match(/nextStep\.length === 0/g) || []).length;
  ok('the inbox emptiness test runs AGAIN after the dispatch (so steering keeps the turn open)',
    empties >= 1, `found ${empties} post-dispatch emptiness test(s) in:\n${after.slice(0, 220)}`);
  ok('the dispatch is awaited (a handler can affect this turn, not the next)',
    /await this\.dispatch\.serial\("agent\/turn-stopping"/.test(loop));
}

// --- 5. CONTROL: the agent is injected by the fused dispatcher, not by magic --
// Without this, "the handler receives the agent" could pass for a reason that has nothing
// to do with the mechanism the gate relies on. Dispatching the same event through the
// plain context must NOT produce an agent: the injection belongs to `agentEvents`.
{
  const ctx = new Context();
  let got = null;
  ctx.on('agent/turn-stopping', (payload) => { got = payload; });
  let threw = null;
  try { await ctx.parallel('agent/turn-stopping', { turn: 1 }); } catch (e) { threw = e; }
  ok('CONTROL: a plain dispatch delivers NO agent — the injection is the fused dispatcher\'s',
    !threw && got !== null && got.agent === undefined,
    threw ? String(threw.message) : `payload keys: ${JSON.stringify(Object.keys(got ?? {}))}`);
}

console.log(`\ntest-dsh-stop-gate: ${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
