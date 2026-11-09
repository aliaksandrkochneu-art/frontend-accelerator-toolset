---
name: verify
description: "Run existing project checks and report read-only finalization readiness without replacing Browser Verify."
phase: quality
flow-next: [coder, debugger, test-generator, browser-verify, docs-generator, finishing-branch]
ruleset-aware: false
---

# Verify

## Purpose

Return an honest read-only project-check verdict and, for a reference-aware task, separately report finalization readiness from the latest compatible Browser Verify evidence.

## Context Resolution

Resolve the Repository Root and selected Application Root without assuming a fixed layout, framework, package manager, or root package manifest. Require explicit selection when multiple frontend apps remain.

## Procedure

1. Inspect the Application Root for its package manager, scripts, TypeScript configuration, test setup, build setup, and repository-specific verification instructions.
2. When the selected task has a Reference UI Contract, read its current manifest and only the latest validation iteration whose task ID, manifest version, and manifest digest match that manifest. Record the compatible iteration, evidence path, and Browser Verify verdict as read-only observations.
3. Select only existing applicable project checks such as formatting, lint, typecheck, unit/integration tests, end-to-end tests, or build.
4. Show potentially slow or state-writing commands and obtain approval when the environment requires it.
5. Run commands from the correct Application Root. Do not install dependencies, change lockfiles, edit configuration, or repair failures.
6. Capture exit codes and decisive output. Distinguish command failure, missing tooling, not-applicable checks, and environment blockage.
7. Inspect final diff/status only to report scope, never to modify it.
8. Write `tasks/TASK-NNN/verification.md` only when a task workspace exists and that write was requested; otherwise keep the verdict in the response. Never create or modify the manifest, baselines, staging files, or Reference Validation evidence.

## Reference Boundary

Verify does not capture screenshots, run screenshot diff, recalculate similarity or mismatch measurements, reproduce browser state, or issue a visual conformance verdict. It does not replace Browser Verify. A recorded Browser Verify verdict is reported exactly as evidence, never inferred from successful lint, typecheck, test, or build commands.

## Verdict

The Verify project-check verdict is based only on applicable existing project checks. Return project-check `PASS` only when all applicable selected checks pass; otherwise return project-check `FAIL`, `BLOCKED`, or `NOT-APPLICABLE`, listing each command and result.

For a reference-aware task, report **Finalization Readiness** separately:

- `READY` only when the latest compatible Browser Verify verdict is `PASS` and the Verify project-check verdict is `PASS`.
- `NOT READY` in every other combination. List each unmet condition explicitly, including missing or incompatible Browser Verify evidence, a non-`PASS` Browser Verify verdict, or a non-`PASS` project-check verdict.

Project-check success never becomes or implies reference `PASS`. A task without a Reference UI Contract has reference finalization readiness `NOT-APPLICABLE` while retaining its normal project-check verdict.

## Stop Contract

STOP after the verdict. Never repair a failure and never invoke the recommended command.
