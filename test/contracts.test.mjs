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

test("review roles stay read-only and Reflect writes only approved project rules", async () => {
  for (const name of ["code-reviewer", "verify", "browser-verify"]) {
    const agent = await readFile(path.join(root, ".claude", "agents", `${name}.md`), "utf8");
    assert.doesNotMatch(agent.match(/^tools:.*$/m)?.[0] ?? "", /Write|Edit/);
    assert.match(agent, /read-only|without editing production code/i);
  }

  const reflectAgent = await readFile(path.join(root, ".claude", "agents", "reflect.md"), "utf8");
  const reflectSkill = await readFile(path.join(root, ".claude", "skills", "reflect", "SKILL.md"), "utf8");
  assert.match(reflectAgent, /Write\(rulesets\/project\/\*\*\)/);
  assert.doesNotMatch(reflectAgent.match(/^tools:.*$/m)?.[0] ?? "", /\.claude|\.agents|src\//);
  assert.match(reflectSkill, /Write only after explicit approval/);
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
