---
name: verify
spawns: verify
phase: quality
flow-next: [coder, debugger, test-generator, browser-verify, docs-generator, finishing-branch]
---

# Verify

Spawn the existing isolated `verify` agent to run project checks and separately report read-only reference finalization readiness when applicable.

## Input

$ARGUMENTS

## Instructions

Use the Task tool with exactly:

- subagent_type: verify
- description: Run existing project checks and separately report read-only reference finalization readiness without replacing Browser Verify or issuing visual conformance.
- prompt: $ARGUMENTS

Return the agent's result to the user. Do not perform the skill's work in this command wrapper and do not continue to another role.
