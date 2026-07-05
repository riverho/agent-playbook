#!/usr/bin/env node
// Daily blogwatcher -> LLM Wiki refresh wrapper. This is the single executable
// acceptance check used by the wiki-news mode scaffold.

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(new URL('..', import.meta.url).pathname);

function parseArgs(argv) {
  const args = { wiki: '/Users/river/wiki', db: '/Users/river/.blogwatcher-cli/blogwatcher-cli.db', since: 'today', limit: '120', dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--wiki') args.wiki = argv[++i];
    else if (a === '--db') args.db = argv[++i];
    else if (a === '--since') args.since = argv[++i];
    else if (a === '--limit') args.limit = argv[++i];
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
function todayLocal() { return hktDate(); }
function run(cmd, argv, opts = {}) {
  const env = { ...process.env, ...(opts.env || {}) };
  if (opts.dryRun) return { code: 0, out: `[dry-run] ${cmd} ${argv.join(' ')}` };
  try {
    const out = execFileSync(cmd, argv, { cwd: opts.cwd || ROOT, env, encoding: 'utf8', stdio: 'pipe' });
    return { code: 0, out: out || '' };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout || ''}${e.stderr || ''}` };
  }
}
function countFiles(dir, suffix = '.md') {
  if (!existsSync(dir)) return 0;
  let n = 0;
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) n += countFiles(p, suffix);
    else if (ent.name.endsWith(suffix)) n++;
  }
  return n;
}
function frontmatterCheck(wiki) {
  const py = `from pathlib import Path
import re, yaml, sys
bad=[]
for p in Path(${JSON.stringify(wiki)}).rglob('*.md'):
    txt=p.read_text(encoding='utf-8', errors='replace')
    if txt.startswith('---'):
        m=re.match(r'^---\\n(.*?)\\n---\\n', txt, re.S)
        if not m:
            bad.append((str(p),'missing close'))
            continue
        try:
            yaml.safe_load(m.group(1))
        except Exception as e:
            bad.append((str(p), str(e).split('\\n')[0]))
print('frontmatter_bad_count', len(bad))
for x in bad[:30]: print(x)
sys.exit(1 if bad else 0)
`;
  return run(python, ['-c', py], { cwd: ROOT });
}
function navigationCheck(wiki) {
  const required = ['[[source-index]]', '[[article-index-', '[[entity-index]]', '[[topic-index]]', '[[daily-digest-'];
  const idx = resolve(wiki, 'index.md');
  const rss = resolve(wiki, 'concepts/rss-monitoring.md');
  const missing = [];
  const idxText = existsSync(idx) ? readFileSync(idx, 'utf8') : '';
  const rssText = existsSync(rss) ? readFileSync(rss, 'utf8') : '';
  for (const needle of required) if (!idxText.includes(needle)) missing.push(`index.md missing ${needle}`);
  for (const needle of ['[[article-index-', '[[entity-index]]', '[[topic-index]]']) if (!rssText.includes(needle)) missing.push(`rss-monitoring.md missing ${needle}`);
  return { code: missing.length ? 1 : 0, out: missing.length ? missing.join('\n') : 'navigation_check ok' };
}
function writeReport(date, args, sections) {
  const dir = resolve(ROOT, 'artifacts/reports/wiki-news');
  mkdirSync(dir, { recursive: true });
  const path = resolve(dir, `wiki-news-${date}.md`);
  const lines = [`# wiki-news daily report — ${date}`, '', `- wiki: ${args.wiki}`, `- blogwatcher_db: ${args.db}`, `- since: ${args.since}`, `- limit: ${args.limit}`, `- dry_run: ${args.dryRun}`, ''];
  for (const s of sections) lines.push(`## ${s.name}`, '', '```text', String(s.out || '').trim() || '(no output)', '```', '');
  writeFileSync(path, lines.join('\n'), 'utf8');
  return path;
}

const args = parseArgs(process.argv);
const date = args.since === 'today' ? todayLocal() : args.since;
const wiki = resolve(args.wiki);
const python = '/Users/river/.hermes/venvs/wiki-rss/bin/python';
const archCheck = resolve(process.env.HOME || '/Users/river', '.hermes/skills/research/llm-wiki/scripts/check-rss-wiki-architecture.py');
const required = [wiki, resolve(wiki, 'scripts/rss_deep_ingest.py'), resolve(wiki, 'scripts/blogwatcher_delta_ingest.py'), resolve(wiki, 'scripts/rebuild_news_indexes.py'), archCheck];
const sections = [];
let fatal = false;
for (const p of required) {
  if (!existsSync(p)) { sections.push({ name: `missing ${p}`, code: 1, out: `required path missing: ${p}` }); fatal = true; }
}
if (!fatal) {
  sections.push({ name: 'blogwatcher scan', ...run('blogwatcher-cli', ['scan'], { env: { BLOGWATCHER_DB: args.db }, dryRun: args.dryRun }) });
  sections.push({ name: 'rss deep ingest', ...run(python, [resolve(wiki, 'scripts/rss_deep_ingest.py')], { dryRun: args.dryRun }) });
  sections.push({ name: 'blogwatcher db delta ingest', ...run(python, [resolve(wiki, 'scripts/blogwatcher_delta_ingest.py'), '--since', date, '--limit', String(args.limit)], { dryRun: args.dryRun }) });
  sections.push({ name: 'rebuild news indexes', ...run(python, [resolve(wiki, 'scripts/rebuild_news_indexes.py')], { dryRun: args.dryRun }) });
  sections.push({ name: 'rss architecture check', ...run(python, [archCheck, wiki], { dryRun: args.dryRun }) });
  sections.push({ name: 'frontmatter check', ...(args.dryRun ? { code: 0, out: '[dry-run] frontmatter check' } : frontmatterCheck(wiki)) });
  sections.push({ name: 'navigation check', ...(args.dryRun ? { code: 0, out: '[dry-run] navigation check' } : navigationCheck(wiki)) });
  sections.push({ name: 'counts', code: 0, out: `article_pages: ${countFiles(resolve(wiki, 'articles'))}\nraw_pages: ${countFiles(resolve(wiki, 'raw/articles'))}\nentity_pages: ${countFiles(resolve(wiki, 'entities'))}\nconcept_pages: ${countFiles(resolve(wiki, 'concepts'))}\nmeta_pages: ${countFiles(resolve(wiki, '_meta'))}` });
}
const report = writeReport(date, args, sections);
for (const s of sections) console.log(`\n## ${s.name}\n${String(s.out || '').trim()}`);
console.log(`\nreport: ${report}`);
const hardFail = sections.some((s) => s.code !== 0 && !['blogwatcher scan', 'rss deep ingest', 'blogwatcher db delta ingest'].includes(s.name));
if (fatal || hardFail) process.exit(1);
