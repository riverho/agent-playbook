#!/usr/bin/env node
// Validate/describe an attention-research project scaffold. The actual research
// synthesis remains LLM/tool-driven through Hermes skills; this script provides
// an executable scaffold gate and dry-run contract for Agent-Playbook.

import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import yaml from 'js-yaml';

const WORKSPACE_PROJECTS = '/Users/river/.openclaw/workspace/projects';
const ROOT = resolve(new URL('..', import.meta.url).pathname);
function parseArgs(argv) {
  const args = { project: 'attention-research', window: 'morning', date: 'today', config: null, dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--project') args.project = argv[++i];
    else if (a === '--window') args.window = argv[++i];
    else if (a === '--date') args.date = argv[++i];
    else if (a === '--config') args.config = argv[++i];
    else if (a === '--dry-run') args.dryRun = true;
  }
  return args;
}
function hktDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Hong_Kong',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function today() { return hktDate(); }
function readYaml(path) { return yaml.load(readFileSync(path, 'utf8')) || {}; }
function resolveConfig(args, projectDoc, projectRoot) {
  if (args.config) return resolve(ROOT, args.config);
  const modeCfg = projectDoc.modes?.['attention-research'];
  if (modeCfg && modeCfg[args.window]) return modeCfg[args.window];
  const idxPath = resolve(projectRoot, 'scaffolds/index.yaml');
  if (existsSync(idxPath)) {
    const idx = readYaml(idxPath);
    const ent = (idx.scaffolds || []).find((s) => s.mode === 'attention-research' && s.window === args.window);
    if (ent?.run_config) return ent.run_config;
  }
  return resolve(projectRoot, `scaffolds/modes/attention-research/${args.window}-run.yaml`);
}
function validateRun(run, configPath) {
  const req = ['id', 'window', 'topics_file', 'prompt_dir', 'output_root', 'meta_field', 'retry_field', 'deliver', 'check'];
  const missing = req.filter((k) => !run[k]);
  if (missing.length) throw new Error(`${configPath} run ${run.id || '(missing id)'} missing: ${missing.join(', ')}`);
  for (const k of ['topics_file', 'prompt_dir', 'output_root']) {
    if (!existsSync(run[k])) throw new Error(`${configPath} run ${run.id} path missing: ${k}=${run[k]}`);
  }
  if (run.window !== 'morning' && run.window !== 'afternoon') throw new Error(`${configPath} invalid window: ${run.window}`);
}
const args = parseArgs(process.argv);
const runDate = args.date === 'today' ? today() : args.date;
const projectRoot = resolve(WORKSPACE_PROJECTS, args.project);
const projectPath = resolve(projectRoot, 'project.yaml');
if (!existsSync(projectPath)) {
  console.error(`project.yaml not found: ${projectPath}`);
  process.exit(1);
}
const projectDoc = readYaml(projectPath);
const configPath = resolveConfig(args, projectDoc, projectRoot);
if (!existsSync(configPath)) {
  console.error(`run config not found: ${configPath}`);
  process.exit(1);
}
const config = readYaml(configPath);
const runs = config.runs || [];
if (!Array.isArray(runs) || runs.length === 0) {
  console.error(`runs array missing/empty: ${configPath}`);
  process.exit(1);
}
for (const run of runs) validateRun(run, configPath);
const reportDir = resolve(projectRoot, `scaffolds/generated/${runDate}-${args.window}`);
mkdirSync(reportDir, { recursive: true });
writeFileSync(resolve(reportDir, 'scaffold-input.yaml'), readFileSync(configPath, 'utf8'), 'utf8');
writeFileSync(resolve(reportDir, 'cron-context.yaml'), yaml.dump({ project: args.project, window: args.window, date: runDate, project_yaml: projectPath, config: configPath, dry_run: args.dryRun }), 'utf8');
writeFileSync(resolve(reportDir, 'scaffold-report.md'), `# attention-research scaffold report — ${runDate} ${args.window}\n\n- project: ${args.project}\n- project_yaml: ${projectPath}\n- config: ${configPath}\n- runs: ${runs.length}\n- dry_run: ${args.dryRun}\n\n`, 'utf8');
console.log(`attention-research scaffold ok`);
console.log(`project: ${args.project}`);
console.log(`window: ${args.window}`);
console.log(`date: ${runDate}`);
console.log(`config: ${configPath}`);
console.log(`runs: ${runs.length}`);
console.log(`generated: ${reportDir}`);
for (const run of runs) {
  console.log(`- ${run.id}: topics=${run.topics_file} prompts=${run.prompt_dir} output=${run.output_root} deliver=${run.deliver}`);
}
if (!args.dryRun) {
  console.log('non-dry execution is intentionally LLM/tool-driven by the loaded Hermes skill; this script is the project scaffold gate');
}
