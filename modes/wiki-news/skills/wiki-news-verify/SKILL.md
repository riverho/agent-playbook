---
name: wiki-news-verify
description: Verify the LLM Wiki RSS/news architecture, frontmatter, counts, and navigation after ingest.
---

# wiki-news-verify

Use this skill after any wiki-news ingest, source registry change, or script change.

Canonical process:
- `modes/wiki-news/processes/wiki-news-verify.yaml`

## Quality gates

1. RSS architecture check exits 0.
2. Markdown frontmatter parses across `/Users/river/wiki`.
3. Article/raw/entity/concept/meta counts are recorded.
4. Root `index.md` and `concepts/rss-monitoring.md` point to the wide indexes.
5. The run report includes counts and warnings.

## Standard commands

```bash
python ~/.hermes/skills/research/llm-wiki/scripts/check-rss-wiki-architecture.py /Users/river/wiki
node scripts/wiki-news-daily.mjs --wiki /Users/river/wiki --db /Users/river/.blogwatcher-cli/blogwatcher-cli.db --since today --limit 120 --dry-run
```
