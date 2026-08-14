# Reference Conformance

Activate this rule only when the request explicitly identifies a Reference UI manifest or explicitly asks for reference verification. Otherwise retain ordinary Browser Verify behavior and do not infer a reference surface.

## Deterministic Capture

- Validate the selected manifest with the project-owned Reference UI helper after project Doctor succeeds. The helper validates and finalizes artifacts; browser actions remain owned exclusively by the pinned browser adapter.
- Use the exact supplied or emitted application URL, a unique owned session, the declared route, state, viewport, device scale, theme, locale, setup, interactions, readiness conditions, and reduced motion. Wait for relevant fonts and images before capture.
- Write current screenshots, diffs, snapshots, console/network evidence, and the evidence draft only under `tasks/TASK-NNN/reference-ui/.staging/<owned-session>/`. The staging directory name must equal the explicit browser session.
- Use a readable local baseline under the selected task's `reference-ui/references/`. A remote URL is source metadata, not a baseline.
- When the pinned adapter reports `match=true` and `differentPixels=0` with no dimension mismatch but omits the requested output PNG, persist a deterministic machine-readable zero-diff JSON report in the same case or region scope. Declare its readable path as the `diff` or `region-diff` artifact and include the requested PNG path plus the full measurement. Never substitute a copy of the baseline or current screenshot for a pixel diff.
- If the requested output is missing for `differentPixels > 0` or a dimension mismatch, Stop before finalization and return `BLOCKED` with the iteration, case, region, requested output path, and full measurement. Report the capture failure directly rather than allowing a generic finalizer failure.

## Acceptance Gates

- Unless the manifest or Project Ruleset supplies a stricter value, use color threshold `0.1` and maximum whole-surface mismatch ratio `0.01`. Report the applied threshold and measured mismatch; never silently relax a failure.
- Evaluate visual, semantic, behavior, accessibility, console, and network axes separately. Required content and anchors, required interactions, accessible required controls, scenario-affecting page errors or failed requests, and high-priority visual regions are hard gates.
- Compare every named region at its declared tolerance. A high-priority region outside tolerance fails even when the whole-surface comparison passes.
- Apply each dynamic-region strategy exactly as declared: semantic assertions remain semantic, scoped-pixel regions remain compared, and pixel exclusions remove only the declared pixels while remaining visible in the report.

## Findings And Evidence

- An actionable finding identifies a stable case ID, optional named region ID, failed axis, severity, expected observation, actual observation, at least one supporting artifact or measurement, and the smallest user-visible correction target. A finding exists only for a `FAIL` axis.
- Record actual setup and interaction execution, axis-specific blocked reasons, whole-surface and region measurements, exact artifact paths, passed cases, and new/resolved/unchanged/regressed classifications.
- Keep the manifest, baselines, and previous iterations immutable. Write the draft in owned staging and use the Reference UI finalizer to atomically create one append-only `validation/iteration-NNN/`; never write or edit an iteration directly.

## Verdict And Manual Handoff

- Return `BLOCKED` when required assets or state, the runtime capability, exact URL, or required approval is unavailable.
- Return `FAIL` for an actionable mismatch or proven application/runtime defect.
- Return `PASS` only when every required case passes every applicable hard gate.
- Return `NOT-APPLICABLE` only when the explicit request has no reference-verifiable surface.
- Keep contextual recommendations mutually exclusive: `PASS` recommends Verify as the only next manual step; `FAIL` from an implementation mismatch recommends Coder; `FAIL` from a proven application/runtime defect recommends Debugger; `BLOCKED` and `NOT-APPLICABLE` make no `flow-next` recommendation and are never presented as `PASS` or ready for Verify.
- Never launch the recommended role. After the verdict and applicable single recommendation, STOP after closing only owned resources.
