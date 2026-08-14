import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rulesetsRoot = path.join(root, "rulesets");

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(fullPath)));
    if (entry.isFile()) files.push(fullPath);
  }
  return files.sort();
}

function layerRootFor(file) {
  for (const layer of ["common", "framework", "project"]) {
    const candidate = path.join(rulesetsRoot, layer);
    if (file === candidate || file.startsWith(`${candidate}${path.sep}`)) return candidate;
  }
  throw new Error(`No ruleset layer for ${file}`);
}

function markdownLinks(markdown) {
  return [...markdown.matchAll(/\[[^\]]+\]\(([^)]+\.md(?:#[^)]+)?)\)/g)].map((match) => match[1]);
}

async function sha256(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

async function createFixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "reference rulesets "));
  t.after(() => rm(directory, { force: true, recursive: true }));
  return directory;
}

test("all ruleset index references exist and stay inside their layer", async () => {
  const indexes = (await walk(rulesetsRoot)).filter((file) => path.basename(file) === "INDEX.md");
  assert.ok(indexes.length >= 13, "expected bundled Common and Framework indexes");

  for (const index of indexes) {
    const layerRoot = layerRootFor(index);
    for (const reference of markdownLinks(await readFile(index, "utf8"))) {
      const filePart = reference.split("#", 1)[0];
      const target = path.resolve(path.dirname(index), filePart);
      assert.ok(target.startsWith(`${layerRoot}${path.sep}`), `${index}: reference escapes layer: ${reference}`);
      await assert.doesNotReject(readFile(target, "utf8"), `${index}: missing reference ${reference}`);
    }
  }
});

test("the pinned Web Interface Guidelines snapshot is offline and source documented", async () => {
  const directory = path.join(rulesetsRoot, "common", "shared", "web-interface-guidelines");
  const source = await readFile(path.join(directory, "SOURCE.md"), "utf8");
  assert.match(source, /4e799d45c17aec1498c269287a83b9dba22b966b/);
  assert.match(source, /License: MIT/);
  assert.equal(await sha256(path.join(directory, "command.md")), "eea73cb6dd46fee9faec9973e8e7fe198b5f07ec326f14d276a56e50287e1cab");
  assert.equal(await sha256(path.join(directory, "LICENSE")), "6cd1609c9c12233507cdd2ce0d32e9a721e3c27494951be06b90090deeeb7af2");

  for (const section of ["ui-designer", "coder", "code-reviewer", "browser-verify"]) {
    const index = await readFile(path.join(rulesetsRoot, "common", section, "INDEX.md"), "utf8");
    assert.match(index, /shared\/web-interface-guidelines\/command\.md/);
  }
});

test("the React snapshot contains 21 portable donor files and excludes the stack-bound rule", async () => {
  const directory = path.join(rulesetsRoot, "framework", "shared", "react-best-practices");
  const ruleFiles = (await readdir(path.join(directory, "rules"))).filter((file) => file.endsWith(".md")).sort();
  assert.equal(ruleFiles.length, 21);
  assert.ok(!ruleFiles.includes("client-tanstack-query-dedup.md"));

  const source = await readFile(path.join(directory, "SOURCE.md"), "utf8");
  assert.match(source, /9b02938281271fb98b97ef8447281b38ab5dd490/);
  assert.match(source, /Local modifications to selected files: none/);
  assert.match(source, /client-tanstack-query-dedup\.md/);

  const forbidden = /TanStack Query|services\/api|src\/features|src\/shared|ED small|shadcn\/Tailwind|project-profile/i;
  for (const file of ruleFiles) {
    assert.doesNotMatch(await readFile(path.join(directory, "rules", file), "utf8"), forbidden, `${file} is stack-bound`);
  }
});

test("composition rules come from the clean source and keep version gating explicit", async () => {
  const directory = path.join(rulesetsRoot, "framework", "shared", "composition-patterns");
  const ruleFiles = (await readdir(path.join(directory, "rules"))).filter((file) => file.endsWith(".md")).sort();
  assert.equal(ruleFiles.length, 8);
  const combined = await Promise.all(ruleFiles.map((file) => readFile(path.join(directory, "rules", file), "utf8")));
  assert.doesNotMatch(combined.join("\n"), /Accelerator Checks/);

  const source = await readFile(path.join(directory, "SOURCE.md"), "utf8");
  assert.match(source, /Version: `1\.0\.0`/);
  assert.match(source, /Declared license: MIT/);
  const architectIndex = await readFile(path.join(rulesetsRoot, "framework", "architect", "INDEX.md"), "utf8");
  assert.match(architectIndex, /React 19 or later only/);
});

test("the initial Project Ruleset has guidance but no active project policy", async () => {
  const entries = await readdir(path.join(rulesetsRoot, "project"));
  assert.deepEqual(entries, ["README.md"]);
  const readme = await readFile(path.join(rulesetsRoot, "project", "README.md"), "utf8");
  assert.match(readme, /arbitrary direct Markdown files/);
  assert.match(readme, /does not infer rules automatically/);
});

test("reference-aware Common rules are routed and optional Framework or Project sections may be absent", async (t) => {
  const uiIndex = await readFile(path.join(rulesetsRoot, "common", "ui-designer", "INDEX.md"), "utf8");
  const coderIndex = await readFile(path.join(rulesetsRoot, "common", "coder", "INDEX.md"), "utf8");
  const browserIndex = await readFile(path.join(rulesetsRoot, "common", "browser-verify", "INDEX.md"), "utf8");
  assert.match(uiIndex, /\[Reference Evidence\]\(rules\/reference-evidence\.md\)/);
  assert.match(coderIndex, /\[Reference Correction Iterations\]\(rules\/reference-correction-iterations\.md\)/);
  assert.match(browserIndex, /\[Reference Conformance\]\(rules\/reference-conformance\.md\)/);

  const uiRule = await readFile(
    path.join(rulesetsRoot, "common", "ui-designer", "rules", "reference-evidence.md"),
    "utf8",
  );
  const coderRule = await readFile(
    path.join(rulesetsRoot, "common", "coder", "rules", "reference-correction-iterations.md"),
    "utf8",
  );
  const browserRule = await readFile(
    path.join(rulesetsRoot, "common", "browser-verify", "rules", "reference-conformance.md"),
    "utf8",
  );
  assert.match(uiRule, /planning-only/i);
  assert.match(uiRule, /tasks\/TASK-NNN\/reference-ui\/manifest\.json/);
  assert.match(coderRule, /latest validation iteration/i);
  assert.match(coderRule, /`passedCases`/);
  assert.match(coderRule, /read-only inputs/i);
  assert.match(coderRule, /three recommendation classes mutually exclusive/i);
  assert.match(coderRule, /Specialist prerequisite blocker:[\s\S]*before implementation or becoming unresolved during implementation or checks/i);
  assert.match(coderRule, /Implementation\/check blocked:[\s\S]*runtime, test, or tooling problem/i);
  assert.match(coderRule, /Browser Verify is not allowed for this outcome/i);
  assert.match(coderRule, /Only after reference-aware implementation and essential tests are complete/i);
  assert.match(browserRule, /only when the request explicitly identifies a Reference UI manifest or explicitly asks for reference verification/i);
  assert.match(browserRule, /color threshold `0\.1` and maximum whole-surface mismatch ratio `0\.01`/i);
  assert.match(browserRule, /high-priority region outside tolerance fails even when the whole-surface comparison passes/i);
  assert.match(browserRule, /semantic assertions remain semantic, scoped-pixel regions remain compared, and pixel exclusions remove only the declared pixels/i);
  assert.match(browserRule, /`match=true` and `differentPixels=0`[\s\S]*machine-readable zero-diff JSON report/i);
  assert.match(browserRule, /same case or region scope[\s\S]*`diff` or `region-diff` artifact/i);
  assert.match(browserRule, /Never substitute a copy of the baseline or current screenshot for a pixel diff/i);
  assert.match(browserRule, /missing for `differentPixels > 0` or a dimension mismatch[\s\S]*iteration, case, region, requested output path, and full measurement/i);
  assert.match(browserRule, /Stop before finalization[\s\S]*generic finalizer failure/i);
  assert.match(browserRule, /stable case ID, optional named region ID, failed axis, severity, expected observation, actual observation, at least one supporting artifact or measurement/i);
  assert.match(browserRule, /finding exists only for a `FAIL` axis/i);
  assert.match(browserRule, /manifest, baselines, and previous iterations immutable/i);
  assert.match(browserRule, /atomically create one append-only `validation\/iteration-NNN\/`/i);
  for (const verdict of ["BLOCKED", "FAIL", "PASS", "NOT-APPLICABLE"]) {
    assert.match(browserRule, new RegExp("Return `" + verdict + "`", "i"));
  }
  assert.match(browserRule, /`PASS` recommends Verify as the only next manual step/i);
  assert.match(browserRule, /`FAIL` from an implementation mismatch recommends Coder/i);
  assert.match(browserRule, /`FAIL` from a proven application\/runtime defect recommends Debugger/i);
  assert.match(browserRule, /`BLOCKED` and `NOT-APPLICABLE` make no `flow-next` recommendation/i);
  assert.match(browserRule, /never presented as `PASS` or ready for Verify/i);
  assert.match(browserRule, /Never launch the recommended role[\s\S]*applicable single recommendation, STOP/i);

  const fixtureRoot = await createFixture(t);
  for (const [section, ruleName] of [
    ["ui-designer", "reference-evidence.md"],
    ["coder", "reference-correction-iterations.md"],
    ["browser-verify", "reference-conformance.md"],
  ]) {
    const sectionRoot = path.join(fixtureRoot, "common", section);
    await mkdir(path.join(sectionRoot, "rules"), { recursive: true });
    await writeFile(path.join(sectionRoot, "rules", ruleName), "# Optional Reference Rule\n", "utf8");
    await writeFile(path.join(sectionRoot, "INDEX.md"), `[Rule](rules/${ruleName})\n`, "utf8");
  }
  const fixtureIndexes = (await walk(fixtureRoot)).filter((file) => path.basename(file) === "INDEX.md");
  assert.equal(fixtureIndexes.length, 3);
  for (const index of fixtureIndexes) {
    for (const reference of markdownLinks(await readFile(index, "utf8"))) {
      await assert.doesNotReject(readFile(path.resolve(path.dirname(index), reference), "utf8"));
    }
  }
});
