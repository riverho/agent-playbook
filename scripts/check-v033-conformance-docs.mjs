#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';

const expectedVersion = '0.3.5';
const master = yaml.load(readFileSync('playbook.yaml', 'utf8'));
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const readme = readFileSync('README.md', 'utf8');
const install = readFileSync('INSTALL.md', 'utf8');
const pencil = yaml.load(readFileSync('modes/coding/processes/pencil-design-layout-conformance.yaml', 'utf8'));
const html = yaml.load(readFileSync('modes/coding/processes/html-design-layout-conformance.yaml', 'utf8'));

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

check('all release version authorities are 0.3.5',
  master.version === expectedVersion && pkg.version === expectedVersion &&
  lock.version === expectedVersion && lock.packages?.['']?.version === expectedVersion);
check('published package includes modes and installation documentation',
  pkg.files?.includes('modes/') && pkg.files?.includes('INSTALL.md'));
const readmeVersionRe = new RegExp('v' + expectedVersion.replace(/\./g, '\\.'), 'i');
check(`README identifies v${expectedVersion} and both source adapters`,
  readmeVersionRe.test(readme) && /\$pencil-design-layout-conformance/.test(readme) &&
  /\$html-design-layout-conformance/.test(readme));
check('README requires source contract before broad codebase analysis',
  /before broad[\s\S]{0,80}codebase analysis/i.test(readme) &&
  /create `design-contract\.yaml`[\s\S]{0,240}design[\s\S]{0,20}source only/i.test(readme));
check('README constrains analysis and gates implementation',
  /Analyze the codebase \*\*through that contract\*\*/.test(readme) &&
  /canonical component APIs/i.test(readme) && /deprecated paths/i.test(readme) &&
  /Only after the contract gate passes/i.test(readme));
check('INSTALL places conformance before task seeding and operation',
  install.indexOf('establish conformance before broad codebase analysis') < install.indexOf('Seed real tasks') &&
  install.indexOf('Seed real tasks') < install.indexOf('Operate'));
check('INSTALL documents contract-guided analysis and readiness announcements',
  /<repo>\/design-contract\.yaml/.test(install) && /contract-guided/i.test(install) &&
  /LAYOUT CONTRACT READY/.test(install) && /HTML LAYOUT CONTRACT READY/.test(install));

for (const [name, process] of [['Pencil', pencil], ['HTML', html]]) {
  const steps = (process.canonical_steps || []).map((step) => step.name);
  const writeIndex = steps.findIndex((step) => /design-contract\.yaml/i.test(step));
  const analyzeIndex = steps.indexOf('Analyze the codebase through the contract');
  const goldenIndex = steps.findIndex((step) => /golden screen|contract gate/i.test(step));
  check(`${name} process orders source contract before analysis before golden gate`,
    writeIndex >= 0 && analyzeIndex > writeIndex && goldenIndex > analyzeIndex);
  check(`${name} process explicitly blocks broad analysis before the source contract`,
    /Broad implementation-oriented codebase analysis/i.test(JSON.stringify(process.position?.before)));
}

check('both adapters standardize the target artifact as design-contract.yaml',
  pencil.outputs?.some((output) => output.path === 'design-contract.yaml') &&
  html.outputs?.some((output) => output.path === 'design-contract.yaml'));

console.log(`\ncheck-v033-conformance-docs: ${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
