#!/usr/bin/env node
// Verify real attention-research daily outputs exist. This is intentionally
// stricter than the scaffold dry-run gate: same-day topic files + META updates
// + source links are required before a cron digest can claim success.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'js-yaml';

const WORKSPACE_PROJECTS = '/Users/river/.openclaw/workspace/projects';

function parseArgs(argv) {
  const args = { project: 'attention-research', window: 'morning', date: 'today', config: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--project') args.project = argv[++i];
    else if (a === '--window') args.window = argv[++i];
    else if (a === '--date') args.date = argv[++i];
    else if (a === '--config') args.config = argv[++i];
  }
  return args;
}
function hktDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function readYaml(path) { return yaml.load(readFileSync(path, 'utf8')) || {}; }
function readJson(path) { return JSON.parse(readFileSync(path, 'utf8')); }
function resolveConfig(args, projectRoot) {
  if (args.config) return args.config;
  const projectPath = resolve(projectRoot, 'project.yaml');
  const projectDoc = readYaml(projectPath);
  const modeCfg = projectDoc.modes?.['attention-research'];
  if (modeCfg && modeCfg[args.window]) return modeCfg[args.window];
  return resolve(projectRoot, `scaffolds/modes/attention-research/${args.window}-run.yaml`);
}
function hasSourceLink(markdown) {
  return /https?:\/\/[^\s)]+/.test(markdown) && /^## Sources\b/m.test(markdown);
}

const args = parseArgs(process.argv);
const date = args.date === 'today' ? hktDate() : args.date;
const projectRoot = resolve(WORKSPACE_PROJECTS, args.project);
const configPath = resolveConfig(args, projectRoot);

if (!existsSync(configPath)) {
  console.error(`run config not found: ${configPath}`);
  process.exit(1);
}
const config = readYaml(configPath);
const run = (config.runs || []).find((r) => r.window === args.window) || (config.runs || [])[0];
if (!run) {
  console.error(`no run found in ${configPath}`);
  process.exit(1);
}
const topicsDoc = readYaml(run.topics_file);
const topics = Object.entries(topicsDoc.topics || {}).filter(([, t]) => t && t.enabled !== false);
const metaField = run.meta_field || (args.window === 'morning' ? 'lastMorningUpdate' : 'lastAfternoonUpdate');
const failures = [];

for (const [topic] of topics) {
  const topicRoot = resolve(run.output_root, topic);
  const newsPath = resolve(topicRoot, 'news', `${topic}-${date}.md`);
  const metaPath = resolve(topicRoot, 'META.json');
  if (!existsSync(newsPath)) {
    failures.push(`${topic}: missing news file ${newsPath}`);
  } else {
    const md = readFileSync(newsPath, 'utf8');
    if (!hasSourceLink(md)) failures.push(`${topic}: news file has no Sources section with URL`);
  }
  if (!existsSync(metaPath)) {
    failures.push(`${topic}: missing META.json ${metaPath}`);
  } else {
    const meta = readJson(metaPath);
    if (meta[metaField] !== date) failures.push(`${topic}: META ${metaField}=${meta[metaField] ?? '(missing)'}, expected ${date}`);
  }
}

if (failures.length) {
  console.error(`attention-research ${args.window} output verification failed for ${date}:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`attention-research ${args.window} outputs verified for ${date}: ${topics.length} topic(s)`);
console.log(`config: ${configPath}`);
console.log(`output_root: ${run.output_root}`);
