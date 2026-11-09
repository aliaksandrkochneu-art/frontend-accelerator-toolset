# Frontend Accelerator Toolset

The Frontend Accelerator Toolset is an installable agent workflow toolkit for frontend repositories. It is derived from Accelerator Mini's interaction model but contains no backend delivery branch and is not an application starter.

## Language

**Frontend Accelerator Toolset**:
The new frontend-native agent toolset being designed in this repository. Every delivery role is frontend-oriented by default.
_Avoid_: Frontend branch, coder-frontend, adoption layer

**Accelerator Mini**:
The source toolset whose manual command-to-agent-to-skill workflow is retained as the interaction model.
_Avoid_: Node.js starter, backend application template

**Frontend Starter Accelerator**:
The existing opinionated React starter used only as a donor of selected frontend code-quality guidance.
_Avoid_: Core workflow, base repository

**Manual Flow**:
The user-controlled sequence in which one command invokes one isolated agent, the agent executes one skill, stops, and recommends a context-appropriate next step from its allowed transitions. Only the user starts the next command.
_Avoid_: Orchestrator, automatic chaining, G0-G5 pipeline

**Command Catalog**:
The fixed first-version set of 18 frontend-native public command names. Each name maps one-to-one to an isolated agent and skill with the same name. The catalog has no backend lane, compatibility aliases, `coder-frontend`, `api-designer`, `frontend-design`, or separate `review-pr` command.
_Avoid_: Runtime-specific command catalog, duplicate role aliases, hidden command

**Canonical Workflow Source**:
The single source of truth stored in `.claude/commands/`, `.claude/agents/`, and `.claude/skills/` for command names, frontend-native roles, skill procedures, allowed transitions, and Manual Flow behavior. Its shared behavior is written portably even though the canonical files use the Claude-compatible layout.
_Avoid_: Third neutral core directory, separate Claude and Codex workflows, duplicated command catalogs

**Codex Mirror**:
The generated `.agents/skills/` tree and `.agents/codex-agents.toml` derived from the Canonical Workflow Source. The ready-to-copy mirror is committed to the toolset repository and regenerated only by toolset maintainers through `npm run sync:agents`; downstream projects copy it and never run the sync command as part of installation or normal use. It contains no independent delivery policy. Codex users manually include the generated agent definitions in their user-global configuration and enable the runtime's multi-agent capability; installation never edits global configuration.
_Avoid_: Second canonical source, hand-maintained Codex workflow

**Semantic Runtime Parity**:
The guarantee that Claude Code and Codex expose the same roles, Skill behavior, STOP boundary, allowed next steps, and guardrail outcomes even when invocation syntax and hook registration differ. Runtime differences are reported rather than hidden.
_Avoid_: Identical runtime internals, hidden capability downgrade, identical hook syntax

**Instruction-First Safety**:
The safety model in which runtime-native permissions and sandboxing, scoped role instructions, read-only role boundaries, and explicit approval remain the authority baseline, while portable hooks enforce selected deterministic guardrails. Manual Flow and STOP remain behavioral contracts rather than a hook-enforced pipeline.
_Avoid_: Hook-only safety, copied Mini hook suite, silent external action

**Runtime Toolchain**:
The minimum set of executable capabilities and runtime adapters that lets public Skills perform their declared work instead of providing instructions alone. When a required capability is unavailable, the affected Skill reports that boundary explicitly rather than implying successful execution.
_Avoid_: Copy Installer, Skill, Ruleset, assumed local tooling

**Runtime Toolchain Manifest**:
The project-owned, version-controlled declaration of required Runtime Toolchain capabilities and exact compatible tool versions. It identifies what the copied workflow expects without making those tools application dependencies.
_Avoid_: Application package manifest, lockfile, global tool assumption

**Required Runtime Capability**:
A Runtime Toolchain capability whose absence prevents an affected public Skill from claiming executable readiness. Runtime Doctor reports the missing capability as blocking.
_Avoid_: Optional enhancement, assumed executable, silent fallback

**Recommended Runtime Capability**:
A versioned Runtime Toolchain capability that improves work shared by several Skills but is not necessary for their basic execution. Runtime Doctor reports its absence as degraded rather than blocked.
_Avoid_: Required dependency, unreported optional tool, application package

**Runtime Toolchain Cache**:
The reconstructible user-local store where executables declared by a Runtime Toolchain Manifest are provisioned. It remains external to the target repository and is not a global PATH contract.
_Avoid_: Vendored binary, project dependency, global npm install

**Changed-File Lint Gate**:
The required Runtime Toolchain hook that tracks files changed by the current agent session and applies the project's existing lint capability before successful completion. It never installs or fixes tooling, and reports unavailable lint coverage as a degraded guardrail.
_Avoid_: Per-edit full lint, autofix hook, unrelated working-tree check

**Full Lifecycle**:
The complete set of frontend delivery routes from requirements and design through implementation, verification, documentation, and release, expressed as user-controlled Manual Flow steps. It is an available route graph rather than a mandatory pipeline for every task.
_Avoid_: Minimal coder toolkit, implementation-only workflow, mandatory pipeline

**Task Workspace**:
The temporary collection of artifacts produced by skills for one numbered piece of work. It supports handoffs during delivery and may be removed after implementation is complete.
_Avoid_: Product memory, living specification

**Reference UI Contract**:
An optional, task-scoped delivery contract that lets the existing Manual Flow carry reference-driven UI intent from planning through implementation and verification. It consists of one Reference UI Manifest, immutable local reference assets, and append-only Reference Validation evidence; it adds no command, role, transition, or automatic orchestration and is not a Living Specification.
_Avoid_: Visual implementation pipeline, automatic screenshot loop, permanent product documentation

**Reference UI Manifest**:
The versioned machine-readable file at `tasks/TASK-NNN/reference-ui/manifest.json` that maps stable case IDs to their target route or component, required state, viewport, local baseline, named regions, tolerance, deterministic setup and interactions, semantic expectations, dynamic-region handling, and allowed deviations. UI Designer may author it as planning work; Writing Plans and Coder consume it without reinterpreting or modifying its reference intent, and Browser Verify treats it and its baselines as read-only verification inputs.
_Avoid_: Production UI, mutable validation result, remote image URL as a baseline

**Reference Validation**:
The append-only evidence produced by Browser Verify for one compatible Reference UI Manifest version and digest. Each atomically finalized iteration records case and region artifacts, measurements, executed setup and interactions, separate visual, semantic, behavior, accessibility, console, and network axes, actionable findings, cross-iteration `new`, `resolved`, `unchanged`, and `regressed` classifications, and a `PASS`, `FAIL`, `BLOCKED`, or `NOT-APPLICABLE` verdict. Verify may read the latest compatible verdict only to report finalization readiness separately from its own project-check verdict; it never creates or recalculates Reference Validation.
_Avoid_: Baseline update, visual verdict inferred from tests, mutable task history

**Living Specification**:
A permanent, current description of frontend architecture, API integration, UI design, or implementation truth that evolves across tasks.
_Avoid_: Task history, changelog, repo memory

**Implementation Plan**:
A file-level, ordered handoff that defines intended behavior, affected files, contracts, tests, verification commands, and dependencies between steps. It does not duplicate complete production code or require artificial micro-commits.
_Avoid_: Full code listing, implementation transcript, commit script

**Frontend-Native Role**:
A standard role such as Coder, Architect, Code Reviewer, or Test Generator whose unqualified meaning is frontend work.
_Avoid_: Frontend Coder, coder-frontend, separate frontend lane

**API Integration**:
The frontend activity that consumes an existing backend contract and defines the client-facing data, error, authentication, caching, and test expectations. It has no authority to design or modify backend endpoints.
_Avoid_: API Designer, backend API design, controller design

**Provisional Contract**:
An explicitly unconfirmed description of the backend behavior the frontend needs, including assumptions or a mock schema used for coordination. It is not backend truth and cannot be recorded as confirmed API behavior without external confirmation.
_Avoid_: Confirmed API contract, implemented endpoint

**Brainstorming**:
The product and interaction exploration step that clarifies the problem, users, flows, behavior, states, constraints, alternatives, and success criteria. It has no authority to choose frameworks, libraries, repository structure, or technical architecture.
_Avoid_: Architecture design, library selection, implementation planning

**Architect**:
The frontend-native role responsible for module boundaries, routing, state ownership, data flow, integration boundaries, failure boundaries, performance, security, and testability. It may recommend new libraries with trade-offs but requires a human decision before treating a dependency as selected.
_Avoid_: Backend architect, UI designer, silent dependency selection

**Coder**:
The frontend-native implementation role responsible for production code and the tests directly required by changed behavior. It follows resolved architecture and rulesets and does not defer essential tests to Test Generator.
_Avoid_: Backend coder, coder-frontend, test-free implementation

**Test Generator**:
The specialized quality role that expands coverage with edge cases, regression, integration, component, or end-to-end scenarios beyond the tests required during implementation.
_Avoid_: Sole owner of implementation tests, replacement for Coder verification

**Code Reviewer**:
The read-only frontend quality role that evaluates a local diff, branch diff, or pull request against evidence and applicable rulesets. It reports prioritized findings and recommends another skill for fixes or missing tests rather than modifying code itself.
_Avoid_: Auto-fixer, implementation agent, whole-repository audit by default

**Browser Verify**:
The verification-only role that observes rendered behavior, interactions, responsive layout, accessibility signals, console output, and network failures in a real browser. It returns evidence and a verdict but never modifies production code; starting a detected development server requires explicit approval, and it may stop only a server it started itself.
_Avoid_: Visual auto-fixer, Coder, Debugger

**Debugger**:
The frontend execution role that proves a root cause before changing code, then may add a regression test and apply one minimal verified fix. Architectural changes or substantial implementation are handed to Architect or Coder.
_Avoid_: Random fix loop, symptom patching, opportunistic refactor

**Verify**:
The read-only verdict role that runs existing checks for the resolved Application Root, records evidence, and reports pass, fail, blocked, or not-applicable outcomes. It neither repairs failures nor installs missing tooling.
_Avoid_: Auto-fixer, dependency installer, assumed framework command

**Documentation Generator**:
The docs-only finalization role that updates affected living specifications and project documentation from verified implementation truth. It does not modify source code, agent policy, skills, or rulesets and records only decisions already made.
_Avoid_: Source-code editor, policy editor, architecture decision maker

**Finishing Branch**:
The user-directed finalization role that may perform one explicitly selected git or pull-request action after successful verification. It does not silently push, merge, clean up, force-push, or offer destruction of unmerged work as a normal path.
_Avoid_: Automatic integration, force push, implicit cleanup

**Release**:
The GitHub-specific finalization role that prepares version and release artifacts and, after separate confirmations, may publish a tag and GitHub release. Outside a confirmed GitHub repository it may prepare local artifacts but cannot report publication success.
_Avoid_: Provider-neutral publisher, implicit tag push, assumed main branch

**UI Designer**:
The planning-only frontend-native role responsible for context-appropriate interface structure, interaction, visual hierarchy, responsive behavior, accessibility, and user-visible states. It preserves existing design systems, updates design specifications, and does not write production UI code; technical module boundaries and application data flow remain owned by Architect.
_Avoid_: Frontend Designer, generic Designer, frontend architecture

**TypeScript-First**:
The first-version boundary in which frontend frameworks are replaceable but TypeScript remains the shared language foundation. JavaScript-only repositories are not part of the guaranteed support scope.
_Avoid_: Language-neutral, JavaScript-first, replaceable language pack

**Skill**:
A stable, framework-neutral procedure for one frontend activity. A skill defines the work sequence but does not embed React, Angular, Vue, or project-specific coding policy.
_Avoid_: Framework pack, project rules

**Ruleset-Aware Skill**:
A content-producing or assessing Skill that loads the matching Common, Framework, and Project Ruleset sections that are available. A missing optional section does not block work: the skill continues from repository evidence, loaded guidance, and general frontend best practices. Workflow and operational utilities use core policy and project context without requiring ruleset sections.
_Avoid_: Every skill, workflow utility

**Reflect**:
An optional user-invoked utility that turns a demonstrated recurring agent mistake or correction into a proposed durable rule. After explicit approval it may update only the Project Ruleset; it is not automatic memory and does not participate in workflow orchestration.
_Avoid_: Automatic learning, background mutation, orchestrator

**Ruleset**:
A replaceable collection of code-writing and review guidance consumed by skills. Rulesets specialize stable skills without changing commands, agents, or workflow.
_Avoid_: Skill, orchestrator, application scaffold

**Ruleset Root**:
The visible `rulesets/` directory at the Repository Root. It contains the bundled framework-neutral `common/` baseline, the replaceable React-first `framework/` pack, and local `project/` guidance. Ruleset-aware skills resolve this repository-level location even when the Application Root is nested in a monorepo.
_Avoid_: .accelerator/rulesets, application-local rulesets, rulesets.yml registry

**Ruleset Index**:
The optional routing entrypoint for one available skill section of a Ruleset. It classifies the current work and selects the smallest relevant set of local or shared rule files instead of loading the entire section. A bundled section always provides an index; a project section without one loads its direct Markdown files in lexical order.
_Avoid_: Skill procedure, recursive rule loading

**Vendored Rule Snapshot**:
An established donor or upstream best-practice collection copied byte-for-byte under a Ruleset's `shared/` directory. Authored skill indexes route to it, while `SOURCE.md` records origin, revision or retrieval date, exclusions, and required attribution. Incompatible files are excluded whole rather than rewritten.
_Avoid_: Adapted copy, runtime web fetch, silent rule fork

**Common Ruleset**:
Bundled framework-neutral guidance under `rulesets/common/` for architecture, API integration, UI design, implementation, review, testing, debugging, and browser verification. It includes an unchanged pinned Web Interface Guidelines snapshot routed by authored indexes and available offline. After copying, it is an ordinary project file set; future toolset changes are adopted manually.
_Avoid_: React rules, project conventions, automatic upstream update

**Framework Ruleset**:
The single active framework policy pack under `rulesets/framework/`. The bundled first version contains unchanged, project-agnostic React and TypeScript best-practice snapshots for rendering, state, effects, component composition, asynchronous behavior, bundle splitting, accessibility, and React testing. Selection is curated at file level: incompatible stack-specific files are excluded whole, never rewritten. A project may replace the whole directory or only the skill sections it needs with Angular, Vue, or other frontend guidance.
_Avoid_: Framework branch, framework-specific agent, installed pack registry

**Convention-Only Framework Contract**:
The Framework Ruleset is controlled through stable skill-section directories, optional skill-local `INDEX.md` files, and an optional cross-skill `shared/` directory rather than a global manifest. Skills hardcode only stable section names. Bundled sections use indexes that may reference rules inside the same Ruleset root; project sections without an index load direct Markdown files in lexical order. If a matching section is absent, the skill continues without framework-specific rules. If an `INDEX.md` exists, its selected files must be present and readable.
_Avoid_: Mandatory ruleset.yml, framework registry, eager whole-pack validation

**Unconfigured Framework**:
The valid state in which `rulesets/framework/` has no compatible active skill sections, for example after a non-React project removes the bundled React pack before adding its own. Skills continue from repository evidence, Common and Project Rulesets, and general frontend best practices.
_Avoid_: React fallback after pack removal, framework guess, mandatory execution block

**Project Ruleset**:
Local guidance under `rulesets/project/` for repository architecture, styling, naming, testing, and other team conventions. The bundled directory starts with a small README and no active project-specific skill sections.
_Avoid_: Common rules, framework defaults, generated conventions

**Copied Toolset File**:
Any command, agent, skill, Codex mirror, or ruleset file copied into the downstream repository. After copying it is controlled by that project and may be edited normally; the first version has no ownership registry or automatic updater.
_Avoid_: Managed installation, immutable generated file, checksum ownership

**Copy Installer**:
The Node CLI that installs project-owned workflow files into the target Git root after preview, conflict checking, and confirmation. Ordinary target files remain copy-only; only recognized runtime hook configuration may use Hook Registration Merge.
_Avoid_: Package manager, general-purpose merger, source migrator

**Hook Registration Merge**:
The single structured-merge exception that appends accelerator hook registrations to recognized Claude Code and Codex project configuration while preserving existing valid settings. The Copy Installer previews the exact change, avoids duplicates, and writes nothing when parsing or semantic conflict checks fail.
_Avoid_: Generic settings merge, overwrite, implicit hook replacement

**Hook Activation Proof**:
The runtime-specific, reconstructible evidence emitted only after an installed accelerator hook actually executes for the current Runtime Toolchain Manifest. Runtime Doctor uses it to distinguish configured hooks from active guardrails without bypassing runtime trust.
_Avoid_: Automatic trust, configuration-presence assumption, permanent project state

**Runtime Setup**:
The explicit state-changing CLI operation that provisions the exact tools declared by the Runtime Toolchain Manifest into the Runtime Toolchain Cache. It is separate from project-file copying and requires its own approval.
_Avoid_: Automatic post-install, application dependency installation, implicit download

**Runtime Doctor**:
The read-only CLI operation that reports whether the Runtime Toolchain Manifest, Cache, and required capabilities form a usable environment. It diagnoses missing or incompatible state but never provisions or repairs it.
_Avoid_: Setup alias, auto-fixer, silent upgrade

**Git-Root Targeting**:
The Copy Installer treats its current working directory as the target Repository Root and requires that directory itself to be the Git root. It neither searches parent directories nor accepts a separate target path.
_Avoid_: Implicit parent search, --target, installation from an application subdirectory

**Manual Copy Installation**:
The first-class installation path in which the developer copies `.claude/`, `.agents/`, and `rulesets/` directly from the toolset repository or release into the target Git root and resolves filesystem conflicts manually.
_Avoid_: Separate overlay format, receipt registration, hidden installation state

**Copy Preflight**:
The CLI-only check that enumerates every planned project-file change before writing. Ordinary exact-path collisions and conflicting hook registrations stop the whole operation, while recognized hook configuration is eligible only for Hook Registration Merge.
_Avoid_: Automatic overwrite, partial CLI copy, general merge, rename, or backup

**Root Agent Instructions**:
Root `AGENTS.md` and `CLAUDE.md` files that belong entirely to the downstream project. The project team may create, edit, or delete them at any time; they are not included in the copy source and the Copy Installer never changes them.
_Avoid_: Managed instruction block, immutable project file, accelerator-owned AGENTS.md

**Application Root**:
The resolved root of the frontend application targeted by the current workflow. It may equal the Repository Root or identify one explicitly selected application inside a monorepo.
_Avoid_: Mandatory frontend directory, assumed repository root

**Repository Root**:
The root of the repository that contains the toolset and may contain one or more frontend applications.
_Avoid_: Application Root when the repository is a monorepo

## Flagged Ambiguities

**Frontend accelerator**:
This phrase previously referred to the existing React starter. Use **Frontend Accelerator Toolset** for the new product and **Frontend Starter Accelerator** for the existing donor repository.

**Framework support**:
In the first version, framework support means a stable replacement contract for the active Framework Ruleset. It does not mean that the toolset ships maintained packs for every frontend framework.

**CLI**:
This phrase is ambiguous between the installation command and tools used by agents during execution. Use **Copy Installer** for the former and **Runtime Toolchain** for the latter collection.

## Example Dialogue

> **Developer:** Do I need a separate Angular Coder agent?
>
> **Domain expert:** No. Coder is a Frontend-Native Role and remains unchanged. Replace the active Framework Ruleset with the Angular pack.
>
> **Developer:** What happens if I remove the bundled React rules before adding Angular rules?
>
> **Domain expert:** Framework-specific sections become unavailable, but skills continue with Common and Project Rulesets plus general frontend best practices.
>
> **Developer:** Does the Runtime Toolchain add dependencies to my frontend application?
>
> **Domain expert:** No. The project-owned Runtime Toolchain Manifest pins the required capabilities, while their executables are provisioned in the external Runtime Toolchain Cache.
