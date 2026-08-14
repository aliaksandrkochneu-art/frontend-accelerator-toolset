---
name: writing-plans
description: "Produce a file-level frontend implementation plan with contracts, tests, and verification."
phase: planning
flow-next: [git-worktrees, coder]
ruleset-aware: false
---

# Writing Plans

## Purpose

Produce an ordered, file-level handoff that another frontend developer can implement without rediscovering the task.

## Context Resolution

1. Resolve the Repository Root from git when available; otherwise use the nearest ancestor containing the copied `rulesets/` and `.claude/` directories.
2. Honor an explicit Application Root only when it resolves inside the Repository Root.
3. For code-related work, use the Repository Root when it is the only frontend application candidate.
4. In a monorepo, inspect package manifests, source directories, and build configuration. Use the only clear frontend candidate.
5. If multiple candidates remain, list them and STOP for explicit selection. Never assume `frontend/`, `web/`, `apps/*`, a root package manifest, a framework, or a dev-server port.

## Procedure

1. Read confirmed requirements, applicable task artifacts, living specifications, relevant source files, tests, scripts, and project conventions. When present, read `tasks/TASK-NNN/reference-ui/manifest.json` and the latest compatible validation evidence as contract data.
2. Check that architecture, API, UI direction, and dependency choices required by the work are resolved. Do not make missing specialist decisions silently.
3. Describe current behavior and intended behavior.
4. When a Reference UI Manifest exists, carry its manifest path and version, every case ID, target, state, viewport, regions, interactions, acceptance criteria, allowed deviations, and previously passed cases into the handoff. Treat those fields as authoritative; do not re-analyze images or create a second visual interpretation.
5. List exact files to create or modify, why each changes, and important contracts between steps.
6. Order implementation steps by dependency and identify which steps may proceed independently. Include explicit preservation work for previously passed reference cases.
7. Include essential behavior tests beside the behavior they protect and additional risk-based test opportunities separately.
8. List existing verification commands discovered from the selected Application Root. For reference-aware work, add an explicit manual Browser Verify handoff after implementation with the applicable case IDs and criteria. Do not invoke Browser Verify.
9. Record rollback or feature-flag considerations only when the task risk justifies them.
10. Write `tasks/TASK-NNN/implementation-plan.md` when a task workspace exists or durable handoff is requested. Leave production code and reference artifacts unchanged.

## Plan Quality

Do not paste complete production implementations, prescribe artificial micro-commits, duplicate image analysis, or turn unresolved assumptions into instructions.

## Stop Contract

Recommend at most one allowed next manual command, then STOP after the plan is actionable, or earlier with the owning specialist when a required decision is missing. Never invoke the recommended command.
