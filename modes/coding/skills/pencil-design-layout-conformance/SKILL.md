---
name: pencil-design-layout-conformance
description: Convert approved DESIGN.md rules and Pencil frames into design-contract.yaml before broad codebase analysis, then use that contract to guide component mapping and enforce a Pencil-to-app layout gate. Use when starting a Pencil-led project, before analyzing implementation patterns, before production screens, and again when verifying responsive geometry, visual parity, interactions, or suspected layout drift.
---

# Pencil Design Layout Conformance

Follow `modes/coding/processes/pencil-design-layout-conformance.yaml`.

## Position in the delivery process

Run this skill across three positions:

1. **Source intake:** after `DESIGN.md` + approved Pencil mockups, before broad codebase analysis.
   Freeze Pencil provenance, states, viewports, semantic regions, geometry, and tolerances in
   `design-contract.yaml` without letting existing code redefine the design.
2. **Contract gate:** analyze the codebase through that contract, complete component/harness mapping,
   and prove one golden screen before production screen implementation.
3. **Conformance gate:** after each screen slice. Run geometry, visual, responsive, and interaction
   checks before recording the slice done.

If `DESIGN.md` or Pencil states are incomplete, report the missing source input and stop. Component
mapping is completed during contract-guided analysis; do not begin by mining arbitrary nearby code.

## Required outputs

- `design-contract.yaml` tied to stable Pencil file/frame/node IDs.
- A viewport and state matrix covering responsive, populated, empty, loading, and error layouts.
- A compilable golden screen built from the mapped production components.
- One target-repository command that verifies deterministic rendering, critical DOM geometry,
  screenshot differences, and relevant interactions.
- Repair-oriented failures that report the expected Pencil reference, actual geometry, and the
  component or layout primitive to fix.
- Separate human visual attestation for judgment that automation cannot establish.

## Non-negotiable rules

- Use Pencil MCP layout data and approved screenshots as source evidence; never estimate dimensions
  from memory or visual resemblance.
- Lock viewport, device scale, fonts, fixtures, assets, time, and animation before visual comparison.
- Combine geometry assertions with visual diffs. Pixels detect drift; geometry identifies the repair.
- Test declared breakpoints and content states, not only the desktop happy path.
- Do not weaken thresholds, delete baselines/tests, add suppressions, or regenerate expected images
  merely to make a changed implementation pass.
- Announce `LAYOUT CONTRACT READY` only after the contract gate passes. Announce
  `LAYOUT CONFORMANCE PASSED` only with command, exit-code, and human-attestation evidence.
