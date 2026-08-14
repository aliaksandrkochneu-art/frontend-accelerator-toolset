import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  collectMirrorDifferences,
  generateAgentToml,
  parseAgent,
  syncAgents,
} from "../scripts/sync-agents.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const referenceAwareRoles = ["ui-designer", "writing-plans", "coder", "browser-verify", "verify"];

function generatedAgentSection(toml, name) {
  const header = `[agents.${name}]`;
  const start = toml.indexOf(header);
  assert.notEqual(start, -1, `missing generated agent: ${name}`);
  const next = toml.indexOf("\n[agents.", start + header.length);
  return toml.slice(start, next === -1 ? undefined : next);
}

function generatedReadOnly(section, name) {
  const match = section.match(/^read_only = (true|false)$/m);
  assert.ok(match, `missing read_only for generated agent: ${name}`);
  return match[1] === "true";
}

test("the committed Codex mirror is current and contains all canonical agents", async () => {
  assert.deepEqual(await collectMirrorDifferences(root), []);
  const toml = await readFile(path.join(root, ".agents", "codex-agents.toml"), "utf8");
  const names = [...toml.matchAll(/^\[agents\.([^\]]+)\]$/gm)].map((match) => match[1]);
  assert.equal(names.length, 18);
  assert.ok(names.includes("coder"));
  assert.ok(names.includes("architect"));
  assert.ok(names.includes("browser-verify"));
  assert.match(toml, /Maintainers regenerate with: npm run sync:agents/);
});

test("mirror generation is deterministic", async () => {
  assert.equal(await generateAgentToml(root), await generateAgentToml(root));
});

test("reference-aware skills and agents preserve canonical semantics and STOP boundaries", async () => {
  const toml = await readFile(path.join(root, ".agents", "codex-agents.toml"), "utf8");

  for (const name of referenceAwareRoles) {
    const canonicalSkill = await readFile(path.join(root, ".claude", "skills", name, "SKILL.md"), "utf8");
    const mirroredSkill = await readFile(path.join(root, ".agents", "skills", name, "SKILL.md"), "utf8");
    const canonicalAgent = parseAgent(
      await readFile(path.join(root, ".claude", "agents", `${name}.md`), "utf8"),
      `${name}.md`,
    );
    const generatedAgent = generatedAgentSection(toml, name);

    assert.equal(mirroredSkill, canonicalSkill, `${name}: skill mirror diverged from canonical policy`);
    assert.ok(generatedAgent.includes(canonicalAgent.body), `${name}: generated agent lost canonical instructions`);
    assert.match(mirroredSkill, /Reference UI|reference-ui/i, `${name}: Reference UI Contract is absent`);
    assert.match(generatedAgent, /Reference UI|Reference Validation|reference-ui/i, `${name}: generated agent is not reference-aware`);
    assert.match(mirroredSkill, /## Stop Contract[\s\S]*\bSTOP\b/);
    assert.match(generatedAgent, /\bSTOP\b[\s\S]*Never invoke/i);
  }
});

test("generated reference-aware roles preserve their authority boundaries", async () => {
  const toml = await readFile(path.join(root, ".agents", "codex-agents.toml"), "utf8");
  const uiDesigner = generatedAgentSection(toml, "ui-designer");
  const writingPlans = generatedAgentSection(toml, "writing-plans");
  const coder = generatedAgentSection(toml, "coder");
  const browserVerify = generatedAgentSection(toml, "browser-verify");
  const verify = generatedAgentSection(toml, "verify");
  const codeReviewer = generatedAgentSection(toml, "code-reviewer");

  assert.match(uiDesigner, /planning-only[\s\S]*tasks\/TASK-NNN\/reference-ui\/manifest\.json/i);
  assert.match(uiDesigner, /keep production UI and tests unchanged/i);
  assert.match(writingPlans, /manifest as authoritative contract data/i);
  assert.match(writingPlans, /without re-analyzing its images/i);
  assert.match(writingPlans, /Leave production code, manifest, baselines, and validation evidence unchanged/i);
  assert.match(coder, /production implementation[\s\S]*compatible failed evidence/i);
  assert.match(coder, /manifest\.json`, baselines, staging, and validation evidence unchanged/i);

  assert.equal(generatedReadOnly(browserVerify, "browser-verify"), false);
  assert.match(browserVerify, /Write\/Edit only for reference evidence and drafts inside the selected `tasks\/TASK-NNN\/reference-ui\/\.staging\/<owned-session>\/`/i);
  assert.match(browserVerify, /finalizer as the sole writer of a new append-only validation iteration/i);
  assert.match(browserVerify, /Keep production code, tests, configuration, fixtures, application data, the manifest, reference baselines, and previous validation iterations unchanged/i);

  assert.equal(generatedReadOnly(verify, "verify"), true);
  assert.match(verify, /manifest, baselines, staging, and Reference Validation evidence as read-only/i);
  assert.equal(generatedReadOnly(codeReviewer, "code-reviewer"), true);
  assert.match(codeReviewer, /read-only frontend reviewer/i);
});

test("generated Docs Generator preserves narrow CONTEXT.md authority and docs-only boundaries", async () => {
  const canonical = parseAgent(
    await readFile(path.join(root, ".claude", "agents", "docs-generator.md"), "utf8"),
    "docs-generator.md",
  );
  const generated = generatedAgentSection(
    await readFile(path.join(root, ".agents", "codex-agents.toml"), "utf8"),
    "docs-generator",
  );

  assert.ok(generated.includes(canonical.body));
  assert.match(
    generated,
    /# canonical tools scope: Read, Grep, Glob, Write\(specs\/\*\*\), Edit\(specs\/\*\*\), Write\(docs\/\*\*\), Edit\(docs\/\*\*\), Edit\(README\.md\), Edit\(CONTEXT\.md\)/,
  );
  assert.equal(generatedReadOnly(generated, "docs-generator"), false);
  assert.match(generated, /verified task explicitly requires durable terminology/i);
  assert.match(generated, /Do not edit source, tests, commands, agents, skills, rulesets, dependencies, or arbitrary root files/i);
  assert.match(generated, /Never invoke the next command[\s\S]*STOP/i);
});

test("check mode detects stale skill and agent mirrors without repairing them", async (context) => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "frontend accelerator mirror "));
  context.after(() => rm(temporaryRoot, { force: true, recursive: true }));

  const skillDirectory = path.join(temporaryRoot, ".claude", "skills", "demo");
  const agentDirectory = path.join(temporaryRoot, ".claude", "agents");
  await mkdir(skillDirectory, { recursive: true });
  await mkdir(agentDirectory, { recursive: true });
  await writeFile(path.join(skillDirectory, "SKILL.md"), "# Demo\n", "utf8");
  await writeFile(
    path.join(agentDirectory, "demo.md"),
    [
      "---",
      "name: demo",
      'description: "Demo agent"',
      "tools: Read",
      "invokes: demo",
      "---",
      "",
      "Invoke demo and STOP.",
      "",
    ].join("\n"),
    "utf8",
  );

  await syncAgents(temporaryRoot);
  await syncAgents(temporaryRoot, { check: true });

  const mirroredSkill = path.join(temporaryRoot, ".agents", "skills", "demo", "SKILL.md");
  await writeFile(mirroredSkill, "# Stale\n", "utf8");
  await assert.rejects(syncAgents(temporaryRoot, { check: true }), /stale mirror skill file/);
  assert.equal(await readFile(mirroredSkill, "utf8"), "# Stale\n");

  await syncAgents(temporaryRoot);
  await writeFile(path.join(temporaryRoot, ".agents", "codex-agents.toml"), "stale\n", "utf8");
  await assert.rejects(syncAgents(temporaryRoot, { check: true }), /stale Codex agent TOML/);
});
