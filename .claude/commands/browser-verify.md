---
name: browser-verify
spawns: browser-verify
phase: quality
flow-next: [coder, debugger, verify]
---

# Browser Verify

Spawn the existing isolated `browser-verify` agent for ordinary browser verification or explicitly requested task-scoped Reference UI verification.

## Input

$ARGUMENTS

## Instructions

Use the Task tool with exactly:

- subagent_type: browser-verify
- description: Verify rendered frontend behavior and explicitly requested Reference UI conformance, writing only task-scoped reference evidence and drafts without editing production code.
- prompt: $ARGUMENTS

Return the agent's result to the user. Do not perform the skill's work in this command wrapper and do not continue to another role.
