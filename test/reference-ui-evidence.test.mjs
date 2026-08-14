import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { validateReferenceManifestFile } from "../toolchain/lib/reference-ui-contract.mjs";
import { finalizeReferenceValidation } from "../toolchain/lib/reference-ui-evidence.mjs";
import { materializeReferenceUiDiffArtifact } from "./live/reference-ui-diff-artifact.mjs";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(sourceRoot, "test", "fixtures", "reference-ui");

async function createTaskFixture(t) {
  const repositoryRoot = await mkdtemp(path.join(os.tmpdir(), "reference-ui-evidence-"));
  t.after(() => rm(repositoryRoot, { force: true, recursive: true }));
  const workspaceRoot = path.join(repositoryRoot, "tasks", "TASK-900", "reference-ui");
  const applicationRoot = path.join(repositoryRoot, "test", "fixtures", "reference-ui", "app");
  await mkdir(workspaceRoot, { recursive: true });
  await cp(path.join(fixtureRoot, "app"), applicationRoot, { recursive: true });
  await cp(path.join(fixtureRoot, "references"), path.join(workspaceRoot, "references"), { recursive: true });
  const manifestPath = path.join(workspaceRoot, "manifest.json");
  await cp(path.join(fixtureRoot, "manifest.json"), manifestPath);
  return { applicationRoot, manifestPath, repositoryRoot, workspaceRoot };
}

async function readManifest(fixture) {
  return JSON.parse(await readFile(fixture.manifestPath, "utf8"));
}

async function writeManifest(fixture, manifest) {
  await writeFile(fixture.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function executedSteps(steps, statuses = []) {
  return steps.map((step, index) => ({
    sequence: index + 1,
    ...step,
    status: statuses[index] ?? "PASS",
    observation: statuses[index] === "FAIL" ? "The injected browser boundary rejected this step." : "Manifest step completed.",
  }));
}

function visualMeasurement(manifestCase, differentPixels = 0, region = false) {
  const tolerance = region ? manifestCase.regions[0].tolerance : manifestCase.tolerance;
  const totalPixels = manifestCase.viewport.width * manifestCase.viewport.height;
  return {
    differentPixels,
    totalPixels,
    mismatchPercentage: (differentPixels / totalPixels) * 100,
    mismatchRatio: differentPixels / totalPixels,
    colorThreshold: tolerance.colorThreshold,
    maxMismatchRatio: tolerance.maxMismatchRatio,
    match: differentPixels === 0,
    dimensionMismatch: null,
  };
}

function artifact(kind, artifactPath) {
  return { kind, path: artifactPath };
}

function finding(caseId, regionId, axis, evidence, actual) {
  return {
    findingId: `${caseId}:${regionId ?? "surface"}:${axis}`,
    caseId,
    regionId,
    axis,
    severity: "high",
    expected: "The declared reference case passes this required hard gate.",
    actual,
    evidence: [evidence],
    correctionTarget: "Restore the declared fixture state without changing its reference baseline.",
  };
}

class FakeBrowserAdapter {
  constructor(scenario) {
    this.scenario = scenario;
    this.calls = [];
  }

  async doctor() {
    this.calls.push("doctor");
    return this.scenario === "browser-unavailable"
      ? { status: "BLOCKED", reason: "Managed browser capability is unavailable." }
      : { status: "PASS" };
  }

  async requestServerLaunch() {
    this.calls.push("request-server-launch");
    return this.scenario === "server-denied"
      ? { status: "BLOCKED", reason: "Fixture server launch was denied at the Skill contract seam." }
      : { status: "PASS" };
  }

  async open(route) {
    this.calls.push(`open:${route}`);
    this.opened = true;
  }

  async setViewport(viewport) {
    this.calls.push(`viewport:${viewport.width}x${viewport.height}`);
  }

  async performSteps(manifestCase) {
    this.calls.push(`steps:${manifestCase.id}`);
    const fails = this.scenario === "interaction-failure" && manifestCase.id === "desktop";
    return {
      setup: executedSteps(manifestCase.state.setup),
      interactions: executedSteps(manifestCase.interactions, fails ? manifestCase.interactions.map(() => "FAIL") : []),
    };
  }

  async assertAnchor(manifestCase) {
    this.calls.push(`anchor:${manifestCase.id}`);
    return !(this.scenario === "missing-anchor" && manifestCase.id === "desktop");
  }

  async readDynamicValue(manifestCase) {
    this.calls.push(`dynamic:${manifestCase.id}`);
    return "run-fixture";
  }

  async snapshot(manifestCase) {
    this.calls.push(`snapshot:${manifestCase.id}`);
    return `snapshot for ${manifestCase.id}\n`;
  }

  async screenshot(manifestCase, scope) {
    this.calls.push(`screenshot:${manifestCase.id}:${scope}`);
    if (this.scenario === "screenshot-failure" && manifestCase.id === "desktop") {
      throw new Error("injected screenshot failure");
    }
    return Buffer.from(`fake png ${manifestCase.id} ${scope}\n`);
  }

  async diffScreenshot(manifestCase, scope) {
    this.calls.push(`diff:${manifestCase.id}:${scope}`);
    if (this.scenario === "diff-failure" && manifestCase.id === "desktop") {
      throw new Error("injected diff failure");
    }
    let differentPixels = 0;
    if (this.scenario === "initial" && manifestCase.id === "desktop") differentPixels = 8_000;
    if (this.scenario === "regression" && manifestCase.id === "mobile") differentPixels = 6_000;
    if (this.scenario === "threshold-failure" && manifestCase.id === "desktop") differentPixels = 481;
    return {
      image: differentPixels > 0 ? Buffer.from(`fake diff ${manifestCase.id} ${scope}\n`) : undefined,
      measurement: visualMeasurement(manifestCase, differentPixels, scope === "surface"),
    };
  }

  async consoleMessages(manifestCase) {
    this.calls.push(`console:${manifestCase.id}`);
    return this.scenario === "console-error" && manifestCase.id === "desktop"
      ? { failed: true, content: "Error: injected fixture console failure\n" }
      : { failed: false, content: "No console errors.\n" };
  }

  async requiredRequests(manifestCase) {
    this.calls.push(`network:${manifestCase.id}`);
    return this.scenario === "request-failure" && manifestCase.id === "desktop"
      ? { failed: true, content: "GET /required-data 500\n" }
      : { failed: false, content: "All required requests passed.\n" };
  }

  async closeOwnedSession() {
    if (this.opened) this.calls.push("close-owned-session");
  }
}

async function stageArtifact(stagingRoot, artifactPath, content) {
  const file = path.join(stagingRoot, ...artifactPath.split("/"));
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
}

async function captureCase(adapter, manifestCase, stagingRoot, iteration) {
  const base = `cases/${manifestCase.id}`;
  const artifacts = [];
  const regions = [];
  const findings = [];
  const blockedReasons = {};
  const axes = {
    visual: "PASS",
    semantic: "PASS",
    behavior: "PASS",
    accessibility: "PASS",
    console: "PASS",
    network: "PASS",
  };

  await adapter.open(manifestCase.target.route);
  await adapter.setViewport(manifestCase.viewport);
  const steps = await adapter.performSteps(manifestCase);
  if (steps.interactions.some((step) => step.status === "FAIL")) {
    axes.behavior = "FAIL";
  }

  const anchorPresent = await adapter.assertAnchor(manifestCase);
  const dynamicValue = await adapter.readDynamicValue(manifestCase);
  const snapshotPath = `${base}/snapshot.txt`;
  artifacts.push(artifact("snapshot", snapshotPath));
  await stageArtifact(stagingRoot, snapshotPath, await adapter.snapshot(manifestCase));
  if (!anchorPresent) axes.semantic = "FAIL";
  if (!/^run-[a-z0-9]+$/.test(dynamicValue)) axes.semantic = "FAIL";

  const consoleResult = await adapter.consoleMessages(manifestCase);
  const consolePath = `${base}/console.txt`;
  artifacts.push(artifact("console", consolePath));
  await stageArtifact(stagingRoot, consolePath, consoleResult.content);
  if (consoleResult.failed) axes.console = "FAIL";

  const networkResult = await adapter.requiredRequests(manifestCase);
  const networkPath = `${base}/network.txt`;
  artifacts.push(artifact("network", networkPath));
  await stageArtifact(stagingRoot, networkPath, networkResult.content);
  if (networkResult.failed) axes.network = "FAIL";

  let measurement;
  try {
    const currentPath = `${base}/current.png`;
    await stageArtifact(stagingRoot, currentPath, await adapter.screenshot(manifestCase, "case"));
    artifacts.push(artifact("current", currentPath));
    const diff = await adapter.diffScreenshot(manifestCase, "case");
    const diffPath = `${base}/diff.png`;
    if (diff.image) await stageArtifact(stagingRoot, diffPath, diff.image);
    artifacts.push(await materializeReferenceUiDiffArtifact({
      artifactKind: "diff",
      caseId: manifestCase.id,
      iteration,
      measurement: diff.measurement,
      requestedOutputPath: path.join(stagingRoot, ...diffPath.split("/")),
      requestedOutputRelativePath: diffPath,
    }));
    measurement = diff.measurement;

    const regionBase = `${base}/regions/surface`;
    const regionCurrentPath = `${regionBase}/current.png`;
    const regionDiffPath = `${regionBase}/diff.png`;
    await stageArtifact(stagingRoot, regionCurrentPath, await adapter.screenshot(manifestCase, "surface"));
    const regionDiff = await adapter.diffScreenshot(manifestCase, "surface");
    if (regionDiff.image) await stageArtifact(stagingRoot, regionDiffPath, regionDiff.image);
    const regionDiffArtifact = await materializeReferenceUiDiffArtifact({
      artifactKind: "region-diff",
      caseId: manifestCase.id,
      iteration,
      measurement: regionDiff.measurement,
      regionId: "surface",
      requestedOutputPath: path.join(stagingRoot, ...regionDiffPath.split("/")),
      requestedOutputRelativePath: regionDiffPath,
    });
    regions.push({
      regionId: "surface",
      measurement: regionDiff.measurement,
      artifacts: [artifact("region-current", regionCurrentPath), regionDiffArtifact],
    });
    if (
      measurement.mismatchRatio > measurement.maxMismatchRatio ||
      regionDiff.measurement.mismatchRatio > regionDiff.measurement.maxMismatchRatio
    ) {
      axes.visual = "FAIL";
    }
  } catch (error) {
    axes.visual = "BLOCKED";
    blockedReasons.visual = `Capture/diff could not complete: ${error.message}`;
  }

  if (axes.visual === "FAIL") {
    findings.push(finding(
      manifestCase.id,
      "surface",
      "visual",
      `${base}/regions/surface/diff.png`,
      "The measured mismatch ratio exceeded the declared case or region threshold.",
    ));
  }
  if (axes.semantic === "FAIL") {
    findings.push(finding(
      manifestCase.id,
      null,
      "semantic",
      snapshotPath,
      "A required semantic anchor or dynamic value assertion failed.",
    ));
  }
  if (axes.behavior === "FAIL") {
    findings.push(finding(
      manifestCase.id,
      null,
      "behavior",
      snapshotPath,
      "The required reveal interaction did not complete.",
    ));
  }
  if (axes.console === "FAIL") {
    findings.push(finding(manifestCase.id, null, "console", consolePath, "A scenario-affecting console error was recorded."));
  }
  if (axes.network === "FAIL") {
    findings.push(finding(manifestCase.id, null, "network", networkPath, "A required request failed."));
  }

  return {
    evidence: {
      caseId: manifestCase.id,
      required: manifestCase.required,
      route: manifestCase.target.route,
      state: manifestCase.state.name,
      viewport: manifestCase.viewport,
      setup: steps.setup,
      interactions: steps.interactions,
      axes,
      blockedReasons,
      measurements: measurement && axes.visual !== "BLOCKED" ? { visual: measurement } : {},
      artifacts,
      regions: axes.visual === "BLOCKED" ? [] : regions,
      observations: [
        `Dynamic value ${dynamicValue} satisfied the declared semantic assertion.`,
        "Only dynamic region run-id-pixels was excluded from pixel comparison.",
      ],
    },
    findings,
  };
}

async function runFixtureScenario(fixture, scenario, iteration) {
  const adapter = new FakeBrowserAdapter(scenario);
  const doctor = await adapter.doctor();
  if (doctor.status !== "PASS") return { adapter, status: "BLOCKED", reason: doctor.reason };

  const manifestResult = await validateReferenceManifestFile({
    repositoryRoot: fixture.repositoryRoot,
    manifestPath: fixture.manifestPath,
  });
  const serverApproval = await adapter.requestServerLaunch();
  if (serverApproval.status !== "PASS") {
    return { adapter, status: "BLOCKED", reason: serverApproval.reason };
  }

  const session = `fixture-${scenario}-${iteration}`;
  const stagingRoot = path.join(fixture.workspaceRoot, ".staging", session);
  await mkdir(stagingRoot, { recursive: true });
  try {
    const capturedCases = [];
    const findings = [];
    for (const manifestCase of manifestResult.manifest.cases) {
      const captured = await captureCase(adapter, manifestCase, stagingRoot, iteration);
      capturedCases.push(captured.evidence);
      findings.push(...captured.findings);
    }
    const draft = {
      $schema: "../../../../../toolchain/schemas/reference-validation.schema.json",
      schemaVersion: 1,
      taskId: manifestResult.manifest.taskId,
      manifestVersion: manifestResult.manifest.manifestVersion,
      manifestDigest: "0".repeat(64),
      iteration,
      applicationUrl: "http://127.0.0.1:4173/index.html?variant=corrected",
      browser: { session, capability: "agent-browser", version: "0.32.3" },
      cases: capturedCases,
      findings,
      passedCases: [],
      changes: { new: [], resolved: [], unchanged: [], regressed: [] },
      verdict: { status: "PASS", reason: "The finalizer derives this value." },
    };
    const draftPath = path.join(stagingRoot, "evidence.json");
    await writeFile(draftPath, `${JSON.stringify(draft, null, 2)}\n`, "utf8");
    const finalized = await finalizeReferenceValidation({
      repositoryRoot: fixture.repositoryRoot,
      manifestPath: fixture.manifestPath,
      draftPath,
    });
    return { adapter, status: finalized.evidence.verdict.status, ...finalized };
  } finally {
    await adapter.closeOwnedSession();
  }
}

test("fixture declares deterministic desktop/mobile cases and one scoped dynamic pixel exclusion", async () => {
  const manifest = JSON.parse(await readFile(path.join(fixtureRoot, "manifest.json"), "utf8"));
  const html = await readFile(path.join(fixtureRoot, "app", "index.html"), "utf8");
  const script = await readFile(path.join(fixtureRoot, "app", "app.js"), "utf8");
  const styles = await readFile(path.join(fixtureRoot, "app", "styles.css"), "utf8");

  assert.deepEqual(manifest.cases.map((item) => item.id), ["desktop", "mobile"]);
  assert.deepEqual(manifest.cases.map((item) => item.viewport), [
    { width: 800, height: 600, deviceScaleFactor: 1 },
    { width: 390, height: 844, deviceScaleFactor: 1 },
  ]);
  for (const manifestCase of manifest.cases) {
    assert.deepEqual(
      manifestCase.interactions.map((interaction) => [interaction.action, interaction.value]),
      [["press", "Tab"], ["press", "Enter"], ["press", "Enter"], ["press", "Enter"]],
    );
    assert.deepEqual(manifestCase.dynamicRegions.map((item) => item.strategy), ["semantic", "excluded-from-pixel"]);
    assert.equal(manifestCase.dynamicRegions[1].locator.value, "#dynamic-value");
  }
  assert.match(html, /aria-expanded="false"/);
  assert.match(script, /panel\.hidden = !nextExpanded/);
  assert.match(script, /aria-expanded", String\(nextExpanded\)/);
  assert.match(script, /Date\.now/);
  assert.doesNotMatch(styles, /#details-toggle:focus\s*\{[^}]*outline:\s*0/i);
  assert.match(styles, /#details-toggle:focus-visible\s*\{[^}]*outline:\s*[1-9]/i);
  assert.match(styles, /reference-mask-dynamic #dynamic-value/);
  assert.match(styles, /data-variant="initial"/);
  assert.match(styles, /data-variant="regression"/);
});

test("initial mismatch fails, corrected state passes, and a later break is classified as regressed", async (t) => {
  const fixture = await createTaskFixture(t);
  const initial = await runFixtureScenario(fixture, "initial", 1);
  assert.equal(initial.status, "FAIL");
  assert.deepEqual(initial.evidence.changes.new, ["desktop:surface:visual"]);
  assert.equal(initial.evidence.findings[0].regionId, "surface");

  const corrected = await runFixtureScenario(fixture, "corrected", 2);
  assert.equal(corrected.status, "PASS");
  assert.deepEqual(corrected.evidence.passedCases, ["desktop", "mobile"]);
  assert.deepEqual(corrected.evidence.changes.resolved, ["desktop:surface:visual"]);
  for (const caseEvidence of corrected.evidence.cases) {
    const diffArtifact = caseEvidence.artifacts.find((item) => item.kind === "diff");
    const regionDiffArtifact = caseEvidence.regions[0].artifacts.find((item) => item.kind === "region-diff");
    for (const declared of [diffArtifact, regionDiffArtifact]) {
      assert.match(declared.path, /\/diff\.json$/);
      const report = JSON.parse(await readFile(
        path.join(path.dirname(corrected.evidencePath), ...declared.path.split("/")),
        "utf8",
      ));
      assert.equal(report.type, "reference-ui-zero-diff");
      assert.equal(report.measurement.differentPixels, 0);
      assert.equal(report.measurement.match, true);
    }
  }
  assert.ok(
    corrected.adapter.calls.indexOf("dynamic:desktop") < corrected.adapter.calls.indexOf("screenshot:desktop:case"),
    "semantic dynamic assertion must run before pixel capture",
  );

  const regression = await runFixtureScenario(fixture, "regression", 3);
  assert.equal(regression.status, "FAIL");
  assert.deepEqual(regression.evidence.changes.regressed, ["mobile:surface:visual"]);
});

test("semantic interaction is a hard gate even when all screenshot diffs pass", async (t) => {
  const fixture = await createTaskFixture(t);
  const result = await runFixtureScenario(fixture, "interaction-failure", 1);
  assert.equal(result.status, "FAIL");
  assert.equal(result.evidence.cases[0].axes.visual, "PASS");
  assert.equal(result.evidence.cases[0].axes.behavior, "FAIL");
  assert.deepEqual(result.evidence.findings.map((item) => item.findingId), ["desktop:surface:behavior"]);
});

test("manifest validation rejects missing and unreadable references", async (t) => {
  await t.test("missing", async (subtest) => {
    const fixture = await createTaskFixture(subtest);
    await rm(path.join(fixture.workspaceRoot, "references", "desktop.png"));
    await assert.rejects(
      validateReferenceManifestFile({ repositoryRoot: fixture.repositoryRoot, manifestPath: fixture.manifestPath }),
      /baselinePath: path is not readable/i,
    );
  });
  await t.test("unreadable as a regular baseline", async (subtest) => {
    const fixture = await createTaskFixture(subtest);
    const baseline = path.join(fixture.workspaceRoot, "references", "desktop.png");
    await rm(baseline);
    await mkdir(baseline);
    await assert.rejects(
      validateReferenceManifestFile({ repositoryRoot: fixture.repositoryRoot, manifestPath: fixture.manifestPath }),
      /baselinePath: expected a file|baselinePath: path is not a file|baselinePath:.*regular file/i,
    );
  });
});

test("manifest validation rejects missing route, missing state, and contradictory cases", async (t) => {
  for (const scenario of ["missing-route", "missing-state", "contradictory-cases"]) {
    await t.test(scenario, async (subtest) => {
      const fixture = await createTaskFixture(subtest);
      const manifest = await readManifest(fixture);
      if (scenario === "missing-route") delete manifest.cases[0].target.route;
      if (scenario === "missing-state") delete manifest.cases[0].state;
      if (scenario === "contradictory-cases") {
        const duplicate = structuredClone(manifest.cases[0]);
        duplicate.id = "desktop-copy";
        manifest.cases.push(duplicate);
      }
      await writeManifest(fixture, manifest);
      await assert.rejects(
        validateReferenceManifestFile({ repositoryRoot: fixture.repositoryRoot, manifestPath: fixture.manifestPath }),
        scenario === "contradictory-cases" ? /contradictory cases/i : /target\.route|\.state/i,
      );
    });
  }
});

test("Skill seam returns BLOCKED for unavailable browser capability and denied server launch", async (t) => {
  for (const [scenario, reason] of [
    ["browser-unavailable", /browser capability is unavailable/i],
    ["server-denied", /server launch was denied/i],
  ]) {
    await t.test(scenario, async (subtest) => {
      const fixture = await createTaskFixture(subtest);
      const result = await runFixtureScenario(fixture, scenario, 1);
      assert.equal(result.status, "BLOCKED");
      assert.match(result.reason, reason);
      assert.equal(result.evidence, undefined);
    });
  }
});

test("capture and diff failures produce concrete BLOCKED visual evidence", async (t) => {
  for (const scenario of ["screenshot-failure", "diff-failure"]) {
    await t.test(scenario, async (subtest) => {
      const fixture = await createTaskFixture(subtest);
      const result = await runFixtureScenario(fixture, scenario, 1);
      assert.equal(result.status, "BLOCKED");
      const desktop = result.evidence.cases.find((item) => item.caseId === "desktop");
      assert.equal(desktop.axes.visual, "BLOCKED");
      assert.match(desktop.blockedReasons.visual, /injected (screenshot|diff) failure/i);
      assert.equal(result.evidence.findings.some((item) => item.caseId === "desktop" && item.axis === "visual"), false);
      assert.equal(result.adapter.calls.at(-1), "close-owned-session");
    });
  }
});

test("console, required request, missing anchor, and threshold failures remain distinct hard gates", async (t) => {
  const expectations = new Map([
    ["console-error", ["console", "desktop:surface:console"]],
    ["request-failure", ["network", "desktop:surface:network"]],
    ["missing-anchor", ["semantic", "desktop:surface:semantic"]],
    ["threshold-failure", ["visual", "desktop:surface:visual"]],
  ]);
  for (const [scenario, [axis, findingId]] of expectations) {
    await t.test(scenario, async (subtest) => {
      const fixture = await createTaskFixture(subtest);
      const result = await runFixtureScenario(fixture, scenario, 1);
      assert.equal(result.status, "FAIL");
      const desktop = result.evidence.cases.find((item) => item.caseId === "desktop");
      assert.equal(desktop.axes[axis], "FAIL");
      assert.ok(result.evidence.findings.some((item) => item.findingId === findingId));
    });
  }
});
