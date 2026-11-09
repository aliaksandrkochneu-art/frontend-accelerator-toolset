import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { listPayloadFiles } from "../lib/install.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const snapshotHashes = {
  "framework/shared/composition-patterns/rules/architecture-avoid-boolean-props.md": "bf497b4166c70efca0328558ff3b30cf16bccd94bdc321adf5fa690d759739cb",
  "framework/shared/composition-patterns/rules/architecture-compound-components.md": "dfad1d28de90868a8b8311a3974f5b89648a2a8208caa316ff63ead0b6194914",
  "framework/shared/composition-patterns/rules/patterns-children-over-render-props.md": "6e44da5931fcb09f2d631a462324035fb4d42d0a4ddbf4064ae1bddd2cbe387c",
  "framework/shared/composition-patterns/rules/patterns-explicit-variants.md": "b741d51cefc5bad25ae725a3e8791b47198cdb576aa5f34e609e13b4e910d2d9",
  "framework/shared/composition-patterns/rules/react19-no-forwardref.md": "10ab8f9b640133f371c327ebbdde0169d94fdf9684c6798f135d5f0f5efd2b21",
  "framework/shared/composition-patterns/rules/state-context-interface.md": "1d6923baa2726aa2fd8f3d75b7e820e895f89efc4c42d9f71cff229cbe21cb41",
  "framework/shared/composition-patterns/rules/state-decouple-implementation.md": "1b8757b07e62d869c4019f40cf75545516cc86386896b429090b2a54b13f301f",
  "framework/shared/composition-patterns/rules/state-lift-state.md": "2c70589fc7c8e2104269d1fda424f005daa470d38e1efe3feef32e0dd01d2ead",
  "framework/shared/react-best-practices/rules/async-defer-await.md": "55b6385f51071ce0d4ae86341233d530aca457b429fbbffdfc5aaa13fbc7d8db",
  "framework/shared/react-best-practices/rules/async-dependency-aware.md": "e1d16bd1143e8f2e80f2b74604b0f1a95858eaf89dfdeccbd994f17ced432301",
  "framework/shared/react-best-practices/rules/async-parallel.md": "f302235dc68734eee2fc967684ecdd8d235c356d08fe55a72efdb913a95b2798",
  "framework/shared/react-best-practices/rules/bundle-conditional-loading.md": "4f06ac53a70cd47403354c73f1b95780bec7e356a2faba1d074eb4d2c8b7266c",
  "framework/shared/react-best-practices/rules/bundle-intent-preload.md": "e165f7ed759e3844f48327b7be060586f4f67ba17712ccd9db42c1e407144ff6",
  "framework/shared/react-best-practices/rules/bundle-lazy-heavy-components.md": "01d086b446b4011dd4f3833ade310c8558463b4816393b7a73ffcd50bbf8e932",
  "framework/shared/react-best-practices/rules/bundle-third-party-direct-imports.md": "e6625873521c22e518479a198a038b03ee12f279b7167e706054a3386b67fb34",
  "framework/shared/react-best-practices/rules/client-event-listeners.md": "200c92aa031e652e531def45fc8170a38a9dcd4674085b4dde378bb0e62768ee",
  "framework/shared/react-best-practices/rules/js-combine-iterations.md": "7de6fab62f1f2e3d31bbf918cd902c34f52d36e7007c4380ab8f1d80e8df7244",
  "framework/shared/react-best-practices/rules/js-early-exit.md": "9bfd8657910a04099ec95969da02735d2cb700c4b1e8f9eb06aca0f62a24fe8a",
  "framework/shared/react-best-practices/rules/js-set-map-lookups.md": "a68e76b578cf6d6378bfe99675097425fa1307f2021a795a6d9e46cf5554416f",
  "framework/shared/react-best-practices/rules/js-tosorted-immutable.md": "36b4ecfb6f3c7546d94cf46e47f2db3d1fcf844100a53e72b8166721d17ae6a7",
  "framework/shared/react-best-practices/rules/rendering-conditional-render.md": "67671442099e0e5e4f1dbd561bac8c798fabf4ad1366d0340475908cabd91f72",
  "framework/shared/react-best-practices/rules/rendering-content-visibility.md": "acac9054ff6ee2adb7623d690c9f4b20d9e64c99aa09599cf913f86712c39db5",
  "framework/shared/react-best-practices/rules/rendering-hoist-static-work.md": "8ecf090645992172cf6961fa4edfc0034d6cb7662f69f6b1fcf674de12c7594d",
  "framework/shared/react-best-practices/rules/rerender-defer-reads.md": "93c17922c6ac015b188743a16247830921b43b51bb05566805f7cb0a4d6a812f",
  "framework/shared/react-best-practices/rules/rerender-derived-state.md": "ee7b72e58ef729803004908705d93981a61a31d093cbe8a0ee38dd24ce86bd64",
  "framework/shared/react-best-practices/rules/rerender-functional-setstate.md": "83db80ea9a71f167e0c1fbbfe1cb65769ca86b4daf3467bd3f34429d48cb525d",
  "framework/shared/react-best-practices/rules/rerender-lazy-state-init.md": "6a3b71f6c6ac10d491811e6e3165c86e2a6b147d09d7c539de2423df4bcc367b",
  "framework/shared/react-best-practices/rules/rerender-narrow-dependencies.md": "e98c3bed0ba07e9c27c0cf1c8cda7e96bb901caae50737daa685cd6ce27fec07",
  "framework/shared/react-best-practices/rules/rerender-transitions.md": "82b131074f49690f6e0f1b18bc34fcf8a6be263cca9571f1ec579d9001ea2ee9",
};

async function walkOptional(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walkOptional(fullPath)));
    if (entry.isFile()) files.push(fullPath);
  }
  return files.sort();
}

function markdownLinks(markdown) {
  return [...markdown.matchAll(/\[[^\]]+\]\(([^)]+\.md(?:#[^)]+)?)\)/g)].map((match) => match[1]);
}

async function validateRulesetReferences(rulesetsRoot) {
  for (const layer of ["common", "framework", "project"]) {
    const layerRoot = path.join(rulesetsRoot, layer);
    const indexes = (await walkOptional(layerRoot)).filter((file) => path.basename(file) === "INDEX.md");
    for (const index of indexes) {
      for (const reference of markdownLinks(await readFile(index, "utf8"))) {
        const target = path.resolve(path.dirname(index), reference.split("#", 1)[0]);
        if (!(target === layerRoot || target.startsWith(`${layerRoot}${path.sep}`))) {
          throw new Error(`${index}: reference escapes layer: ${target}`);
        }
        try {
          await readFile(target, "utf8");
        } catch (error) {
          if (error.code === "ENOENT") throw new Error(`${index}: missing reference: ${target}`);
          throw error;
        }
      }
    }
  }
}

async function createFixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "frontend rulesets "));
  t.after(() => rm(directory, { force: true, recursive: true }));
  return directory;
}

test("stable skills contain no React or donor-stack product policy", async () => {
  const files = await walkOptional(path.join(root, ".claude", "skills"));
  const banned = /\bReact\b|\bVite\b|TanStack|shadcn|src\/features|services\/api|ED small/i;
  for (const file of files.filter((candidate) => candidate.endsWith(".md"))) {
    assert.doesNotMatch(await readFile(file, "utf8"), banned, file);
  }
});

test("missing Framework and optional API sections are valid while arbitrary rule names resolve", async (t) => {
  const rulesetsRoot = await createFixture(t);
  const roleRoot = path.join(rulesetsRoot, "common", "coder");
  const arbitraryRule = path.join(roleRoot, "anything", "angular-team-rule.v7.md");
  await mkdir(path.dirname(arbitraryRule), { recursive: true });
  await writeFile(arbitraryRule, "# Example\n", "utf8");
  await writeFile(path.join(roleRoot, "INDEX.md"), "[Rule](./anything/angular-team-rule.v7.md)\n", "utf8");

  await assert.doesNotReject(validateRulesetReferences(rulesetsRoot));
});

test("a broken ruleset index reports the exact missing path", async (t) => {
  const rulesetsRoot = await createFixture(t);
  const roleRoot = path.join(rulesetsRoot, "project", "coder");
  const missing = path.join(roleRoot, "rules", "missing-project-rule.md");
  await mkdir(roleRoot, { recursive: true });
  await writeFile(path.join(roleRoot, "INDEX.md"), "[Missing](./rules/missing-project-rule.md)\n", "utf8");

  await assert.rejects(validateRulesetReferences(rulesetsRoot), (error) => {
    assert.equal(error.message, `${path.join(roleRoot, "INDEX.md")}: missing reference: ${missing}`);
    return true;
  });
});

test("vendored React and composition rule bodies retain pinned hashes", async () => {
  for (const [relativePath, expected] of Object.entries(snapshotHashes)) {
    let content = await readFile(path.join(root, "rulesets", relativePath));
    if (relativePath.startsWith("framework/shared/composition-patterns/")) {
      // The pinned local Vercel source used CRLF. Normalize only that collection so
      // Git checkout line-ending policy cannot invalidate otherwise identical content.
      content = Buffer.from(content.toString("utf8").replace(/\r?\n/g, "\r\n"));
    }
    assert.equal(createHash("sha256").update(content).digest("hex"), expected, relativePath);
  }
});

test("review roles stay read-only, Browser Verify is evidence-only, and Reflect writes only approved project rules", async () => {
  for (const name of ["code-reviewer", "verify"]) {
    const agent = await readFile(path.join(root, ".claude", "agents", `${name}.md`), "utf8");
    assert.doesNotMatch(agent.match(/^tools:.*$/m)?.[0] ?? "", /Write|Edit/);
    assert.match(agent, /read-only|without editing production code/i);
  }

  const browserAgent = await readFile(path.join(root, ".claude", "agents", "browser-verify.md"), "utf8");
  assert.equal(
    browserAgent.match(/^tools:.*$/m)?.[0],
    "tools: Read, Grep, Glob, Write(tasks/**), Edit(tasks/**), Bash",
  );
  assert.match(browserAgent, /only for reference evidence and drafts inside the selected `tasks\/TASK-NNN\/reference-ui\/\.staging\/<owned-session>\/`/i);
  assert.match(browserAgent, /production code, tests, configuration, fixtures, application data, the manifest, reference baselines, and previous validation iterations unchanged/i);

  const reflectAgent = await readFile(path.join(root, ".claude", "agents", "reflect.md"), "utf8");
  const reflectSkill = await readFile(path.join(root, ".claude", "skills", "reflect", "SKILL.md"), "utf8");
  assert.match(reflectAgent, /Write\(rulesets\/project\/\*\*\)/);
  assert.doesNotMatch(reflectAgent.match(/^tools:.*$/m)?.[0] ?? "", /\.claude|\.agents|src\//);
  assert.match(reflectSkill, /Write only after explicit approval/);
});

test("Docs Generator may narrowly edit verified durable terminology in CONTEXT.md", async () => {
  const agent = await readFile(path.join(root, ".claude", "agents", "docs-generator.md"), "utf8");
  const skill = await readFile(path.join(root, ".claude", "skills", "docs-generator", "SKILL.md"), "utf8");
  const command = await readFile(path.join(root, ".claude", "commands", "docs-generator.md"), "utf8");
  const tools = agent.match(/^tools:\s*(.*)$/m)?.[1]?.split(",").map((item) => item.trim());

  assert.deepEqual(tools, [
    "Read",
    "Grep",
    "Glob",
    "Write(specs/**)",
    "Edit(specs/**)",
    "Write(docs/**)",
    "Edit(docs/**)",
    "Edit(README.md)",
    "Edit(CONTEXT.md)",
  ]);
  assert.match(
    agent,
    /Edit `CONTEXT\.md` only when the verified task explicitly requires durable terminology/i,
  );
  assert.match(agent, /Do not use `CONTEXT\.md` for task history, unverified intent, or general root documentation/i);
  assert.match(agent, /Do not edit source, tests, commands, agents, skills, rulesets, dependencies, or arbitrary root files/i);

  assert.equal(agent.match(/^name:\s*(.*)$/m)?.[1], "docs-generator");
  assert.equal(agent.match(/^invokes:\s*(.*)$/m)?.[1], "docs-generator");
  assert.equal(agent.match(/^phase:\s*(.*)$/m)?.[1], "finalization");
  assert.equal(skill.match(/^flow-next:\s*(.*)$/m)?.[1], "[verify, finishing-branch]");
  assert.equal(command.match(/^flow-next:\s*(.*)$/m)?.[1], "[verify, finishing-branch]");
  assert.match(agent, /Never invoke the next command/);
  assert.match(agent, /\bSTOP\b/);
});

test("payload contains the portable Runtime Toolchain but no root instruction files", async () => {
  const files = await listPayloadFiles(root);
  assert.ok(files.includes("toolchain/manifest.json"));
  assert.ok(files.includes("toolchain/hooks/runtime-hook.mjs"));
  assert.ok(files.includes("toolchain/bin/agent-browser.mjs"));
  assert.ok(files.includes("toolchain/bin/ctx7.mjs"));
  assert.ok(files.includes("toolchain/bin/reference-ui.mjs"));
  assert.ok(files.includes("toolchain/schemas/reference-ui-manifest.schema.json"));
  assert.ok(files.includes("toolchain/schemas/reference-validation.schema.json"));
  assert.ok(files.includes(".claude/skills/ui-designer/templates/reference-ui-manifest.json"));
  assert.ok(files.includes(".claude/skills/browser-verify/templates/reference-validation.json"));
  assert.ok(!files.includes(".claude/commands/reference-ui.md"));
  assert.ok(files.every((file) => file !== "AGENTS.md" && file !== "CLAUDE.md"));
});

test("tool-using skills name only project-owned Runtime Toolchain adapters", async () => {
  const browser = await readFile(path.join(root, ".claude", "skills", "browser-verify", "SKILL.md"), "utf8");
  assert.match(browser, /toolchain\/bin\/agent-browser\.mjs/);
  assert.match(browser, /toolchain\/bin\/doctor\.mjs/);
  assert.match(browser, /never fall back to a global `agent-browser`/i);

  for (const name of ["api-integration", "architect", "coder", "debugger", "test-generator"]) {
    const skill = await readFile(path.join(root, ".claude", "skills", name, "SKILL.md"), "utf8");
    assert.match(skill, /toolchain\/bin\/ctx7\.mjs/, name);
    assert.match(skill, /Never use a global `ctx7`/, name);
  }
});

test("the Reference UI helper is artifact-only and cannot become a hidden runtime orchestrator", async () => {
  const files = [
    "toolchain/bin/reference-ui.mjs",
    "toolchain/lib/reference-ui-contract.mjs",
    "toolchain/lib/reference-ui-evidence.mjs",
  ];
  for (const relative of files) {
    const source = await readFile(path.join(root, relative), "utf8");
    assert.doesNotMatch(source, /node:child_process|executeManagedCapability|runProcess|browser-adapter|doctor\.mjs/, relative);
  }
});

test("browser verification cannot mistake an adapter probe or sandboxed CDP failure for a launch verdict", async () => {
  const browser = await readFile(path.join(root, ".claude", "skills", "browser-verify", "SKILL.md"), "utf8");

  assert.match(browser, /project Doctor is the only browser-readiness gate/i);
  assert.match(browser, /Do not run the browser adapter's `doctor` command as a readiness or launch check/i);
  assert.match(browser, /first browser-adapter command[^.]+must be `open <actual URL>`/i);
  assert.match(browser, /Do not substitute the adapter's `doctor`, `get url`, or `snapshot` commands/i);
  assert.match(browser, /CDP connection, or response-channel-closed error[^.]+retry `open` once/i);
  assert.match(browser, /Return `BLOCKED` only if that approved retry also fails or the approval is denied/i);
});

test("Browser Verify reference mode preserves evidence-only authority and manual four-state outcomes", async () => {
  const read = (relative) => readFile(path.join(root, relative), "utf8");
  const skill = await read(".claude/skills/browser-verify/SKILL.md");
  const agent = await read(".claude/agents/browser-verify.md");
  const command = await read(".claude/commands/browser-verify.md");

  assert.match(skill, /Reference Mode[^]*only when the request explicitly identifies a Reference UI manifest or explicitly asks for reference verification/i);
  assert.match(skill, /Otherwise use \*\*Ordinary Mode\*\* exactly as before/i);
  assert.match(skill, /do not discover, create, or infer a reference surface/i);
  assert.match(skill, /## Ordinary Mode[\s\S]*Exercise requested primary and recovery paths[\s\S]*console[\s\S]*network requests/i);

  const referenceMode = skill.slice(skill.indexOf("## Reference Mode"), skill.indexOf("## Reference Evidence Authority"));
  for (const expected of [
    "project Doctor",
    "validate-manifest",
    "exact application URL",
    ".staging/<owned-session>/",
    "open <exact application URL>",
    "declared viewport",
    "setup and interaction",
    "structure, semantics, interactions, focus, keyboard behavior, and accessibility",
    "whole surface and every named region",
    "diff screenshot",
    "console, page-error, network",
    "finalize-validation",
    "Close only the owned adapter session",
  ]) {
    assert.match(referenceMode, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), expected);
  }
  assert.ok(referenceMode.indexOf("project Doctor") < referenceMode.indexOf("validate-manifest"));
  assert.ok(referenceMode.indexOf("validate-manifest") < referenceMode.indexOf("open <exact application URL>"));
  assert.ok(referenceMode.indexOf("open <exact application URL>") < referenceMode.indexOf("declared viewport"));
  assert.ok(referenceMode.indexOf("diff screenshot") < referenceMode.indexOf("finalize-validation"));
  assert.match(skill, /Never write `validation\/iteration-NNN\/\*\*` directly/i);
  assert.match(skill, /finalizer is the only writer of a new `validation\/iteration-NNN\/`/i);
  assert.match(skill, /manifest, `references\/` baselines, every previous validation iteration, production code, tests, configuration, fixtures, and application data are read-only/i);
  assert.match(skill, /`match=true` and `differentPixels=0`[\s\S]*deterministic machine-readable zero-diff JSON report/i);
  assert.match(skill, /same case or region scope[\s\S]*required `diff` or `region-diff` artifact/i);
  assert.match(skill, /Never copy the baseline or current screenshot and label that copy as a pixel diff/i);
  assert.match(skill, /missing when `differentPixels > 0` or a dimension mismatch is reported[\s\S]*iteration, case, region, output path, and full measurement/i);
  assert.match(skill, /Stop before finalization[\s\S]*generic finalizer failure/i);

  for (const verdict of ["BLOCKED", "FAIL", "PASS", "NOT-APPLICABLE"]) {
    assert.match(skill, new RegExp("- `" + verdict + "` means", "i"));
  }
  assert.match(skill, /On `PASS`, recommend Verify as the only next manual step/i);
  assert.match(skill, /On `FAIL` caused by an implementation mismatch, recommend Coder/i);
  assert.match(skill, /On `FAIL` caused by a proven application\/runtime defect, recommend Debugger/i);
  assert.match(skill, /On `BLOCKED` or `NOT-APPLICABLE`, make no `flow-next` recommendation/i);
  assert.match(skill, /Neither verdict is `PASS` or ready for Verify/i);
  assert.match(skill, /Never launch the recommended role[\s\S]*applicable single recommendation, STOP/i);

  assert.match(agent, /four verdicts/i);
  assert.match(agent, /`PASS` → recommend Verify as the only next manual step/i);
  assert.match(agent, /`FAIL` from an implementation mismatch → recommend Coder/i);
  assert.match(agent, /`FAIL` from a proven application\/runtime defect → recommend Debugger/i);
  assert.match(agent, /`BLOCKED` or `NOT-APPLICABLE` → make no `flow-next` recommendation/i);
  assert.match(agent, /do not present the task as passed or ready for Verify/i);
  assert.match(agent, /Never invoke the recommended role[\s\S]*applicable single recommendation, STOP/i);
  assert.match(agent, /STOP/);

  const expectedTransitions = "[coder, debugger, verify]";
  assert.equal(skill.match(/^name:\s*(.*)$/m)?.[1], "browser-verify");
  assert.equal(skill.match(/^phase:\s*(.*)$/m)?.[1], "quality");
  assert.equal(skill.match(/^flow-next:\s*(.*)$/m)?.[1], expectedTransitions);
  assert.equal(command.match(/^name:\s*(.*)$/m)?.[1], "browser-verify");
  assert.equal(command.match(/^spawns:\s*(.*)$/m)?.[1], "browser-verify");
  assert.equal(command.match(/^phase:\s*(.*)$/m)?.[1], "quality");
  assert.equal(command.match(/^flow-next:\s*(.*)$/m)?.[1], expectedTransitions);
  assert.match(command, /do not continue to another role/i);
});

test("Browser Verify maps reference PASS only to a manual Verify handoff", async () => {
  const skill = await readFile(path.join(root, ".claude", "skills", "browser-verify", "SKILL.md"), "utf8");
  const agent = await readFile(path.join(root, ".claude", "agents", "browser-verify.md"), "utf8");

  for (const contract of [skill, agent]) {
    assert.match(contract, /PASS[^\n]*Verify as the only next manual step/i);
    assert.match(contract, /BLOCKED[^\n]*NOT-APPLICABLE[^\n]*no `flow-next` recommendation/i);
    assert.match(contract, /(?:Never launch|Never invoke) the recommended role/i);
    assert.match(contract, /STOP/);
  }

  assert.equal(skill.match(/^flow-next:\s*(.*)$/m)?.[1], "[coder, debugger, verify]");
  assert.equal(
    agent.match(/^tools:.*$/m)?.[0],
    "tools: Read, Grep, Glob, Write(tasks/**), Edit(tasks/**), Bash",
  );
});

test("Verify keeps project-check verdict separate from reference finalization readiness", async () => {
  const read = (relative) => readFile(path.join(root, relative), "utf8");
  const skill = await read(".claude/skills/verify/SKILL.md");
  const template = await read(".claude/skills/verify/templates/verification.md");
  const agent = await read(".claude/agents/verify.md");
  const command = await read(".claude/commands/verify.md");

  assert.match(skill, /latest validation iteration whose task ID, manifest version, and manifest digest match that manifest/i);
  assert.match(skill, /compatible iteration, evidence path, and Browser Verify verdict as read-only observations/i);
  assert.match(skill, /does not capture screenshots, run screenshot diff, recalculate similarity or mismatch measurements/i);
  assert.match(skill, /does not replace Browser Verify/i);
  assert.match(skill, /Never create or modify the manifest, baselines, staging files, or Reference Validation evidence/i);
  assert.match(skill, /project-check verdict is based only on applicable existing project checks/i);
  assert.match(
    skill,
    /`READY` only when the latest compatible Browser Verify verdict is `PASS` and the Verify project-check verdict is `PASS`/i,
  );
  assert.match(skill, /`NOT READY` in every other combination[\s\S]*List each unmet condition explicitly/i);
  assert.match(skill, /Project-check success never becomes or implies reference `PASS`/i);

  assert.match(template, /## Project Checks And Results/);
  assert.match(template, /## Project-Check Verdict/);
  assert.match(template, /## Reference Finalization Readiness/);
  assert.match(template, /Latest compatible Browser Verify iteration/);
  assert.match(template, /Recorded Browser Verify verdict/);
  assert.match(template, /Finalization readiness: READY \| NOT READY \| NOT-APPLICABLE/);
  assert.match(template, /Unmet conditions/);

  assert.equal(agent.match(/^tools:.*$/m)?.[0], "tools: Read, Grep, Glob, Bash");
  assert.match(agent, /Base Verify's own verdict only on applicable existing project checks/i);
  assert.match(agent, /both `PASS`[\s\S]*otherwise report each unmet condition/i);
  assert.match(agent, /Do not capture screenshots, run screenshot diff, recalculate similarity, or issue a visual conformance verdict/i);
  assert.match(agent, /Never convert successful lint, typecheck, test, or build results into reference `PASS`/i);

  const expectedTransitions = "[coder, debugger, test-generator, browser-verify, docs-generator, finishing-branch]";
  assert.equal(skill.match(/^name:\s*(.*)$/m)?.[1], "verify");
  assert.equal(skill.match(/^phase:\s*(.*)$/m)?.[1], "quality");
  assert.equal(skill.match(/^flow-next:\s*(.*)$/m)?.[1], expectedTransitions);
  assert.equal(command.match(/^name:\s*(.*)$/m)?.[1], "verify");
  assert.equal(command.match(/^spawns:\s*(.*)$/m)?.[1], "verify");
  assert.equal(command.match(/^phase:\s*(.*)$/m)?.[1], "quality");
  assert.equal(command.match(/^flow-next:\s*(.*)$/m)?.[1], expectedTransitions);
  assert.match(command, /do not continue to another role/i);
});

test("reference-aware planning and coding roles preserve manual authority boundaries", async () => {
  const read = (relative) => readFile(path.join(root, relative), "utf8");
  const uiSkill = await read(".claude/skills/ui-designer/SKILL.md");
  const uiAgent = await read(".claude/agents/ui-designer.md");
  const uiTemplate = await read(".claude/skills/ui-designer/templates/task-ui-design.md");
  assert.match(uiSkill, /tasks\/TASK-NNN\/reference-ui\/manifest\.json/);
  assert.match(uiSkill, /observed reference facts from inferred behavior/i);
  assert.match(uiSkill, /unambiguous reference as the selected direction/i);
  assert.match(uiSkill, /allowed deviations/i);
  assert.match(uiSkill, /increment `manifestVersion`/);
  assert.match(uiSkill, /leave production UI and tests unchanged/i);
  assert.match(uiAgent.match(/^tools:.*$/m)?.[0] ?? "", /Write\(tasks\/TASK-\*\/reference-ui\/manifest\.json\)/);
  assert.doesNotMatch(uiAgent.match(/^tools:.*$/m)?.[0] ?? "", /(?:Write|Edit)\(tasks\/\*\*\)/);
  assert.match(uiAgent, /manifest only at `tasks\/TASK-NNN\/reference-ui\/manifest\.json`/i);
  assert.match(uiTemplate, /## Observed Reference Facts/);
  assert.match(uiTemplate, /## Inferred Behavior/);

  const planningSkill = await read(".claude/skills/writing-plans/SKILL.md");
  const planningAgent = await read(".claude/agents/writing-plans.md");
  const planningTemplate = await read(".claude/skills/writing-plans/templates/implementation-plan.md");
  assert.match(planningSkill, /every case ID, target, state, viewport, regions, interactions, acceptance criteria/i);
  assert.match(planningSkill, /do not re-analyze images/i);
  assert.match(planningSkill, /essential behavior tests/i);
  assert.match(planningSkill, /previously passed reference cases/i);
  assert.match(planningSkill, /explicit manual Browser Verify handoff/i);
  assert.match(planningAgent.match(/^tools:.*$/m)?.[0] ?? "", /Write\(tasks\/TASK-\*\/implementation-plan\.md\)/);
  assert.doesNotMatch(planningAgent.match(/^tools:.*$/m)?.[0] ?? "", /reference-ui|Write\(tasks\/\*\*\)/);
  assert.match(planningTemplate, /\| Case ID \| Target \| State \| Viewport \|/);
  assert.match(planningTemplate, /## Manual Browser Verify Handoff/);

  const coderSkill = await read(".claude/skills/coder/SKILL.md");
  const coderAgent = await read(".claude/agents/coder.md");
  assert.match(coderSkill, /latest compatible failed validation evidence/i);
  assert.match(coderSkill, /complete Reference UI Contract may enter directly at Coder/i);
  assert.match(coderSkill, /`passedCases`/);
  assert.match(coderSkill, /production-code owner/i);
  assert.match(coderSkill, /manifest, reference baselines, staging artifacts, and validation evidence unchanged/i);
  assert.match(coderSkill, /for completed reference-aware implementation, recommend Browser Verify/i);
  assert.match(coderSkill, /never issue the Browser Verify reference verdict/i);
  assert.match(coderAgent, /preserve previously passed reference cases/i);
  assert.match(coderAgent, /manifest\.json`, baselines, staging, and validation evidence unchanged/i);

  for (const name of ["ui-designer", "writing-plans", "coder"]) {
    const agent = await read(`.claude/agents/${name}.md`);
    const command = await read(`.claude/commands/${name}.md`);
    assert.match(agent, /Never invoke the next command/);
    assert.match(agent, /\bSTOP\b/);
    assert.match(command, /do not continue to another role/i);
  }
});

test("Coder direct entry refers blocking prerequisites to the owning specialist without changing transitions", async () => {
  const coderSkill = await readFile(path.join(root, ".claude", "skills", "coder", "SKILL.md"), "utf8");
  const coderAgent = await readFile(path.join(root, ".claude", "agents", "coder.md"), "utf8");
  const coderCommand = await readFile(path.join(root, ".claude", "commands", "coder.md"), "utf8");

  assert.match(
    coderSkill,
    /unresolved UI direction, reference interpretation, required state, viewport, or acceptance criteria to UI Designer/i,
  );
  assert.match(
    coderSkill,
    /unresolved architecture, dependency choice, or data ownership to Architect/i,
  );
  assert.match(
    coderSkill,
    /unresolved API contract, authentication behavior, or data integration to API Integration/i,
  );
  assert.match(coderSkill, /blocking prerequisite referral, not a new `flow-next` transition/i);
  assert.match(coderSkill, /Recommend the owning specialist without launching it, then STOP/i);
  assert.match(coderAgent, /owning UI Designer, Architect, or API Integration specialist/i);
  assert.match(
    coderAgent,
    /prerequisite referral, omit every `flow-next` command, and STOP/i,
  );
  assert.match(coderAgent, /never launch the referred specialist/i);

  const expectedTransitions = "[code-reviewer, test-generator, browser-verify, debugger, verify]";
  assert.equal(coderSkill.match(/^flow-next:\s*(.*)$/m)?.[1], expectedTransitions);
  assert.equal(coderCommand.match(/^flow-next:\s*(.*)$/m)?.[1], expectedTransitions);
  for (const frontmatter of [
    coderSkill.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "",
    coderCommand.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "",
  ]) {
    assert.doesNotMatch(frontmatter, /ui-designer|architect|api-integration/);
  }
});

test("Coder separates specialist prerequisite referrals from completed implementation flow-next", async () => {
  const coderSkill = await readFile(path.join(root, ".claude", "skills", "coder", "SKILL.md"), "utf8");
  const coderAgent = await readFile(path.join(root, ".claude", "agents", "coder.md"), "utf8");
  const commonRule = await readFile(
    path.join(root, "rulesets", "common", "coder", "rules", "reference-correction-iterations.md"),
    "utf8",
  );

  assert.match(coderSkill, /Return exactly one of three mutually exclusive outcomes/);
  assert.match(
    coderSkill,
    /Specialist prerequisite blocker:[\s\S]*before implementation or becomes unresolved during implementation or checks[\s\S]*only the owning UI Designer, Architect, or API Integration specialist[\s\S]*Omit every `flow-next` command[\s\S]*STOP/i,
  );
  assert.match(coderSkill, /work has started[\s\S]*partial changes[\s\S]*checks already run with results[\s\S]*unfinished state/i);
  assert.match(
    coderSkill,
    /Implementation completed:[\s\S]*Recommend at most one command from the existing `flow-next` list[\s\S]*completed reference-aware implementation, recommend Browser Verify/i,
  );
  assert.match(coderSkill, /Select exactly one outcome/);
  assert.match(
    coderSkill,
    /specialist prerequisite is unresolved before implementation or becomes unresolved during implementation or checks[\s\S]*Specialist prerequisite blocker[\s\S]*only its prerequisite referral and STOP/i,
  );
  assert.match(
    coderSkill,
    /Only if implementation and essential tests are complete[\s\S]*Implementation completed[\s\S]*at most one allowed `flow-next` command[\s\S]*Browser Verify for completed reference-aware implementation/i,
  );

  assert.match(coderAgent, /Return exactly one of three next-step outcomes/);
  assert.match(coderAgent, /Specialist prerequisite blocker:[\s\S]*only the owning UI Designer, Architect, or API Integration specialist[\s\S]*omit every `flow-next` command[\s\S]*STOP/i);
  assert.match(coderAgent, /Specialist prerequisite blocker:[\s\S]*work has started[\s\S]*partial changes[\s\S]*checks already run with results[\s\S]*unfinished state/i);
  assert.match(coderAgent, /Implementation completed:[\s\S]*at most one existing `flow-next` command[\s\S]*Browser Verify for completed reference-aware implementation/i);
  assert.match(coderAgent, /Browser Verify only after reference-aware implementation completes/i);

  assert.match(commonRule, /reapply it if implementation or checks reveal an unresolved specialist prerequisite/i);
  assert.match(commonRule, /three recommendation classes mutually exclusive/i);
  assert.match(
    commonRule,
    /Specialist prerequisite blocker:[\s\S]*before implementation or becoming unresolved during implementation or checks[\s\S]*only the owning UI Designer, Architect, or API Integration specialist[\s\S]*omit every `flow-next` command/i,
  );
  assert.match(commonRule, /work has started[\s\S]*partial changes[\s\S]*checks already run with results[\s\S]*unfinished state/i);
  assert.match(
    commonRule,
    /Only after reference-aware implementation and essential tests are complete[\s\S]*recommend Browser Verify as the single next manual step/i,
  );

  const expectedTransitions = "[code-reviewer, test-generator, browser-verify, debugger, verify]";
  assert.equal(coderSkill.match(/^flow-next:\s*(.*)$/m)?.[1], expectedTransitions);
});

test("Coder keeps ordinary implementation and check blockers on an existing non-browser flow-next", async () => {
  const coderSkill = await readFile(path.join(root, ".claude", "skills", "coder", "SKILL.md"), "utf8");
  const coderAgent = await readFile(path.join(root, ".claude", "agents", "coder.md"), "utf8");
  const commonRule = await readFile(
    path.join(root, "rulesets", "common", "coder", "rules", "reference-correction-iterations.md"),
    "utf8",
  );

  for (const contract of [coderSkill, coderAgent, commonRule]) {
    assert.match(
      contract,
      /Implementation\/check blocked:[\s\S]*runtime, test, or tooling problem[\s\S]*partial changes[\s\S]*(?:evidence from )?checks already run[\s\S]*unfinished state/i,
    );
    assert.match(
      contract,
      /Implementation\/check blocked:[\s\S]*at most one appropriate (?:command from the )?existing `flow-next`[\s\S]*Debugger/i,
    );
    assert.match(
      contract,
      /Implementation\/check blocked:[\s\S]*Browser Verify is not allowed for this outcome/i,
    );
  }

  assert.match(coderAgent, /never convert them into specialist referrals/i);

  const expectedTransitions = "[code-reviewer, test-generator, browser-verify, debugger, verify]";
  assert.equal(coderSkill.match(/^flow-next:\s*(.*)$/m)?.[1], expectedTransitions);
});

test("explicit reference UI live coverage is isolated and uses only project-owned browser entrypoints", async () => {
  const liveTest = await readFile(path.join(root, "test", "live", "reference-ui.live.mjs"), "utf8");
  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));

  assert.equal(packageJson.scripts.test, "node --test \"test/*.test.mjs\"");
  assert.equal(packageJson.scripts["test:reference-ui-live"], "node ./test/live/reference-ui.live.mjs");
  assert.ok(liveTest.includes('"toolchain", "bin", "doctor.mjs"'));
  assert.ok(liveTest.includes('"toolchain", "bin", "agent-browser.mjs"'));
  assert.doesNotMatch(liveTest, /playwright|puppeteer|npx|agent-browser install|update-baseline/i);
  assert.doesNotMatch(packageJson.scripts.test, /reference-ui-live|server|browser/i);
  assert.doesNotMatch(packageJson.scripts.test, /test\/live|test\/fixtures/i);
});
