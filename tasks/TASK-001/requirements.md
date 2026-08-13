# Reference-Driven UI Delivery Through the Existing Manual Flow

## Problem Statement

Developers can pass visual references to the Frontend Accelerator Toolset, but the current Manual Flow does not turn those references into a durable, testable contract shared by UI Designer, Coder, and Browser Verify.

UI Designer can describe information hierarchy, interaction, responsive behavior, accessibility, and user-visible states, but its planning-only contract does not define how screenshots map to routes, states, viewports, or measurable visual anchors. Coder can implement production UI, but receives no standardized reference handoff and has no explicit obligation to preserve already-matching reference cases while addressing later visual findings. Browser Verify can exercise a rendered application and collect screenshots, console output, network evidence, and responsive observations, but it has no reference-comparison mode, no structured visual acceptance contract, and no task-level evidence format that Coder can consume in a later Manual Flow step.

As a result, a reference-driven task can produce a reasonable UI specification and working code while still diverging materially from the supplied design. The developer must translate screenshots into prose, visually inspect results by hand, explain each mismatch to Coder, and remember which routes or viewports already passed. The system can say that browser behavior works, but it cannot honestly say that the implementation conforms to the supplied references.

The solution must preserve the existing domain model and accepted architecture:

- Coder remains the only Frontend-Native Role that owns production implementation.
- UI Designer remains planning-only.
- Browser Verify remains verification-only and never edits production code.
- Application Root remains resolved shared workflow context; downstream roles validate and honor it rather than independently selecting a different application.
- The fixed Command Catalog remains unchanged.
- One command still invokes one isolated agent and one Skill, then stops.
- The user explicitly starts every next command; no orchestrator or automatic retry loop is introduced.
- Temporary reference and validation artifacts live in the Task Workspace, while durable confirmed UI truth remains in Living Specifications.

## Solution

Add a reference-aware delivery contract to the existing Manual Flow. UI Designer, Coder, Writing Plans, Browser Verify, and Verify continue to operate as separate commands with their current authority boundaries, but they share a task-level Reference UI Contract.

The Reference UI Contract consists of two related artifact classes inside the Task Workspace:

1. An immutable-for-the-iteration Reference UI Manifest that records what must be reproduced and how it can be observed.
2. Append-only Reference Validation evidence produced by Browser Verify for each verification iteration.

UI Designer authors the Reference UI Manifest when the task needs design interpretation. If the developer already provides a complete manifest or an equally explicit reference contract, the Manual Flow may enter at Writing Plans or Coder, consistent with Full Lifecycle being an optional route graph.

Writing Plans turns the confirmed reference contract into an implementation handoff, including the affected UI behavior, essential tests, required reference cases, and a Browser Verify step after implementation.

Coder reads the selected Application Root, Reference UI Manifest, implementation plan when present, existing design system, and relevant source. Coder implements production UI and essential behavior tests, runs the smallest applicable project checks, and recommends Browser Verify when reference cases exist. Coder does not issue the visual verdict and does not create a second visual-design policy.

Browser Verify activates reference mode when the task points to a Reference UI Manifest. It uses the project-owned Runtime Toolchain and supplied or emitted application URL to reproduce each declared route, state, and viewport. It combines accessibility snapshots and semantic locators for deterministic interaction with reference and current screenshots for visual comparison. It records console, network, responsive, focus, keyboard, and user-visible state evidence as it does today.

Browser Verify returns:

- `PASS` when every required reference case and every applicable behavior, accessibility, console, and network check passes;
- `FAIL` when the application is runnable and one or more actionable mismatches are found;
- `BLOCKED` when a reference, application state, asset, authentication fixture, Runtime Toolchain capability, or server condition prevents an honest verdict;
- `NOT-APPLICABLE` only when the task contains no reference-verifiable UI surface.

On `FAIL`, Browser Verify writes structured findings localized to a reference case and observable region. The user may manually invoke Coder with those findings. Coder applies the smallest coherent fix while preserving cases that already passed, then stops. The user manually invokes Browser Verify again. This Coder and Browser Verify cycle can repeat, but it is never hidden or automatically orchestrated.

After Browser Verify returns `PASS`, the user may invoke Verify for the Application Root's existing lint, typecheck, test, end-to-end, and build checks. Verify remains a read-only project-check verdict and does not replace the reference verdict.

The primary testing seam is the task-level Reference UI Contract. The feature is considered correct when the canonical Skills produce and consume that contract consistently and the project-owned browser adapter can reproduce a fixture reference case and emit an externally observable verdict and evidence. Tests should avoid inspecting prompt phrasing or internal helper calls except where existing catalog, mirror, and adapter contract tests already make those structures public policy.

## User Stories

1. As a developer, I want to give UI Designer one or more visual references, so that the intended visual direction is grounded in evidence rather than reconstructed from prose.

2. As a developer, I want each reference mapped to a target route or component surface, so that Coder knows where the design must appear.

3. As a developer, I want each reference mapped to a user-visible state, so that authenticated, loading, empty, error, success, permission, and populated variants are not conflated.

4. As a developer, I want each reference mapped to an explicit viewport, so that desktop and mobile designs are verified at the dimensions they actually describe.

5. As a developer, I want references with unknown viewport or state information to be identified as ambiguous, so that the toolset does not silently invent acceptance conditions.

6. As a developer, I want an unambiguous visual reference to count as a selected direction, so that UI Designer does not make me choose among unrelated alternative styles.

7. As a developer, I want UI Designer to preserve the application's existing design system while interpreting the reference, so that reference matching does not create a parallel component library.

8. As a developer, I want UI Designer to record intentional deviations required by accessibility or established product constraints, so that those differences are not repeatedly reported as accidental defects.

9. As a developer, I want UI Designer to distinguish visible facts from inferred responsive behavior, so that a single desktop screenshot is not treated as proof of a mobile design.

10. As a developer, I want the task's visual acceptance conditions saved in the Task Workspace, so that later isolated agents receive the same contract without relying on conversation memory.

11. As a developer, I want to enter the Manual Flow directly at Coder when the reference contract is already complete, so that small, well-specified tasks do not require unnecessary planning commands.

12. As a developer, I want Coder to recommend UI Designer or another owning specialist when a reference requires an unresolved design, architecture, API, dependency, or data decision, so that Coder does not silently expand its authority.

13. As a developer, I want Coder to remain the only role that edits production UI, so that implementation ownership stays clear.

14. As a developer, I want Coder to consume the same selected Application Root that the accelerator already resolved, so that the role does not drift into a neighboring application in a monorepo.

15. As a developer, I want Coder to reuse existing tokens, assets, primitives, and neighboring component patterns, so that visual fidelity does not come at the cost of project fit.

16. As a developer, I want Coder to implement essential behavior tests alongside the UI, so that a visually similar interface is not accepted when its user-visible behavior is broken.

17. As a developer, I want Coder to cover the success path and the most damaging failure or boundary implied by the reference task, so that the implementation has meaningful regression protection.

18. As a developer, I want Coder to know which reference cases already passed a previous browser verification, so that a targeted fix does not casually regress them.

19. As a developer, I want Coder to receive region-level findings rather than a vague instruction to make the page more similar, so that each iteration has an actionable cause and expected outcome.

20. As a developer, I want Coder to stop after implementing and checking its scoped change, so that the existing Manual Flow and explicit next-step decision remain intact.

21. As a developer, I want Browser Verify to use the supplied or emitted application URL, so that it does not guess a host or port.

22. As a developer, I want Browser Verify to ask before starting a development server and stop only a server it owns, so that reference verification does not interfere with my existing processes.

23. As a developer, I want Browser Verify to reproduce declared application state using stable interactions or approved fixtures, so that screenshots represent the intended scenario.

24. As a developer, I want Browser Verify to use semantic element references for interaction, so that browser actions do not depend on guessed pixel coordinates.

25. As a developer, I want Browser Verify to capture screenshots at the declared viewport and stable browser settings, so that visual comparisons are reproducible.

26. As a developer, I want Browser Verify to wait for relevant fonts, images, and readiness signals, so that loading races do not become false visual defects.

27. As a developer, I want Browser Verify to disable or reduce animation during comparison, so that transitions do not make visual evidence flaky.

28. As a developer, I want Browser Verify to compare both the whole surface and named high-priority regions, so that a small critical mismatch is not hidden by a good aggregate page score.

29. As a developer, I want dynamic content declared by the reference contract verified semantically or excluded from pixel comparison, so that timestamps and nondeterministic data do not create noise.

30. As a developer, I want Browser Verify to check interaction, focus, keyboard, responsive reflow, long content, accessibility signals, console errors, and network failures alongside visual evidence, so that appearance does not replace correctness.

31. As a developer, I want Browser Verify to report the exact route, state, viewport, interactions, and evidence behind every verdict, so that I can reproduce it.

32. As a developer, I want every visual finding tied to a manifest case and named region, so that I can understand which acceptance condition failed.

33. As a developer, I want every visual finding to state expected behavior, actual behavior, severity, and supporting measurement or screenshot, so that Coder receives a precise handoff.

34. As a developer, I want Browser Verify to preserve screenshots and diffs in the Task Workspace, so that review does not depend on transient terminal output.

35. As a developer, I want Browser Verify to avoid editing source, tests, configuration, or application data, so that the verifier cannot make its own check pass.

36. As a developer, I want Browser Verify to recommend Coder for implementation mismatches, Debugger for proven runtime failures, or Verify after a reference pass, so that the next manual step is contextual.

37. As a developer, I want to decide whether to run another Coder iteration, so that the system never hides an automated fix loop.

38. As a developer, I want a later Browser Verify run to distinguish new, resolved, unchanged, and regressed findings, so that progress is visible across iterations.

39. As a developer, I want Browser Verify to stop with `BLOCKED` when references conflict or required assets and states are unavailable, so that it does not fabricate a pass.

40. As a developer, I want a clear `PASS` only when all required reference cases pass, so that visual conformance claims are trustworthy.

41. As a developer, I want Verify to remain responsible for existing project checks after visual verification, so that the visual feature does not weaken lint, typecheck, tests, or build requirements.

42. As a developer, I want Living Specifications updated only from confirmed implementation truth, so that temporary iterations do not become permanent design policy.

43. As a maintainer, I want the public Command Catalog to remain unchanged, so that the feature does not introduce a hidden or duplicate workflow lane.

44. As a maintainer, I want Claude command, agent, and Skill definitions to remain the Canonical Workflow Source, so that reference behavior has one policy owner.

45. As a maintainer, I want Codex artifacts regenerated from the canonical source, so that Semantic Runtime Parity is preserved.

46. As a maintainer, I want contract tests to fail when a generated mirror loses reference-aware behavior, STOP boundaries, or allowed transitions, so that runtime drift is detected before release.

47. As a maintainer, I want the Runtime Toolchain Manifest to remain the authority for browser capability and version, so that Skills do not depend on an unpinned global browser tool.

48. As a maintainer, I want reference verification to use existing Runtime Doctor and browser-adapter seams, so that the feature does not add an independent readiness path.

49. As a maintainer, I want fixture-based acceptance coverage for a reference page with an intentional mismatch, so that screenshot capture, comparison, evidence writing, and verdict behavior are tested at their highest practical seam.

50. As a maintainer, I want reference evidence to remain temporary task data, so that release payloads and Living Specifications are not filled with obsolete screenshots and iteration history.

## Implementation Decisions

- The feature extends the existing Manual Flow. It does not introduce an orchestrator, an automatic Coder and Browser Verify loop, a hidden pipeline, or a nineteenth public command.

- Coder remains the sole owner of production implementation. No `reference-ui-builder`, visual auto-fixer, or second coding role is introduced.

- UI Designer remains planning-only. Its reference-aware path interprets supplied visual evidence, defines observable UI intent, and writes task artifacts without editing production code.

- Browser Verify remains verification-only. It may write evidence artifacts inside the current Task Workspace, but it may not edit production source, tests, configuration, fixtures, or application data to obtain a pass.

- The selected Application Root is shared workflow context produced by the accelerator's existing resolution behavior. Every participating Skill validates and honors that root. A Skill stops on missing or ambiguous shared context rather than independently switching to another application.

- The Reference UI Contract is the single cross-role seam. It contains a Reference UI Manifest plus iteration-scoped validation evidence. Other handoffs continue to use existing task artifacts and role outputs.

- The Reference UI Manifest is versioned and machine-readable. It records a task identity, reference cases, target surface, route or component identity, required user-visible state, viewport, theme when relevant, priority, visual anchors, interaction requirements, dynamic or semantically verified regions, allowed deviations, and acceptance policy.

- Reference sources may be local images exposed to the agent runtime, conversation attachments made available as readable artifacts, or explicit user-provided URLs. Network access and any local persistence of remote content continue to follow runtime approval policy. A remote live page is not treated as a stable baseline until the task records the intended captured state.

- An explicit reference counts as selected visual direction for the properties it visibly defines. UI Designer does not propose alternative styles merely because the application lacks prior visual direction. It still records ambiguity where the reference does not define responsive behavior, interaction, content extremes, or inaccessible details.

- Existing product rules and accessibility requirements constrain reproduction. The toolset never intentionally copies a reference behavior that violates universal accessibility or explicit project safety rules. Required deviations are recorded as allowed deviations and remain visible in validation evidence.

- Writing Plans reads the Reference UI Contract and includes implementation steps, essential tests, the declared reference cases, and a Browser Verify handoff. It does not duplicate image analysis or embed production code.

- Coder entry is allowed directly when architecture, API, dependency, UI direction, target state, viewport, and acceptance conditions are already resolved. Otherwise Coder stops and recommends the owning planning specialist.

- Coder reads the latest failed Reference Validation evidence when the user manually requests a correction iteration. It addresses a coherent set of related findings, preserves already-passing cases, runs the smallest applicable existing checks, reports changed files and remaining risk, recommends Browser Verify, and stops.

- Browser Verify reference mode activates only from an explicit Reference UI Contract or explicit reference-verification request. Ordinary Browser Verify behavior remains unchanged for tasks without references.

- Browser Verify uses the project-owned Runtime Doctor as its only browser-readiness gate and the project-owned browser adapter as its only browser interface. It never falls back to a global Playwright or browser binary.

- Browser Verify uses accessibility snapshots and semantic locators for deterministic navigation and interaction. Screenshots are evidence for appearance, not the primary mechanism for locating controls.

- Browser Verify uses the Runtime Toolchain's pinned screenshot and screenshot-diff capabilities. If the pinned capability lacks a required operation, the capability version and manifest must be updated explicitly; the Skill must not install or call an unpinned replacement.

- Each reference case is verified at its declared viewport. Browser Verify may add contextual responsive checks required by the task or applicable rules, but it does not claim reference fidelity for an undeclared viewport.

- Whole-surface comparison is supplemented by named visual anchors. Anchor identity prefers stable semantic locators such as role and accessible name, then existing test identifiers, visible text, or a narrowly scoped project selector. Generated class names and brittle DOM paths are last-resort evidence.

- Dynamic regions are handled through the manifest. A declared dynamic region is either verified through semantic assertions, compared as a selector-scoped stable subregion, or explicitly excluded from pixel verdicts while remaining visible in the report.

- Visual comparison is deterministic within practical limits: fixed viewport, CSS-pixel screenshot scale, fixed browser capability version, declared theme and locale when relevant, stabilized fonts and images, reduced or disabled animation, and a reproducible user-visible state.

- Browser Verify evaluates separate axes rather than one aggregate quality score: visual conformance, structural and semantic conformance, behavior, accessibility signals, console health, and network health. A strong visual score cannot cancel a failed hard gate.

- Hard-gate failures include missing required content or anchors, broken required interactions, inaccessible required controls, uncaught page errors, unexpected failed requests that affect the scenario, and a high-priority visual region outside its declared tolerance.

- Visual tolerance is task-specific and stored in the acceptance policy. When no explicit tolerance exists, Browser Verify applies a conservative project default documented by the Common Ruleset and reports the actual measurement. It never silently relaxes a failed threshold.

- Reference Validation evidence is append-only per iteration. It records manifest version, application URL, route, state, viewport, interactions, screenshot and diff artifacts, measurements, console and network evidence, findings, passed cases, regressed cases, and verdict.

- A finding includes the reference case, named region, severity, expected observation, actual observation, evidence, and the smallest user-visible correction target. A finding may name the likely component when repository evidence supports it, but Browser Verify does not prescribe speculative code changes.

- Browser Verify returns `PASS` only when every required case passes all applicable hard gates. It returns `FAIL` for actionable conformance defects and `BLOCKED` for missing or contradictory inputs, unavailable state, missing required assets, runtime inability, or an unreproducible environment.

- The user controls iteration. On `FAIL`, Browser Verify recommends Coder or Debugger and stops. The user manually invokes the next role with the task identity. This preserves the accepted optional route graph and STOP boundary.

- Verify remains responsible for existing project checks and does not recalculate visual similarity. A reference-aware task is ready for finalization only after the latest Browser Verify reference verdict is `PASS` and the subsequent applicable Verify verdict is `PASS`.

- Living UI specifications receive only confirmed durable UI truth after implementation and verification. Reference files, diffs, measurements, failed iterations, and transient browser evidence remain in the Task Workspace.

- Canonical Claude-compatible command, agent, Skill, and template sources are updated first. Codex mirrors are regenerated by the existing maintainer sync operation and must preserve equivalent role meaning, reference behavior, allowed transitions, and STOP contracts.

- Existing allowed transitions are sufficient: UI Designer can recommend Writing Plans; Writing Plans can recommend Coder; Coder can recommend Browser Verify; Browser Verify can recommend Coder, Debugger, or Verify. No route-graph expansion is required.

## Testing Decisions

- Tests assert observable Manual Flow contracts and Runtime Toolchain behavior, not model reasoning steps, prompt wording, helper call order, or private implementation details.

- The highest testing seam is one task-level Reference UI Contract exercised across a small fixture application. The fixture provides a stable reference image, a known target state, a deliberate visual mismatch, a deterministic interaction, and a later corrected state. The test observes manifest validation, browser capture, comparison output, verdict, and evidence artifacts.

- UI Designer contract coverage verifies that reference-aware tasks produce the required Reference UI Contract fields, treat explicit reference direction as selected, preserve planning-only authority, and stop with the correct next-step recommendation.

- Coder contract coverage verifies that Coder is still the only production-code owner, consumes reference and validation artifacts when present, preserves essential behavior-test ownership, recommends Browser Verify for reference work, and stops rather than invoking it.

- Browser Verify contract coverage verifies reference-mode activation, project Doctor usage, project browser-adapter usage, evidence-only Task Workspace writes, production-code immutability, all four verdicts, exact URL and viewport reporting, and contextual allowed transitions.

- Browser adapter tests extend the existing adapter seam rather than creating a second browser wrapper. They verify that screenshot, selector-scoped screenshot, viewport, and screenshot-diff commands are forwarded to the pinned managed capability with the owned session and intended output paths.

- The fixture acceptance test verifies an initial `FAIL` with an actionable region-level finding, followed by a `PASS` after the fixture implementation is corrected. It also verifies that previously passed cases are reported as regressed when deliberately broken.

- The fixture includes at least one semantic interaction assertion so that the feature cannot pass from image comparison alone.

- The fixture includes a dynamic value declared for semantic verification so that nondeterministic content does not fail the pixel gate while still remaining tested.

- The fixture includes desktop and mobile reference cases when both are declared. A single-viewport fixture must not produce claims about visual fidelity at undeclared viewports.

- Failure-path tests cover a missing reference, unreadable reference, missing route or state, contradictory manifest cases, browser capability unavailable, server launch denied, screenshot capture failure, diff failure, console error, failed required network request, missing anchor, and threshold failure.

- Accessibility and interaction tests use existing Browser Verify and Web Interface Guidelines seams. They assert external behavior such as role, accessible name, focus visibility, keyboard activation, and user-visible recovery, not framework internals.

- Catalog tests continue to assert exactly the existing 18 public commands and existing transition graph. A test explicitly prevents introduction of a reference-specific public command or auto-orchestrator.

- Contract tests extend existing read-only-role checks so Browser Verify can write only task evidence while remaining forbidden from changing application code, tests, configuration, or data.

- Mirror tests verify Semantic Runtime Parity after the maintainer sync operation. Canonical source and Codex mirror must expose equivalent reference-aware semantics and STOP boundaries.

- Ruleset tests verify that reference-aware UI Designer, Coder, and Browser Verify sections load the smallest applicable Common, Framework, and Project guidance without making absent optional sections blocking.

- Existing full project checks remain acceptance requirements. The feature is not complete until the repository test suite and canonical-mirror check pass.

- Snapshot baselines are never automatically updated by a failing test or verification run. A baseline change requires an explicit reviewed change to the reference contract.

- Tests avoid exact pixel equality for antialiasing-sensitive text unless the Runtime Toolchain environment is fully pinned. High-priority geometry, missing elements, stable fills, and semantic behavior remain hard assertions; configurable low-level raster tolerance is reported rather than hidden.

## Out of Scope

- Adding a new public command such as `ui-from-reference` or `reference-ui-builder`.

- Adding a new isolated coding agent, visual auto-fixer, hidden coordinator, or automatic multi-agent loop.

- Allowing UI Designer or Browser Verify to edit production code.

- Replacing Coder, Writing Plans, Verify, Code Reviewer, Test Generator, or Debugger responsibilities.

- Changing the accepted Manual Flow, one-command-one-agent-one-Skill mapping, explicit STOP boundary, or fixed Command Catalog.

- Automatically choosing a different Application Root from the root already selected by shared workflow context.

- Installing a global browser, Playwright, image-diff utility, font package, or application dependency from a Skill.

- Making Figma API extraction, design-token export, or editable design-file synchronization a required v1 capability.

- Generating missing brand assets or replacing assets through image generation.

- Treating a single desktop screenshot as a complete responsive specification.

- Guaranteeing byte-for-byte raster equality across different operating systems, browser versions, graphics stacks, or font environments.

- Automatically modifying or approving visual baselines after implementation changes.

- Persisting failed iteration history, screenshots, or diff images as Living Specification content.

- Publishing screenshots, references, or validation artifacts outside the repository or Task Workspace.

- Automatically running Verify, finishing a branch, pushing, opening a pull request, or releasing after a visual pass.

- Defining product-specific aesthetic policy in the Common Ruleset.

## Further Notes

- This specification deliberately corrects the earlier idea of a `reference-ui-builder`. That role would duplicate Coder's production-code authority and conflict with the established Frontend-Native Role model.

- This specification also rejects an automatic `ui-designer → coder ↔ browser-verify → verify` coordinator. The accepted architecture defines Manual Flow as user-controlled and explicitly distinguishes next-step recommendation from orchestration.

- The expected developer journey is therefore manual but evidence-backed: UI Designer when interpretation is needed, Writing Plans when a file-level handoff is useful, Coder for implementation, Browser Verify for reference verdict, Coder or Debugger for a user-selected correction step, Browser Verify again, then Verify.

- The testing seam matches the discussion that existing specialized roles should interact through explicit artifacts rather than share implementation authority. The task-level Reference UI Contract is the one durable seam across those roles.

- Research supporting the design is stored separately from this implementation specification. The strongest recent evidence indicates that visual fidelity and functional correctness must be evaluated separately and that rendered visual feedback materially improves GUI coding and debugging outcomes.

- The issue tracker did not contain the `ready-for-agent` label required by the spec-publishing workflow at the time this specification was prepared. The publishing step should create that single triage label if it is still absent, then apply only that label to the issue.
