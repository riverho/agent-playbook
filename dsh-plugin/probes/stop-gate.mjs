// ============================================================================
//  probes/stop-gate.mjs — verify that a turn-stopping handler can REFUSE to let
//  a turn end, against a live harness session.
// ----------------------------------------------------------------------------
// This is a PROBE, not a feature. It answers one question the deterministic suite
// (scripts/test-dsh-stop-gate.mjs) cannot, because that suite never runs a model:
//
//     does agent.steer() from agent/turn-stopping actually buy another step?
//
// What the suite already proved from the real source and the real dispatch path:
//   - the handler receives `agent` (dispatch.js fuses it into the payload);
//   - the event is SERIAL, so the handler takes one argument, not (payload, next);
//   - the loop re-tests `inbox.nextStep.length === 0` AFTER the dispatch, so steering
//     is what keeps the turn open.
//
// What only a live turn can show is that the whole chain holds end to end — and that is
// exactly the step RELEASE.md calls out as human-only, because it costs a model call.
//
// HOW IT PROVES IT: the probe steers on the FIRST fire for a turn and stays silent after.
// If steering works, the loop runs another step and fires again for the SAME turn — that
// second record, same turn, `action: "observed-continuation"`, IS the proof. Seeing only
// fire 1 means steering did not continue the turn.
//
// SAFETY — a `Stop` hook that always blocks force-continues every step forever (the
// harness documents this). So the probe steers at most ONCE PER TURN and at most
// PB_STOP_GATE_PROBE_MAX times per process (default 2), never throws, and does nothing
// at all when PB_STOP_GATE_PROBE=off.
// ============================================================================

import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createUserMessage } from '@deepseek-ai/dsh-llm';

export const name = 'stop-gate-probe';
export const inject = [];

const EVIDENCE = process.env.PB_STOP_GATE_PROBE_FILE
  || join(tmpdir(), 'pb-stop-gate-probe.ndjson');
const MAX_STEERS = Number(process.env.PB_STOP_GATE_PROBE_MAX ?? 2);
const ENABLED = process.env.PB_STOP_GATE_PROBE !== 'off';

// The instruction handed back to the model. Deliberately trivial and self-announcing: this
// proves the MECHANISM, and must not look like real work worth doing.
const STEER_TEXT =
  '[stop-gate probe] This turn was kept open by a turn-stopping handler. '
  + 'Reply with one short sentence acknowledging it, then stop. Do not call any tool.';

function record(row) {
  try {
    mkdirSync(dirname(EVIDENCE), { recursive: true });
    appendFileSync(EVIDENCE, `${JSON.stringify(row)}\n`, 'utf8');
  } catch { /* a probe must never break the session it measures */ }
}

export function apply(ctx) {
  record({
    kind: 'probe-start',
    at: new Date().toISOString(),
    evidence: EVIDENCE,
    enabled: ENABLED,
    maxSteers: MAX_STEERS,
    node: process.version,
    cwd: process.cwd(),
  });

  const firesPerAgent = new Map();
  let steersIssued = 0;

  ctx.on('agent/turn-stopping', async ({ agent, turn, signal }) => {
    // Everything is contained: a throwing listener here would surface as a failed turn in
    // the session being measured, which would corrupt the very evidence we are collecting.
    try {
      const key = agent?.id ?? agent?.session?.id ?? 'unknown';
      const fire = (firesPerAgent.get(key) ?? 0) + 1;
      firesPerAgent.set(key, fire);

      const inboxBefore = agent?.inbox?.nextStep?.length ?? null;
      let action = 'none';

      if (!ENABLED) {
        action = 'disabled';
      } else if (fire > 1) {
        // A later fire for the same turn is only reachable if the earlier steer worked.
        action = 'observed-continuation';
      } else if (steersIssued >= MAX_STEERS) {
        action = 'skip-max-steers';
      } else if (typeof agent?.steer !== 'function') {
        action = 'no-steer-method';
      } else {
        agent.steer(createUserMessage({
          content: [{ type: 'text', text: STEER_TEXT }],
          source: { kind: 'stop-gate-probe', form: 'instructions' },
        }));
        steersIssued += 1;
        action = 'steer';
      }

      record({
        kind: 'turn-stopping',
        at: new Date().toISOString(),
        agent: key,
        turn,
        fire,
        inboxBefore,
        action,
        steersIssued,
        aborted: signal?.aborted ?? null,
        agentArrived: agent !== undefined,
        canSteer: typeof agent?.steer === 'function',
      });
    } catch (error) {
      record({ kind: 'probe-error', at: new Date().toISOString(), message: String(error?.message || error) });
    }
  });
}
