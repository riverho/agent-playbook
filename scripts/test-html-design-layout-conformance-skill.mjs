#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';

const id = 'html-design-layout-conformance';
const skillPath = `modes/coding/skills/${id}/SKILL.md`;
const processPath = `modes/coding/processes/${id}.yaml`;
const metadataPath = `modes/coding/skills/${id}/agents/openai.yaml`;
const templatePath = `modes/coding/skills/${id}/assets/design-contract.template.yaml`;
const skillIndex = yaml.load(readFileSync('modes/coding/skills/index.yaml', 'utf8'));
const processIndex = yaml.load(readFileSync('modes/coding/processes/index.yaml', 'utf8'));
const globalSkillIndex = yaml.load(readFileSync('skills/index.yaml', 'utf8'));
const demoSkillIndex = yaml.load(readFileSync('modes/demo/skills/index.yaml', 'utf8'));
const skillText = readFileSync(skillPath, 'utf8');
const metadataText = readFileSync(metadataPath, 'utf8');
const processDoc = yaml.load(readFileSync(processPath, 'utf8'));
const processText = JSON.stringify(processDoc);
const templateDoc = yaml.load(readFileSync(templatePath, 'utf8'));

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

const skillEntry = skillIndex.skills?.find((entry) => entry.id === id);
const processEntry = processIndex.processes?.find((entry) => entry.id === id);
check('skill and process are registered through the coding pack',
  skillEntry?.file === skillPath && skillEntry?.process === id && processEntry?.file === processPath);
check('skill does not leak into global or demo indices',
  !globalSkillIndex.skills?.some((entry) => entry.id === id) &&
  !demoSkillIndex.skills?.some((entry) => entry.id === id));
check('frontmatter and UI metadata expose HTML-specific triggers',
  /^---[\s\S]*name: html-design-layout-conformance[\s\S]*description:.*HTML[\s\S]*---/m.test(skillText) &&
  /before broad codebase analysis/i.test(skillText) && /\$html-design-layout-conformance/.test(metadataText));
check('process sits after approved HTML and before broad analysis/production scale-out',
  /Canonical HTML/i.test(JSON.stringify(processDoc.position?.after)) &&
  /Broad implementation-oriented codebase analysis/i.test(JSON.stringify(processDoc.position?.before)) &&
  /Production screen implementation/i.test(JSON.stringify(processDoc.position?.before)) &&
  /every production screen slice/i.test(JSON.stringify(processDoc.position?.returns_during)));

const stepNames = (processDoc.canonical_steps || []).map((step) => step.name);
check('source contract precedes contract-guided codebase analysis and golden proof',
  stepNames.indexOf('Write design-contract.yaml') < stepNames.indexOf('Analyze the codebase through the contract') &&
  stepNames.indexOf('Analyze the codebase through the contract') < stepNames.indexOf('Prove the contract gate'));

const outputIds = new Set((processDoc.outputs || []).map((output) => output.id));
check('process outputs contract, reference, golden screen, command, and evidence',
  ['design-contract', 'canonical-reference', 'golden-screen', 'verification-command', 'evidence']
    .every((outputId) => outputIds.has(outputId)));
check('template is source-neutral schema with the HTML adapter selected',
  templateDoc.schema_version === 1 && templateDoc.source?.kind === 'html' &&
  templateDoc.source?.selector_attribute === 'data-design-id');
check('template covers states, viewports, regions, tolerances, checks, and attestation',
  Array.isArray(templateDoc.screens?.[0]?.states) && Array.isArray(templateDoc.screens?.[0]?.viewports) &&
  Array.isArray(templateDoc.screens?.[0]?.regions) && templateDoc.screens?.[0]?.geometry?.position_tolerance_px != null &&
  Array.isArray(templateDoc.screens?.[0]?.checks) && templateDoc.attestation?.required === true);
check('bounded analysis targets canonical APIs, deprecations, examples, tokens, and harnesses',
  /canonical component library\/public APIs/i.test(processText) && /deprecated paths/i.test(processText) &&
  /compilable examples/i.test(processText) && /design tokens/i.test(processText) && /test harness/i.test(processText));
check('process versions HTML and uses stable semantic anchors',
  /revision or checksum/i.test(processText) && /data-design-id/i.test(processText) &&
  /generated class names/i.test(processText));
check('reference and app render in the same deterministic environment',
  /same browser build/i.test(processText) && /device scale/i.test(processText) &&
  /fonts/i.test(processText) && /fixture/i.test(processText) && /animation/i.test(processText));
check('process combines geometry, screenshots, responsive, and interaction checks',
  /DOM geometry/i.test(processText) && /screenshot/i.test(processText) &&
  /responsive/i.test(processText) && /interaction/i.test(processText));
check('process prevents copying prototype structure as production architecture',
  /do not copy prototype markup/i.test(processText) && /mapped production components/i.test(processText));
check('verification command must fail on a deliberate layout perturbation', /Deliberately perturb/i.test(processText));
check('failure output is repair-oriented and explains expected versus actual layout',
  /repair-oriented/i.test(processText) && /expected relationship or bounds/i.test(processText) &&
  /actual result/i.test(processText));
check('anti-gaming and approved reference updates are enforced',
  /weakened tolerances/i.test(processText) && /regenerated baselines/i.test(processText) &&
  /approved design change/i.test(processText));
check('readiness and completion announcements require evidence and attestation',
  /HTML LAYOUT CONTRACT READY/.test(processText) && /HTML LAYOUT CONFORMANCE PASSED/.test(processText) &&
  /zero exit code/i.test(processText) && /human visual attestation/i.test(processText));

console.log(`\ntest-html-design-layout-conformance-skill: ${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
