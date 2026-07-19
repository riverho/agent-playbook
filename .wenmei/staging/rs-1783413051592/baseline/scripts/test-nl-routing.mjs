#!/usr/bin/env node
// scripts/test-nl-routing.mjs
// ----------------------------------------------------------------------------
// Behavioral test for the natural-language intent matcher.
// Asserts that canonical phrasings route to the correct intent. If you change
// scripts/lib/nl-router.mjs and break a routing, this fails — the agent and
// human both know.
// ----------------------------------------------------------------------------

import { route, version, INTENTS } from './lib/nl-router.mjs';

// Phrase → expected intent. Each entry is a single canonical phrasing for the
// intent. The grammar allows many paraphrases per intent; the table covers
// the load-bearing ones (precedence edges + every intent at least once).
const CASES = [
  // precedence edges ------------------------------------------------------
  ['what\'s next?',                              'select'],
  ['claim the next task',                        'claim'],
  ['pick the next one',                          'claim'],
  ['let\'s do the next task',                    'claim'],
  ['next task',                                  'select'],
  ['show me the backlog',                        'select'],

  ['is it green?',                               'verify'],
  ['validate task oc-plugin',                    'verify-task'],
  ['run the checks for plan-001',                'verify-task'],
  ['verify',                                     'verify'],

  ['mark it done',                               'record-done'],
  ['I\'m done',                                  'record-done'],
  ['finished it',                                'record-done'],
  ['mark it blocked',                            'record-blocked'],
  ['it is blocked',                              'record-blocked'],

  ['new phase',                                  'cycle-new'],
  ['open a new cycle',                           'cycle-new'],
  ['new loop',                                   'loop-new'],
  ['fresh loop',                                 'loop-new'],
  ['ground-up',                                  'loop-new'],

  ['reflect',                                    'reflect'],
  ['close the phase',                            'reflect'],
  ['wrap it up',                                 'reflect'],
  ['close the loop',                             'loop-close'],

  // every intent at least once --------------------------------------------
  ['status',                                     'orient'],
  ['where are we',                               'orient'],
  ['orient',                                     'orient'],

  ['add a task to fix the bug',                  'plan'],
  ['queue this up: do X',                        'plan'],
  ['backlog: ship Y',                            'plan'],

  ['validate',                                   'verify'],
  ['run the guardrails',                         'verify'],

  ['report',                                     'report'],
  ['show me the report',                         'report'],
  ['roll up',                                    'report'],

  ['I learned that X matters',                   'learn'],
  ['capture this lesson',                        'learn'],
  ['lesson: A -> B',                             'learn'],

  ['re-anchor',                                  'anchor'],
  ['anchor',                                     'anchor'],

  ['checkpoint',                                 'checkpoint'],
  ['resume',                                     'checkpoint'],

  ['scaffold into ./foo',                        'scaffold'],
  ['install this playbook',                      'scaffold'],

  ['help',                                       'help'],
  ['what can you do',                            'help'],

  // fallback --------------------------------------------------------------
  ['xyzzy nothing matches',                      'unknown'],
  ['',                                           'unknown'],
];

// Also assert: every intent in INTENTS is exercised at least once.
const covered = new Set(CASES.map(([, i]) => i));
const uncovered = INTENTS.map((d) => d.id).filter((id) => !covered.has(id));
if (uncovered.length) {
  console.error(`UNCOVERED intents (no test case): ${uncovered.join(', ')}`);
  console.error('Add at least one canonical phrasing per intent to keep the table honest.');
  process.exit(1);
}

let pass = 0;
let fail = 0;
const failures = [];

for (const [phrase, expected] of CASES) {
  const got = route(phrase).intent;
  if (got === expected) {
    pass++;
  } else {
    fail++;
    failures.push({ phrase, expected, got });
  }
}

console.log(`test-nl-routing (v${version}): ${pass} pass, ${fail} fail`);
if (fail > 0) {
  console.error('\nFAILURES:');
  for (const f of failures) {
    console.error(`  phrase:    ${JSON.stringify(f.phrase)}`);
    console.error(`  expected:  ${f.expected}`);
    console.error(`  got:       ${f.got}`);
    console.error('');
  }
  process.exit(1);
}

// Sanity: precedence invariant — "claim the next task" must NEVER route to
// select or anything else after a fix. Re-assert the load-bearing edges.
const edges = [
  ['claim the next task', 'claim'],
  ['validate task oc-plugin', 'verify-task'],
  ['it is blocked', 'record-blocked'],
  ['new phase', 'cycle-new'],
];
for (const [phrase, want] of edges) {
  if (route(phrase).intent !== want) {
    console.error(`precedence edge broken: ${JSON.stringify(phrase)} -> ${route(phrase).intent} (want ${want})`);
    process.exit(1);
  }
}

console.log('PASS: precedence edges hold (claim/select, verify/verify-task, record-done/record-blocked, cycle-new/loop-new).');
