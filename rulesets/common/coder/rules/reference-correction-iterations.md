# Reference Correction Iterations

- Activate this rule when `tasks/TASK-NNN/reference-ui/manifest.json` or reference validation evidence exists.
- Read the manifest first. For corrections, use only the latest validation iteration whose task ID, manifest version, and manifest digest match the current manifest and whose verdict is `FAIL`.
- Apply the Coder Direct-Entry Gate before treating a manifest as complete and reapply it if implementation or checks reveal an unresolved specialist prerequisite.
- Treat case IDs, region IDs, expected and actual observations, and correction targets as the correction boundary. Implement the smallest coherent production change and its essential behavior tests.
- Preserve every case in `passedCases` and every applicable axis already passing in compatible evidence. Include those cases in regression reasoning and applicable checks.
- Coder owns production code and essential tests. The manifest, reference baselines, staging files, and validation iterations are read-only inputs.
- Keep three recommendation classes mutually exclusive:
  - **Specialist prerequisite blocker:** For an unresolved UI, architecture, or API prerequisite found before implementation or becoming unresolved during implementation or checks, recommend only the owning UI Designer, Architect, or API Integration specialist as a prerequisite referral and STOP; omit every `flow-next` command. If work has started, report partial changes, checks already run with results, and the unfinished state.
  - **Implementation/check blocked:** For a non-specialist runtime, test, or tooling problem, report partial changes, evidence from checks already run, and the unfinished state. Recommend at most one appropriate command from the existing `flow-next` list, such as Debugger, and STOP; Browser Verify is not allowed for this outcome.
  - **Implementation completed:** Only after reference-aware implementation and essential tests are complete, report changed behavior and case IDs, recommend Browser Verify as the single next manual step, make no visual conformance verdict, and STOP.
