#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import yaml from 'js-yaml';

const skillPath = 'modes/coding/skills/pencil-design-layout-conformance/SKILL.md';
const processPath = 'modes/coding/processes/pencil-design-layout-conformance.yaml';
const skillIndex = yaml.load(readFileSync('modes/coding/skills/index.yaml', 'utf8'));
const processIndex = yaml.load(readFileSync('modes/coding/processes/index.yaml', 'utf8'));
const globalSkillIndex = yaml.load(readFileSync('skills/index.yaml', 'utf8'));
const demoSkillIndex = yaml.load(readFileSync('modes/demo/skills/index.yaml', 'utf8'));
const skillText = readFileSync(skillPath, 'utf8');
const agentMetadata = readFileSync('modes/coding/skills/pencil-design-layout-conformance/agents/openai.yaml', 'utf8');
const processDoc = yaml.load(readFileSync(processPath, 'utf8'));
const processText = JSON.stringify(processDoc);

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

const skillEntry = skillIndex.skills?.find((entry) => entry.id === 'pencil-design-layout-conformance');
const processEntry = processIndex.processes?.find((entry) => entry.id === 'pencil-design-layout-conformance');
check('skill is registered through the coding pack index',
  skillEntry?.file === skillPath && skillEntry?.process === 'pencil-design-layout-conformance');
check('skill does not leak into global or demo indices',
  !globalSkillIndex.skills?.some((entry) => entry.id === 'pencil-design-layout-conformance') &&
  !demoSkillIndex.skills?.some((entry) => entry.id === 'pencil-design-layout-conformance'));
check('old live skill, process, and test paths are removed',
  !existsSync('modes/coding/skills/design-layout-conformance/SKILL.md') &&
  !existsSync('modes/coding/processes/design-layout-conformance.yaml') &&
  !existsSync('scripts/test-design-layout-conformance-skill.mjs'));
check('canonical process is registered through the coding pack index', processEntry?.file === processPath);
check('skill frontmatter names the skill and includes trigger contexts',
  /^---[\s\S]*name: pencil-design-layout-conformance[\s\S]*description:.*Pencil[\s\S]*---/m.test(skillText) &&
  /before broad codebase analysis/i.test(skillText));
check('skill UI metadata provides an explicit invocation prompt', /\$pencil-design-layout-conformance/.test(agentMetadata));

check('process position is after approved design source and before broad analysis/production',
  /DESIGN\.md/i.test(JSON.stringify(processDoc.position?.after)) &&
  /Pencil/i.test(JSON.stringify(processDoc.position?.after)) &&
  /Broad implementation-oriented codebase analysis/i.test(JSON.stringify(processDoc.position?.before)) &&
  /Production screen implementation/i.test(JSON.stringify(processDoc.position?.before)));
check('process returns during per-screen verification', /every production screen slice/i.test(JSON.stringify(processDoc.position?.returns_during)));

const stepNames = (processDoc.canonical_steps || []).map((step) => step.name);
check('source contract precedes contract-guided codebase analysis and golden proof',
  stepNames.indexOf('Write the source-side design-contract.yaml') < stepNames.indexOf('Analyze the codebase through the contract') &&
  stepNames.indexOf('Analyze the codebase through the contract') < stepNames.indexOf('Build and prove one golden screen'));

const outputIds = new Set((processDoc.outputs || []).map((output) => output.id));
check('process outputs contract, golden screen, command, and evidence',
  ['layout-contract', 'golden-screen', 'verification-command', 'evidence'].every((id) => outputIds.has(id)));
check('Pencil adapter standardizes design-contract.yaml with source.kind pencil',
  processDoc.outputs?.find((output) => output.id === 'layout-contract')?.path === 'design-contract.yaml' &&
  /source.kind pencil/i.test(processText));
check('bounded analysis targets canonical APIs, deprecations, examples, tokens, and harnesses',
  /canonical component library\/public APIs/i.test(processText) && /deprecated paths/i.test(processText) &&
  /compilable examples/i.test(processText) && /design tokens/i.test(processText) && /test harness/i.test(processText));
check('process requires stable Pencil provenance and responsive state coverage',
  /Stable Pencil/i.test(processText) && /viewport\/state matrix/i.test(processText));
check('process stabilizes rendering inputs that commonly shift layouts',
  /device scale/i.test(processText) && /font/i.test(processText) && /fixture data/i.test(processText) && /animation/i.test(processText));
check('process combines geometry, visual, and interaction verification',
  /DOM geometry/i.test(processText) && /screenshot/i.test(processText) && /interaction/i.test(processText));
check('golden command must fail on a deliberate layout perturbation', /Intentionally perturb/i.test(processText));
check('failure messages explain expected versus actual layout and a repair path',
  /repair-oriented/i.test(processText) && /expected relationship or bounds/i.test(processText) && /actual result/i.test(processText));
check('anti-gaming and separate human attestation are required',
  /weakened thresholds/i.test(processText) && /regenerated baselines/i.test(processText) && /human visual attestation/i.test(processText));
check('readiness and completion announcements are evidence-gated',
  /LAYOUT CONTRACT READY/.test(processText) && /LAYOUT CONFORMANCE PASSED/.test(processText) && /zero exit code/i.test(processText));

console.log(`\ntest-pencil-design-layout-conformance-skill: ${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
