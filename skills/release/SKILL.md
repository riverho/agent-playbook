---
name: release
description: Cut a versioned release by bumping the version, tagging, pushing, and publishing the GitHub release.
---

# Skill: release
> Routes to → `processes/release.yaml`

Use this skill when you need to cut a versioned release: bump version, tag, push, and publish a GitHub release.

## When to use
- Cutting a new patch, minor, or major release
- Publishing a GitHub release from an existing tag

## Semantic versioning rules

| Change type        | Bump   | Example                  |
|--------------------|--------|--------------------------|
| Bug fix            | patch  | v0.1.0 → v0.1.1          |
| New feature        | minor  | v0.1.0 → v0.2.0          |
| Breaking change    | major  | v0.x.0 → v1.0.0          |

## Quick reference
```bash
# Check current version
node -e "console.log(require('./package.json').version)"

# Tag and push (after version bump + commit)
git tag -a vX.Y.Z -m "vX.Y.Z — short description"
git push origin main && git push origin vX.Y.Z

# Publish GitHub release
gh release create vX.Y.Z --title "vX.Y.Z" --notes "..."
```

## Process
Follow `processes/release.yaml` step by step.
