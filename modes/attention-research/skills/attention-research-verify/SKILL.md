---
name: attention-research-verify
description: Verify attention-research project scaffolds and generated traces.
---

# attention-research-verify

Use after creating or changing attention-research scaffold files.

Checks:

```bash
node scripts/check-attention-research-mode.mjs
node scripts/test-attention-research-mode.mjs
node scripts/pb.mjs validate
```

Verify the project files exist:

```bash
test -f /Users/river/.openclaw/workspace/projects/attention-research/project.yaml
test -f /Users/river/.openclaw/workspace/projects/attention-research/scaffolds/index.yaml
```
