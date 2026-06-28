#!/usr/bin/env node

import { readFileSync } from 'node:fs';

const path = 'EVAL_SIDECAR_ROADMAP.md';
const text = readFileSync(path, 'utf8');

let pass = 0;
let fail = 0;
function check(name, condition) {
  if (condition) {
    console.log(`  PASS  ${name}`);
    pass++;
  } else {
    console.error(`  FAIL  ${name}`);
    fail++;
  }
}

check('roadmap defines the Playbook/Sidecar/Tauri/MCP boundaries',
  /Playbook remains the harness, policy, and loop engine/i.test(text) &&
  /Evaluation Sidecar becomes the evaluation engine/i.test(text) &&
  /Tauri is the desktop console/i.test(text) && /MCP is an agent-facing adapter/i.test(text));
check('roadmap covers LangSmith comparison and current gaps',
  /LangSmith/i.test(text) && /final response/i.test(text) && /single step/i.test(text) &&
  /trajectory/i.test(text) && /offline/i.test(text) && /online/i.test(text) && /pairwise/i.test(text));
check('roadmap defines immutable evidence, result, and receipt schemas',
  /### Evidence bundle/.test(text) && /### Evaluator result/.test(text) && /### Receipt/.test(text) &&
  /evidence_sha256/.test(text) && /signature/.test(text));
check('roadmap defines an explicit evaluation state machine',
  /collecting/.test(text) && /sealed/.test(text) && /evaluating/.test(text) &&
  /pass \| block \| inconclusive/.test(text) && /superseded/.test(text));
check('roadmap defines CLI, MCP, Tauri, and headless surfaces',
  /Headless CI/.test(text) && /MCP stdio/.test(text) && /Streamable HTTP/.test(text) &&
  /Tauri desktop/.test(text) && /pb eval run/.test(text));
check('roadmap prevents agent-accessible overrides and arbitrary execution',
  /Never expose to agent MCP/.test(text) && /Waive or override/.test(text) &&
  /Execute arbitrary shell commands/.test(text));
check('roadmap includes trust, storage, security, and retention',
  /## 14\. Security and trust model/.test(text) && /## 15\. Storage and retention/.test(text) &&
  /content-addressed/.test(text) && /Origin/.test(text) && /redact/i.test(text));
check('roadmap has at least eight delivery phases with exit gates',
  (text.match(/^### Phase \d+/gm) || []).length >= 8 && (text.match(/^Exit gate:/gm) || []).length >= 8);
check('roadmap includes prioritized dependent backlog',
  /## 17\. Prioritized implementation backlog/.test(text) && /ES-001/.test(text) &&
  /ES-024/.test(text) && /Depends on/.test(text));
check('roadmap includes tests, metrics, risks, decisions, and MVP done criteria',
  /## 18\. Testing strategy/.test(text) && /## 19\. Success metrics/.test(text) &&
  /## 20\. Risks and mitigations/.test(text) && /## 21\. Open decisions/.test(text) &&
  /## 22\. MVP definition of done/.test(text));
check('roadmap cites official LangSmith, Tauri, and MCP references',
  /docs\.langchain\.com\/langsmith\/evaluation-approaches/.test(text) &&
  /v2\.tauri\.app\/develop\/sidecar/.test(text) &&
  /modelcontextprotocol\.io\/specification/.test(text));
check('roadmap contains no unresolved placeholder markers', !/\b(?:TODO|TBD|FIXME)\b/.test(text));

console.log(`\ncheck-eval-sidecar-roadmap: ${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
