---
name: html-design-layout-conformance
description: Convert approved canonical HTML and DESIGN.md rules into a versioned design-contract.yaml before broad codebase analysis, then use that contract to guide component mapping and enforce an HTML-to-app layout gate. Use when starting an HTML-led project, before analyzing implementation patterns, before production screens, and again when verifying responsive geometry, screenshots, interactions, or suspected drift.
---

# HTML Design Layout Conformance

Follow `modes/coding/processes/html-design-layout-conformance.yaml`.

Start the target repository's contract from
`modes/coding/skills/html-design-layout-conformance/assets/design-contract.template.yaml`.

## Position in the delivery process

Run this skill across three positions:

1. **Source intake:** after `DESIGN.md` + approved canonical HTML, before broad codebase analysis.
   Freeze reference identity, states, viewports, semantic regions, geometry, and tolerances in
   `design-contract.yaml` without letting existing code redefine the design.
2. **Contract gate:** analyze the codebase through that contract, complete component/harness mapping,
   and prove one golden screen before production screen scale-out.
3. **Conformance gate:** after every production screen slice and later layout-affecting change.

Stop when the HTML reference or required states are incomplete. Complete component mapping during
contract-guided analysis; do not infer product or layout rules from arbitrary nearby code.

## Required outputs

- `design-contract.yaml` with `source.kind: html`, reference entry point, revision/checksum,
  stable selectors, viewport/state matrix, component mapping, geometry relationships, and tolerances.
- Canonical HTML instrumented with unique, stable `data-design-id` anchors.
- One target-repository command that renders reference and app under the same deterministic browser
  environment and checks geometry, screenshots, responsive behavior, and relevant interactions.
- A negative proof showing the command fails after a deliberate layout shift.
- Repair-oriented failures and separate human visual attestation.

## Non-negotiable rules

- Treat HTML as a versioned design reference, not as permission to copy prototype markup into the app.
- Map every reference region to a production component or approved layout wrapper.
- Compare semantic `data-design-id` anchors; never bind conformance to generated classes or DOM order.
- Lock browser, viewport, device scale, fonts, assets, fixtures, locale, time, and animation.
- Do not weaken tolerances, delete assertions, regenerate baselines, or alter canonical HTML merely
  to make an incorrect implementation pass.
- Announce `HTML LAYOUT CONTRACT READY` only after the contract gate passes. Announce
  `HTML LAYOUT CONFORMANCE PASSED` only with command, zero exit code, diff evidence, and attestation.
