---
name: code-conformance
description: Prove code changes against the repository's own executable conformance harness and guard against check-gaming.
---

# Code conformance

Use this skill when implementing, refactoring, or reviewing code whose correctness must be
demonstrated by the target repository's own executable harness.

Canonical process:
- `modes/coding/processes/code-conformance.yaml`

## Operating rule

Repository code and executable checks are the conformance authority. Read the repository's
instructions and nearest compilable examples, then make violations fail before review. Do not
replace a missing harness with more prose.

## Required verification layers

1. Contract/source-of-truth and compilable examples.
2. Compile, type, lint, schema, or other static checks available in the repository.
3. Behavior and interaction tests for behavior changed by the task.
4. Focused task checks followed by the relevant regression suite.
5. Anti-gaming diff review: no suppression casts/directives, deleted assertions, weakened tests,
   or bypassed checks used only to obtain green.

When the repository cannot express a required check, add the smallest executable check that can.
Failures should explain the repair and point to the relevant contract or example. If an exception
is genuinely required, surface it explicitly; do not silently suppress or skip the failing check.

Green checks establish conformance, not product quality. Keep visual or human judgment gates when
the task requires them and record their evidence separately.
