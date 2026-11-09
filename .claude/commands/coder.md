---
name: coder
spawns: coder
phase: execution
flow-next: [code-reviewer, test-generator, browser-verify, debugger, verify]
---

# Coder

Spawn the isolated `coder` agent for this frontend activity.

## Input

$ARGUMENTS

## Instructions

Use the Task tool with exactly:

- subagent_type: coder
- description: Own frontend production implementation and essential tests, consuming Reference UI contracts while preserving their artifacts and passed cases.
- prompt: $ARGUMENTS

Return the agent's result to the user. Do not perform the skill's work in this command wrapper and do not continue to another role.
