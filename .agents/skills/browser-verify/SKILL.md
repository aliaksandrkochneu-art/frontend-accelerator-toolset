---
name: browser-verify
description: "Verify rendered frontend behavior and explicitly requested Reference UI conformance without editing production code."
phase: quality
flow-next: [coder, debugger, verify]
ruleset-aware: true
---

# Browser Verify

## Purpose

Collect real-browser evidence for frontend behavior and, when explicitly requested, finalize task-scoped Reference UI evidence without changing production code.

## Context Resolution

Resolve the Repository Root and selected Application Root without assuming a fixed layout or framework. If multiple frontend apps remain, require selection.

## Ruleset Loading

Load available `browser-verify` sections from Common, Framework, and Project Rulesets. Missing sections are valid. Follow a present `INDEX.md`; otherwise read direct Markdown files lexically. Broken references are configuration errors.

## Runtime Toolchain

Run `node "<Repository Root>/toolchain/bin/doctor.mjs" --json` before browser work. This project Doctor is the only browser-readiness gate. Do not run the browser adapter's `doctor` command as a readiness or launch check; it performs an independent diagnostic probe and does not create the verification session. Return `BLOCKED` when the project Doctor reports the required browser capability unavailable, the project hook registration conflicting, or the accelerator Node.js runtime unsupported. Use only `node "<Repository Root>/toolchain/bin/agent-browser.mjs"`; never fall back to a global `agent-browser`, Playwright CLI, or an implicit browser tool.

Browser launch and CDP control may require host/GUI execution approval in a sandboxed runtime. If the first `open` fails inside a sandbox with a browser-launch, CDP connection, or response-channel-closed error, request the required host/GUI execution approval and retry `open` once. Return `BLOCKED` only if that approved retry also fails or the approval is denied, and report both attempts. Do not escalate application failures or use escalation to change the verification target.

## Server Discovery And Ownership

1. Prefer a URL supplied by the user or emitted by an already-running project server.
2. Otherwise inspect project scripts and process output to identify the real start command and URL. Never assume `localhost:3000` or any fixed port.
3. Ask for explicit approval before starting a development server.
4. Record the exact process started and its emitted URL.
5. Stop only a server process started by this role. Never stop an existing user process.

## Mode Selection

Use **Reference Mode** only when the request explicitly identifies a Reference UI manifest or explicitly asks for reference verification. Otherwise use **Ordinary Mode** exactly as before; do not discover, create, or infer a reference surface from nearby task files. An explicit reference request with no reference-verifiable surface returns `NOT-APPLICABLE`; a selected surface whose required manifest, baseline asset, route, state, runtime, or approval is unavailable returns `BLOCKED`.

## Ordinary Mode

1. Choose a unique, non-secret session name for this verification and pass `--session <name>` on every adapter call.
2. The first browser-adapter command for the owned session must be `open <actual URL>`. Do not substitute the adapter's `doctor`, `get url`, or `snapshot` commands for this launch step. After `open` succeeds, set the evidence-relevant viewport with `set viewport` and capture an interactive accessibility snapshot with `snapshot -i`.
3. Exercise requested primary and recovery paths through element refs, re-snapshotting after navigation or material DOM changes.
4. Check relevant desktop and mobile viewports without inventing a fixed universal viewport set. Inspect loading, empty, error, permission, success, focus, keyboard, overflow, and long-content behavior.
5. Run `console`, `errors`, and `network requests`; record relevant failures, response status, and unexpected navigation.
6. Capture a screenshot when it materially supports the verdict.
7. Close the owned adapter session even when verification fails. Do not close another session or an existing user browser.
8. Do not edit source, tests, configuration, or data to make the check pass.

## Reference Mode

1. Run the project Doctor and return `BLOCKED` on its existing blocking states before validating or opening a reference surface.
2. Resolve the explicitly selected `tasks/TASK-NNN/reference-ui/manifest.json` and run `node "<Repository Root>/toolchain/bin/reference-ui.mjs" validate-manifest <manifest> --json`. Treat this as contract validation only, never as browser readiness. Return `BLOCKED` for a missing, unreadable, contradictory, or invalid selected manifest or required baseline.
3. Require the exact application URL supplied by the user or emitted by an owned or already-running server. Preserve the Server Discovery And Ownership approval rules; a missing URL or denied required server/browser approval is `BLOCKED`.
4. Choose a unique owned session and create only `tasks/TASK-NNN/reference-ui/.staging/<owned-session>/`. Pass that exact session on every adapter call and keep all draft evidence and screenshot/diff output paths inside its staging directory. The first adapter command must remain `open <exact application URL>`.
5. For every manifest case, navigate to its exact route and reproduce its declared state. Apply the declared viewport, device scale, theme, and locale when present; reduce motion; execute and record every declared setup and interaction through approved fixtures or stable semantic locators; wait for declared readiness plus relevant fonts and images; then capture `snapshot -i`.
6. Check required structure, semantics, interactions, focus, keyboard behavior, and accessibility independently from pixel comparison. Record each axis separately so a visual score cannot cancel another failed hard gate.
7. Capture the whole surface and every named region into the owned staging directory. Run the pinned adapter's `diff screenshot` with the manifest/Common tolerance, exact local baseline, selector when scoped, staging output path, and reported threshold. Apply a dynamic exclusion only to its declared pixel region; keep its required semantic or scoped-pixel assertion active. When the pinned adapter reports `match=true` and `differentPixels=0` with no dimension mismatch but omits the requested output PNG, persist a deterministic machine-readable zero-diff JSON report in the same case or region scope and declare that readable JSON path as the required `diff` or `region-diff` artifact. Record the requested PNG path and full measurement in the report. Never copy the baseline or current screenshot and label that copy as a pixel diff. If the requested output is missing when `differentPixels > 0` or a dimension mismatch is reported, Stop before finalization and return a contextual `BLOCKED` error containing iteration, case, region, output path, and full measurement; this must not surface as a generic finalizer failure.
8. Collect and persist applicable console, page-error, network, responsive, focus, keyboard, and long-content evidence. Distinguish scenario-affecting failures from unrelated observations and record exact URLs, requests, statuses, and artifacts.
9. Build a schema-valid evidence draft with recorded setup/interactions, separate axes, per-axis blocked reasons, measurements, artifacts, passed cases, and actionable findings. Write it only to `.staging/<owned-session>/evidence.json`, then atomically commit a new append-only iteration with `node "<Repository Root>/toolchain/bin/reference-ui.mjs" finalize-validation --manifest <manifest> --draft <staging-evidence> --json`. Never write `validation/iteration-NNN/**` directly. After a successful atomic commit, report any staging cleanup warning without changing the committed verdict.
10. Close only the owned adapter session and any server started by this role. Return the verdict with the exact committed evidence path, at most one contextual next command, and STOP. Never invoke the recommendation.

## Reference Evidence Authority

Direct writes are limited to reference evidence and drafts under the selected task's `.staging/<owned-session>/`. The finalizer is the only writer of a new `validation/iteration-NNN/`; the manifest, `references/` baselines, every previous validation iteration, production code, tests, configuration, fixtures, and application data are read-only. Never publish or copy reference artifacts outside the selected Task Workspace.

## Verdict

Return `PASS`, `FAIL`, `BLOCKED`, or `NOT-APPLICABLE` with exact URL, viewport, interactions, console/network evidence, committed reference evidence path when applicable, and any owned server process stopped.

In Reference Mode:

- `BLOCKED` means required assets, state, runtime capability, URL, or approval did not permit a verdict.
- `FAIL` means an actionable visual, semantic, behavior, accessibility, console, or network mismatch failed an applicable hard gate.
- `PASS` means every required case passed every applicable hard gate.
- `NOT-APPLICABLE` means the explicit request has no reference-verifiable surface.

Use exactly one contextual recommendation outcome in Reference Mode:

- On `PASS`, recommend Verify as the only next manual step.
- On `FAIL` caused by an implementation mismatch, recommend Coder.
- On `FAIL` caused by a proven application/runtime defect, recommend Debugger.
- On `BLOCKED` or `NOT-APPLICABLE`, make no `flow-next` recommendation. Neither verdict is `PASS` or ready for Verify.

Never launch the recommended role. After reporting the verdict and applicable single recommendation, STOP. A missing browser capability or denied approval remains `BLOCKED`, not a proven application defect.

## Stop Contract

STOP after evidence and verdict are reported and every resource owned by this role is handled. Never invoke the recommended command.
