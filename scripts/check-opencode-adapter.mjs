#!/usr/bin/env node
// Acceptance checks for the OpenCode adapter (adapters/opencode/).
// Usage: node scripts/check-opencode-adapter.mjs <part>
//   part = skeleton | plugin | commands | agent | inject | multi | all
// Exit 0 = the named part's artifacts exist and are well-formed.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const A = join(REPO, 'adapters', 'opencode');

const fails = [];
const must = (cond, msg) => { if (!cond) fails.push(msg); };
const read = (rel) => (existsSync(join(REPO, rel)) ? readFileSync(join(REPO, rel), 'utf8') : null);
const has = (rel) => existsSync(join(A, rel));
const text = (rel) => (has(rel) ? readFileSync(join(A, rel), 'utf8') : '');

function checkSkeleton() {
  must(has('README.md'), 'missing adapters/opencode/README.md');
  must(has('opencode.json'), 'missing adapters/opencode/opencode.json');
  try {
    const cfg = JSON.parse(text('opencode.json'));
    must(Array.isArray(cfg.plugin) && cfg.plugin.some((p) => /opencode-playbook/.test(p)),
      'opencode.json does not register the opencode-playbook plugin');
  } catch (e) {
    must(false, `opencode.json is not valid JSON: ${e.message}`);
  }
}

function checkPlugin() {
  const rel = 'plugins/opencode-playbook.js';
  must(has(rel), `missing adapters/opencode/${rel}`);
  const src = text(rel);
  for (const hook of ['session.idle', 'shell.env', 'session.created']) {
    must(src.includes(hook), `plugin does not implement the "${hook}" hook`);
  }
  must(/loop['"\s,]+run|loop run/.test(src) && src.includes('--defer-blocked'),
    'plugin does not drive `pb loop run --auto --defer-blocked`');
}

function checkCommands() {
  for (const f of ['commands/pb-loop.md', 'commands/pb-status.md']) {
    must(has(f), `missing adapters/opencode/${f}`);
    must(text(f).startsWith('---'), `${f} is missing YAML frontmatter`);
  }
  must(text('commands/pb-loop.md').includes('--defer-blocked'),
    'pb-loop command does not invoke the defer-blocked auto run');
}

function checkAgent() {
  const rel = 'agents/playbook.md';
  must(has(rel), `missing adapters/opencode/${rel}`);
  const src = text(rel);
  must(src.startsWith('---'), 'agent file is missing YAML frontmatter');
  must(/mode:\s*subagent/.test(src), 'agent is not declared mode: subagent');
  must(/permission:/.test(src), 'agent declares no permission block');
}

function checkInject() {
  const master = read('playbook.yaml') || '';
  must(/opencode:/.test(master), 'playbook.yaml hardening.auto_inject has no `opencode:` profile');
  must(/session\.idle/.test(master) || /SessionStart|session\.created/.test(master),
    'opencode profile does not map any lifecycle event to an anchor/checkpoint command');
}

// The adapter's half of the engine's multi-agent contract (playbook >= 0.5):
// every write must carry who wrote it, and delegated proof must be forwarded.
function checkMultiAgent() {
  const src = text('plugins/opencode-playbook.js');
  must(/PB_RUNTIME/.test(src), 'plugin does not stamp PB_RUNTIME (runtime attribution)');
  must(/PB_AGENT_ID/.test(src), 'plugin does not stamp PB_AGENT_ID (agent attribution)');
  must(/PB_SESSION_ID/.test(src), 'plugin does not forward the session id as PB_SESSION_ID');
  must(/PB_CLAIM_TOKEN/.test(src) && /PB_AGENT_CHAIN/.test(src),
    'plugin does not forward delegated claim proof (PB_CLAIM_TOKEN / PB_AGENT_CHAIN)');
  must(/\.env\(/.test(src), 'plugin does not stamp identity on its own pb calls');
  const agent = text('agents/playbook.md');
  must(/claim token/i.test(agent), 'agent doc does not explain the claim token');
  must(/PB_AGENT_CHAIN/.test(agent), 'agent doc does not explain delegation chains');
  must(/release --task|pb release/i.test(agent), 'agent doc does not explain pb release');
  must(/worker/.test(agent), 'agent doc does not cover worker worktrees');
  const readme = text('README.md');
  must(/multi-agent/i.test(readme), 'README does not document multi-agent identity');
}

const part = process.argv[2] || 'all';
const PARTS = {
  skeleton: checkSkeleton, plugin: checkPlugin, commands: checkCommands,
  agent: checkAgent, inject: checkInject, multi: checkMultiAgent,
};
const parts = part === 'all'
  ? PARTS
  : { [part]: PARTS[part] };

for (const fn of Object.values(parts)) {
  if (typeof fn !== 'function') { console.error(`unknown part: ${part}`); process.exit(2); }
  fn();
}

if (fails.length) {
  for (const f of fails) console.error(`  - ${f}`);
  console.error(`check-opencode-adapter (${part}): ${fails.length} failure(s)`);
  process.exit(1);
}
console.log(`check-opencode-adapter (${part}): OK`);
