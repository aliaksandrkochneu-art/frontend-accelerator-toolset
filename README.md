# Frontend Accelerator Toolset

A frontend-native agent workflow and pinned Runtime Toolchain for existing TypeScript repositories. It adds a manual delivery catalog, isolated agents, reusable skills, replaceable best-practice rules, real-browser automation, and a portable changed-file lint guardrail without changing the application's framework, source layout, dependencies, scripts, or root instructions.

This is not a React starter, project generator, orchestrator, governance pipeline, backend workflow, or global CLI bundle. React is only the default Framework Ruleset and can be replaced.

## Training

All onboarding and assessment materials live under [`training/`](training/README.md). New participants should start from that single entry point.

## Prerequisites

- Node.js 24 or newer for the accelerator CLI and managed tools. The target application may declare an older Node.js range.
- Git, with commands run from the target repository's Git root.
- Network access only for `setup`, when pinned artifacts are not already cached.

## Install The Project Payload

The recommended installer previews every copy and hook-configuration operation before writing:

```powershell
npx github:<org>/<repo> install
```

For a local checkout, including a path with spaces:

```powershell
npx --package "C:\path with spaces\frontend-accelerator-toolset" frontend-accelerator install
```

The installer copies these project-owned directories:

```text
.claude/
.agents/
rulesets/
toolchain/
```

Ordinary payload files remain copy-only. Any exact target-path collision is reported before confirmation and causes zero writes.

The only merge exception is `.claude/settings.json` and `.codex/hooks.json`. The installer preserves unrelated settings and hooks, appends the accelerator's recognized registrations once, and treats malformed JSON or a changed registration carrying the accelerator's identifier as a conflict. The exact legacy Codex Windows launcher that nested `powershell.exe -Command` is recognized for a subsequent update; no other semantic drift is accepted. A successful installation writes `.frontend-accelerator/installation.json` with the SHA-256 digest of every installed payload file. The installer never edits application dependencies, application lockfiles, source code, root `AGENTS.md`, root `CLAUDE.md`, global PATH, or runtime trust.

Use `--yes` only after reviewing the same operation in an interactive run when non-interactive installation is required.

## Update An Existing Installation

Use the explicit update command instead of running `install` over existing payload directories:

```powershell
npx github:<org>/<repo> update
```

For a local accelerator checkout:

```powershell
npx --package "C:\path with spaces\frontend-accelerator-toolset" frontend-accelerator update
```

Update verifies every existing accelerator-owned file against the installation receipt before replacing or removing it. A file changed after installation is reported as a conflict and causes zero writes. New payload files are copied, unchanged files are reused, unrelated project files and runtime configuration are preserved, and recognized hook registrations are merged separately.

Installations created before receipts existed are bootstrapped only when their changed payload files match an explicitly recognized legacy accelerator version. This supports migration from the release with the nested Codex Windows PowerShell launcher without treating arbitrary target content as accelerator-owned.

If an update changes hook commands, review and trust them again through `/hooks`, then start a new session so `SessionStart` can write a current activation proof. Use `update --yes` only after reviewing the same update plan interactively.

### Manual installation

The four payload directories can still be copied manually. A manual installation must also merge the logical registrations from `toolchain/registrations/claude-hooks.json` and `toolchain/registrations/codex-hooks.json` into the matching project settings. Do not replace an existing settings document wholesale. `frontend-accelerator doctor` reports `NOT_CONFIGURED` until the current registrations are present.

## Provision The Runtime Toolchain

Installation writes project files but performs no downloads. Provisioning is a separate, explicitly confirmed command:

```powershell
npx github:<org>/<repo> setup
```

For a local accelerator checkout:

```powershell
npx --package "C:\path with spaces\frontend-accelerator-toolset" frontend-accelerator setup
```

Setup installs exact manifest versions into an accelerator-owned user cache:

| Capability | Requirement | Pin |
| --- | --- | --- |
| Real browser | Required | `agent-browser@0.32.3` |
| Current library documentation | Recommended | `ctx7@0.5.5` |

The setup transaction verifies npm lock integrity, records the package entrypoint and managed Chrome executable in a receipt, promotes each capability atomically, and preserves a healthy required browser if recommended Context7 setup fails. Doctor resolves the recorded Chrome path and rejects a missing artifact or one that escapes the selected capability cache. Setup does not run a package manager in the target application or add managed executables to global PATH.

`agent-browser@0.32.3` does not expose an install-directory option. Setup therefore imports the Chrome version produced by its installer into capability-local staging and runs the adapter only with the managed executable path. A Chrome version directory created by the current setup transaction is removed after successful promotion; any pre-existing `~/.agent-browser` download is left untouched.

Default cache roots are `%LOCALAPPDATA%\frontend-accelerator` on Windows, `~/Library/Caches/frontend-accelerator` on macOS, and `$XDG_CACHE_HOME/frontend-accelerator` or `~/.cache/frontend-accelerator` on Linux. `FRONTEND_ACCELERATOR_CACHE_DIR` provides an explicit CI/test override. Entries are isolated by manifest hash, OS, and architecture.

If setup is interrupted or a receipt becomes invalid, rerun `setup`. Healthy capabilities are reused, incomplete staging is never promoted, and an invalid capability is rebuilt without discarding another healthy capability. The CLI intentionally ships no broad cache-cleanup command; cache entries are reconstructible and may be removed manually only after resolving the exact entry path reported by Doctor.

For non-interactive setup, use `setup --yes` only after reviewing the same preview interactively. A declined `install`, `update`, or `setup` exits successfully after making no changes. Invalid usage and operational errors exit with code `1`; `setup` also exits with code `1` when a required capability is blocked.

## Diagnose Readiness

Doctor is read-only: it never installs, repairs, cleans, trusts, or rewrites state.

```powershell
frontend-accelerator doctor
frontend-accelerator doctor --json
```

The project-owned equivalent is available even when the package CLI is not on PATH:

```powershell
node ./toolchain/bin/doctor.mjs --json
```

Top-level results are:

- `READY`: required tools, recommended tools, hook activation, and lint capability are available.
- `DEGRADED`: the required browser is present, but a recommended capability or guardrail signal is incomplete.
- `BLOCKED`: Node/manifest validation, required browser readiness, or hook configuration is invalid.

Hook sub-statuses distinguish `NOT_CONFIGURED`, `PENDING_ACTIVATION`, `ACTIVE`, and `STALE`.

Doctor exits with code `0` for both `READY` and `DEGRADED`, so recommended capabilities and guardrail limitations remain visible without failing automation. It exits with code `1` only for `BLOCKED`.

## Review And Activate Hooks

Claude Code and Codex require project hooks to be reviewed through their own trust flow. The installer never grants or bypasses trust.

After installation, start a new session in the target repository and open `/hooks`. Review the four accelerator events: `SessionStart`, `PreToolUse`, `PostToolUse`, and `Stop`. Once a trusted `SessionStart` executes, it writes a Hook Activation Proof into the accelerator cache; Doctor then changes that runtime from `PENDING_ACTIVATION` to `ACTIVE`. A manifest or registration change makes the old proof `STALE` until the new hook executes.

`PreToolUse` records a before-state for the files named by the tool, or a working-tree snapshot when a shell command does not identify its files. The matching `PostToolUse` compares the before and after states and attributes created, modified, deleted, and renamed paths to the current session. Pre-existing dirty files are excluded unless their content changes during that tool call. If the pair cannot be matched, the guardrail reports degraded attribution instead of guessing.

The Stop hook runs one existing project `lint` script for files attributed to the current agent session. It never installs dependencies or applies autofixes. A lint failure requests one continuation; an unchanged repeated Stop reports the recorded failure without rerunning or looping. Missing or ambiguous lint capability is explicit `DEGRADED` status, not a false pass.

## Agent Runtime Setup

Claude uses the committed `.claude/commands`, `.claude/agents`, and `.claude/skills` files directly. Invoke one named command, such as `/requirements-analyst` or `/coder`.

Codex uses the same skill content from `.agents/skills`. The generated agent definitions live in `.agents/codex-agents.toml`; merge or include those definitions in the user-level Codex configuration using the mechanism supported by the installed Codex version, then enable multi-agent support. The toolset does not edit global Codex configuration.

Both runtimes follow one workflow model:

```text
user invokes command -> isolated agent invokes one skill -> agent reports evidence and STOPs
```

An agent may recommend a contextual next command, but it never starts it.

## Command Catalog

| Command | Responsibility |
| --- | --- |
| `requirements-analyst` | Clarify frontend requirements, acceptance criteria, and unknowns. |
| `brainstorm` | Explore product and implementation options before commitment. |
| `writing-plans` | Produce a small, ordered implementation plan. |
| `architect` | Decide frontend boundaries, state, data flow, failures, and quality constraints. |
| `api-integration` | Define frontend consumption of confirmed or provisional API contracts. |
| `ui-designer` | Define interaction, responsive behavior, accessibility, and visual intent. |
| `git-worktrees` | Prepare an isolated worktree only after explicit approval. |
| `coder` | Implement the approved frontend scope. |
| `code-reviewer` | Review the current diff against scope, evidence, and applicable rules. |
| `test-generator` | Add focused tests from behavior and risk. |
| `browser-verify` | Verify the real UI through the required project-owned browser adapter. |
| `debugger` | Reproduce a failure, isolate its cause, and apply a focused fix. |
| `verify` | Run the relevant checks and report what is and is not proven. |
| `docs-generator` | Update durable project documentation required by the change. |
| `finishing-branch` | Prepare the branch for the developer's chosen integration action. |
| `release` | Prepare and validate a frontend release without publishing silently. |
| `reflect` | Capture reusable lessons after completed work. |
| `skill-creator` | Create or improve one project-local skill without changing the public catalog. |

Tasks and specs are lightweight and created only when a command needs them. Installation does not create empty root-level task or spec directories.

## Rulesets

Rules remain runtime-neutral and are split into three replaceable layers:

```text
rulesets/common/      framework-neutral frontend practice
rulesets/framework/   framework-specific practice; React by default
rulesets/project/     team-owned project conventions
```

Agents resolve rules through role-specific `INDEX.md` files. Missing optional sections are valid. The toolset does not generate `.claude/rules/` or infer project policy from source code.

To replace React, remove or archive the React-specific content under `rulesets/framework/`, add the new framework rules, and update the relevant role indexes. The default React rules are pinned donor snapshots with adjacent source metadata.

## Optional Reference-Aware UI Delivery

A task may opt into reference-driven delivery by adding a Reference UI Contract. This does not add a command or a workflow lane: every step remains a separate user invocation in the existing Manual Flow, every role STOPs after its own work, and no role automatically starts another role.

The full manual route is:

```text
UI Designer -> STOP -> Writing Plans -> STOP -> Coder -> STOP -> Browser Verify -> STOP -> Verify -> STOP
```

The user selects each next command. UI Designer is needed when reference direction, state, viewport, or acceptance intent is unresolved; Writing Plans carries the confirmed case IDs and acceptance criteria without analyzing the images again; Coder implements production behavior; Browser Verify records real-browser conformance evidence; Verify separately runs existing project checks and reports finalization readiness.

When Browser Verify reports an implementation mismatch, the user may invoke Coder and then Browser Verify again; a proven application/runtime defect may instead be handed manually to Debugger. A changed reference direction returns to UI Designer and requires a versioned manifest revision. Browser Verify recommends Verify only after a completed reference-aware implementation passes. These correction steps are recommendations followed by STOP, never an automatic retry loop.

### Task artifacts

Reference artifacts remain inside the selected Task Workspace:

```text
tasks/TASK-NNN/reference-ui/
|-- manifest.json
|-- references/                         # selected local baselines
|-- .staging/<owned-session>/           # current owned capture and draft
`-- validation/
    |-- iteration-001/
    |   |-- evidence.json
    |   `-- cases/<case-id>/...
    `-- iteration-002/...
```

- `manifest.json` is the versioned contract for stable case IDs, routes or components, states, declared desktop or mobile viewports, named regions, local baselines, tolerances, setup, interactions, semantic expectations, and dynamic-region handling.
- `references/` contains explicit local baseline inputs. Browser Verify never captures or updates a baseline automatically. Replacing a baseline is a separate planning decision that requires a compatible manifest revision, not a way to make a failed comparison pass.
- `.staging/<owned-session>/` belongs only to the current Browser Verify session. Draft evidence and capture output stay within that owned task scope.
- `validation/iteration-NNN/` is committed atomically and append-only. Earlier iterations are immutable; stable finding identities support `new`, `resolved`, `unchanged`, and `regressed` classifications across compatible iterations.

### Role authority

| Role | Reference-aware responsibility | Boundary |
| --- | --- | --- |
| UI Designer | Interpret confirmed reference direction and author the task manifest. | Planning-only; cannot change production UI or issue a browser verdict. |
| Writing Plans | Carry case IDs, acceptance criteria, preservation requirements, and the manual Browser Verify handoff into the implementation plan. | Does not reinterpret images or modify implementation. |
| Coder | Read the manifest and latest compatible failed evidence, implement production UI and essential behavior tests, and preserve cases that already pass. | Sole production-code owner; cannot modify the manifest, baselines, or validation evidence. |
| Browser Verify | Reproduce declared cases in a real browser and finalize task-scoped evidence. | Evidence-only; cannot modify production code, tests, configuration, fixtures, application data, baselines, or prior iterations. |
| Verify | Run applicable project checks and read the latest compatible Browser Verify verdict when reporting finalization readiness. | Read-only; does not capture screenshots, run screenshot diff, recalculate similarity, or create reference evidence. |

Reference Browser Verify keeps the same runtime boundary as ordinary browser verification: the project Doctor is the first readiness gate, and browser actions use only the project-owned adapter:

```powershell
node ./toolchain/bin/doctor.mjs --json
node ./toolchain/bin/agent-browser.mjs --session <owned-session> <command>
```

There is no global `agent-browser`, Playwright CLI, second browser provider, or automatic specialist invocation. Browser Verify returns one of four reference verdicts:

- `PASS`: every required case passed every applicable visual, semantic, behavior, accessibility, console, and network hard gate.
- `FAIL`: at least one applicable hard gate has an actionable mismatch or proven application/runtime defect.
- `BLOCKED`: required assets, state, URL, runtime capability, or approval did not permit a verdict.
- `NOT-APPLICABLE`: the explicit request has no reference-verifiable surface.

Successful lint, typecheck, tests, or build do not imply reference `PASS`. Finalization readiness requires both a latest compatible Browser Verify `PASS` and a Verify project-check `PASS` for the selected downstream application task.

The pinned `agent-browser@0.32.3` does not create its requested diff PNG when a screenshot is an exact match. In that case Browser Verify preserves the truthful measurement as a deterministic machine-readable zero-diff JSON artifact in the same case or region scope and declares it as the required diff evidence. It never labels a copy of the baseline or current screenshot as a pixel diff. A missing output for a non-zero or dimension-mismatched comparison is reported before finalization rather than hidden as a generic evidence error.

### Explicit live fixture

Maintainers can run the framework-neutral managed-browser acceptance explicitly:

```powershell
npm run test:reference-ui-live
```

This test is intentionally excluded from ordinary `npm test`. It uses the project Doctor, project-owned browser adapter, committed desktop/mobile baselines, a test-owned local server, and a temporary task workspace. Acceptance proves an initial mismatch, a corrected pass, and a deliberate regression with `new`, `resolved`, and `regressed` classifications, while also exercising semantic interaction, keyboard/focus recovery, and baseline immutability.

An overall fixture acceptance `PASS` proves the toolset lifecycle; the deliberate final regression is an expected test condition, not an acceptance failure. The fixture cleanup removes its temporary task evidence, so this result does not create persistent Browser Verify evidence or make any downstream application task ready for finalization. A concrete application task must select its own manifest and obtain its own latest compatible Browser Verify `PASS`.

## Browser Verification

`browser-verify` first runs the project Doctor, then uses only:

```powershell
node ./toolchain/bin/agent-browser.mjs --session <name> <command>
```

It discovers the actual application URL, asks before starting a development server, and stops only a server/session it owns. The evidence sequence covers viewport, accessibility snapshot, interactions, console, page errors, network requests, and screenshots when useful. There is no Playwright CLI or global `agent-browser` fallback.

Technical roles use `node ./toolchain/bin/ctx7.mjs library ...` followed by `docs ...` when a decision materially depends on current third-party documentation. Context7 absence is degraded evidence, not permission to invent an API.

### Deferred capabilities

The current Runtime Toolchain intentionally does not provision RTK, CodeGraph, or Graphify. RTK command rewriting needs a separate cross-runtime contract and may hide diagnostic context; code indexing needs its own storage, privacy, MCP-registration, and hook-ownership design. A Playwright CLI is also not shipped as a second browser provider: browser verification uses only the pinned project-owned `agent-browser` adapter.

## Verification Status

Automated tests cover manifest validation, platform cache resolution, atomic setup behavior, receipt-backed and legacy installation updates, read-only Doctor states, safe hook merges, current-session file attribution, lint-loop suppression, skill contracts, catalog/ruleset integrity, and generated Codex parity. The configured CI matrix runs the fake-installer suite on Node.js 24 across Windows, Linux, and macOS without downloading a browser. Repository text files are normalized to LF through `.gitattributes`; path and cache ownership checks canonicalize physical paths so Windows directory junctions and legacy short-path aliases do not create false cache-boundary failures.

Reference UI Contract acceptance covers schema and path confinement, atomic append-only evidence, exact-match zero-diff artifacts, separate hard-gate axes, desktop/mobile cases, manual role authority, canonical/mirror parity, and the explicit managed-browser lifecycle. The verified fixture lifecycle reports an expected initial `FAIL`, corrected `PASS`, and deliberate regression `FAIL`, with findings classified as `new`, `resolved`, and `regressed`; the live runner reports overall `PASS` only after those assertions and baseline immutability succeed. Package dry-run excludes `test/`, `tasks/`, `.codex/`, staging, and validation evidence from the release payload.

The Windows live smoke has verified disposable install, cache reuse, both capability probes, and the managed-browser sequence `open about:blank` -> `snapshot` -> `close`. Release evidence still requires hosted Linux/macOS CI plus one host-driven Claude Code and Codex session that trusts the registrations, changes Doctor from `PENDING_ACTIVATION` to `ACTIVE`, and runs the existing lint script once at Stop. Record unsupported local runtime or data-egress limitations instead of claiming unperformed parity.

## Maintainers

```powershell
npm run sync:agents
npm test
npm run check
npm pack --dry-run --json
```

`.claude/` is canonical. `npm run sync:agents` regenerates `.agents/skills` and `.agents/codex-agents.toml`. Upstream rule snapshots are updated deliberately using their adjacent `SOURCE.md` records; there is no automatic downstream updater.
