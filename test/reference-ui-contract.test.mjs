import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  classifyReferenceFindings,
  normalizeReferenceEvidenceDraft,
  normalizeVisualMeasurement,
  validateReferenceManifestFile,
} from "../toolchain/lib/reference-ui-contract.mjs";
import { finalizeReferenceValidation } from "../toolchain/lib/reference-ui-evidence.mjs";
import { runReferenceUiCli } from "../toolchain/bin/reference-ui.mjs";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function referenceCase(options = {}) {
  const id = options.id ?? "desktop";
  return {
    id,
    required: options.required ?? true,
    priority: "high",
    target: {
      kind: "route",
      identity: "Reference fixture",
      route: options.route ?? "/reference",
    },
    state: {
      name: options.state ?? "populated",
      setup: options.setup ?? [],
    },
    viewport: options.viewport ?? {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
    },
    theme: "light",
    locale: "en-US",
    reference: {
      sourceKind: "local",
      source: `references/${id}.png`,
      baselinePath: `references/${id}.png`,
    },
    regions: options.regions ?? [],
    interactions: options.interactions ?? [],
    dynamicRegions: [],
    allowedDeviations: [],
  };
}

function manifest(cases = [referenceCase()]) {
  return {
    $schema: "../../../toolchain/schemas/reference-ui-manifest.schema.json",
    schemaVersion: 1,
    taskId: "TASK-001",
    manifestVersion: 1,
    applicationRoot: ".",
    acceptancePolicy: {
      colorThreshold: 0.1,
      maxMismatchRatio: 0.01,
    },
    cases,
  };
}

async function createFixture(t, manifestValue = manifest()) {
  const repositoryRoot = await mkdtemp(path.join(os.tmpdir(), "reference ui contract "));
  t.after(() => rm(repositoryRoot, { force: true, recursive: true }));
  const workspaceRoot = path.join(repositoryRoot, "tasks", "TASK-001", "reference-ui");
  const referencesRoot = path.join(workspaceRoot, "references");
  await mkdir(referencesRoot, { recursive: true });
  for (const item of manifestValue.cases) {
    if (item.reference?.baselinePath?.startsWith("references/")) {
      await writeFile(path.join(workspaceRoot, ...item.reference.baselinePath.split("/")), `baseline ${item.id}\n`);
    }
  }
  const manifestPath = path.join(workspaceRoot, "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifestValue, null, 2)}\n`, "utf8");
  return { manifestPath, repositoryRoot, workspaceRoot };
}

async function rewriteManifest(fixture, value) {
  await writeFile(fixture.manifestPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return validateReferenceManifestFile({
    repositoryRoot: fixture.repositoryRoot,
    manifestPath: fixture.manifestPath,
  });
}

function visualMeasurement(options = {}) {
  const differentPixels = options.differentPixels ?? 0;
  const totalPixels = options.totalPixels ?? 100;
  return {
    differentPixels,
    totalPixels,
    mismatchPercentage: (differentPixels / totalPixels) * 100,
    colorThreshold: options.colorThreshold ?? 0.1,
    maxMismatchRatio: options.maxMismatchRatio ?? 0.01,
    match: differentPixels === 0,
    dimensionMismatch: options.dimensionMismatch ?? null,
  };
}

function artifact(kind, artifactPath) {
  return { kind, path: artifactPath };
}

function executedSteps(steps, statuses = []) {
  return steps.map((step, index) => ({
    sequence: index + 1,
    ...step,
    status: statuses[index] ?? "PASS",
    observation: `Executed manifest step ${index + 1}.`,
  }));
}

function evidenceCase(manifestCase, options = {}) {
  const base = `cases/${manifestCase.id}`;
  const measurement = visualMeasurement({
    colorThreshold: manifestCase.tolerance.colorThreshold,
    maxMismatchRatio: manifestCase.tolerance.maxMismatchRatio,
    ...options.measurement,
  });
  return {
    caseId: manifestCase.id,
    required: manifestCase.required,
    route: manifestCase.target.route ?? null,
    state: manifestCase.state.name,
    viewport: manifestCase.viewport,
    setup: executedSteps(manifestCase.state.setup, options.setupStatuses),
    interactions: executedSteps(manifestCase.interactions, options.interactionStatuses),
    axes: {
      visual: options.visualStatus ?? "PASS",
      semantic: options.semanticStatus ?? "PASS",
      behavior: options.behaviorStatus ?? "PASS",
      accessibility: "PASS",
      console: "PASS",
      network: "PASS",
    },
    blockedReasons: options.blockedReasons ?? {},
    measurements: { visual: measurement },
    artifacts: [artifact("current", `${base}/current.png`), artifact("diff", `${base}/diff.png`)],
    regions: manifestCase.regions.map((region) => ({
      regionId: region.id,
      measurement: visualMeasurement({
        colorThreshold: region.tolerance.colorThreshold,
        maxMismatchRatio: region.tolerance.maxMismatchRatio,
      }),
      artifacts: [
        artifact("region-current", `${base}/regions/${region.id}/current.png`),
        artifact("region-diff", `${base}/regions/${region.id}/diff.png`),
      ],
    })),
    observations: [],
  };
}

function evidenceDraft(manifestResult, options = {}) {
  const cases = options.cases ?? manifestResult.manifest.cases.map((item) => evidenceCase(item));
  return {
    $schema: "../../../../../toolchain/schemas/reference-validation.schema.json",
    schemaVersion: 1,
    taskId: manifestResult.manifest.taskId,
    manifestVersion: manifestResult.manifest.manifestVersion,
    manifestDigest: "0".repeat(64),
    iteration: options.iteration ?? 1,
    applicationUrl: "http://127.0.0.1:4173/reference",
    browser: {
      session: options.session ?? "session-a",
      capability: "agent-browser",
      version: "0.32.3",
    },
    cases,
    findings: options.findings ?? [],
    passedCases: [],
    changes: { new: [], resolved: [], unchanged: [], regressed: [] },
    verdict: { status: "PASS", reason: "Draft value is replaced by the finalizer." },
  };
}

async function writeStagingDraft(fixture, draft) {
  const stagingRoot = path.join(fixture.workspaceRoot, ".staging", draft.browser.session);
  await mkdir(stagingRoot, { recursive: true });
  for (const item of draft.cases) {
    for (const declaredArtifact of [
      ...item.artifacts,
      ...item.regions.flatMap((region) => region.artifacts),
    ]) {
      const file = path.join(stagingRoot, ...declaredArtifact.path.split("/"));
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, `${declaredArtifact.kind}\n`, "utf8");
    }
  }
  const draftPath = path.join(stagingRoot, "evidence.json");
  await writeFile(draftPath, `${JSON.stringify(draft, null, 2)}\n`, "utf8");
  return { draftPath, stagingRoot };
}

test("canonical templates satisfy the declared schemas and runtime contract", async (t) => {
  const manifestSchema = JSON.parse(
    await readFile(path.join(sourceRoot, "toolchain/schemas/reference-ui-manifest.schema.json"), "utf8"),
  );
  const evidenceSchema = JSON.parse(
    await readFile(path.join(sourceRoot, "toolchain/schemas/reference-validation.schema.json"), "utf8"),
  );
  const manifestTemplate = JSON.parse(
    await readFile(path.join(sourceRoot, ".claude/skills/ui-designer/templates/reference-ui-manifest.json"), "utf8"),
  );
  const evidenceTemplate = JSON.parse(
    await readFile(path.join(sourceRoot, ".claude/skills/browser-verify/templates/reference-validation.json"), "utf8"),
  );
  for (const key of manifestSchema.required) assert.ok(Object.hasOwn(manifestTemplate, key), `manifest.${key}`);
  for (const key of evidenceSchema.required) assert.ok(Object.hasOwn(evidenceTemplate, key), `evidence.${key}`);
  assert.match(manifestTemplate.taskId, new RegExp(manifestSchema.properties.taskId.pattern));
  assert.match(evidenceTemplate.taskId, new RegExp(evidenceSchema.properties.taskId.pattern));
  assert.match(evidenceTemplate.manifestDigest, new RegExp(evidenceSchema.properties.manifestDigest.pattern));

  const repositoryRoot = await mkdtemp(path.join(os.tmpdir(), "reference ui templates "));
  t.after(() => rm(repositoryRoot, { force: true, recursive: true }));
  const workspaceRoot = path.join(repositoryRoot, "tasks", "TASK-000", "reference-ui");
  await mkdir(path.join(workspaceRoot, "references"), { recursive: true });
  for (const item of manifestTemplate.cases) {
    await writeFile(path.join(workspaceRoot, ...item.reference.baselinePath.split("/")), "template baseline\n");
  }
  const manifestPath = path.join(workspaceRoot, "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifestTemplate, null, 2)}\n`);
  await assert.doesNotReject(validateReferenceManifestFile({ repositoryRoot, manifestPath }));
  assert.doesNotThrow(() =>
    normalizeReferenceEvidenceDraft(evidenceTemplate, {
      manifest: { taskId: "TASK-000", manifestVersion: 1, cases: [] },
      digest: "0".repeat(64),
    }),
  );
});

test("a valid desktop and mobile manifest resolves baselines and has a stable digest", async (t) => {
  const value = manifest([
    referenceCase(),
    referenceCase({
      id: "mobile",
      viewport: { width: 390, height: 844, deviceScaleFactor: 1 },
    }),
  ]);
  const fixture = await createFixture(t, value);
  const first = await validateReferenceManifestFile(fixture);
  const second = await validateReferenceManifestFile(fixture);
  assert.match(first.digest, /^[a-f0-9]{64}$/);
  assert.equal(first.digest, second.digest);
  assert.deepEqual(Object.keys(first.baselines), ["desktop", "mobile"]);
  assert.equal(first.applicationRoot, fixture.repositoryRoot);
});

test("the internal CLI validates a manifest without discovering or launching runtime work", async (t) => {
  const fixture = await createFixture(t);
  let output = "";
  const exitCode = await runReferenceUiCli({
    args: ["validate-manifest", fixture.manifestPath, "--json"],
    cwd: fixture.repositoryRoot,
    repositoryRoot: fixture.repositoryRoot,
    stdout: { write(chunk) { output += chunk; } },
  });
  assert.equal(exitCode, 0);
  const result = JSON.parse(output);
  assert.equal(result.status, "VALID");
  assert.equal(result.taskId, "TASK-001");
  assert.deepEqual(result.cases, ["desktop"]);
});

test("manifest validation rejects ambiguous, contradictory, unsafe, and unreadable cases", async (t) => {
  const fixture = await createFixture(t);
  const checks = [
    {
      name: "unsupported schema",
      mutate(value) { value.schemaVersion = 2; },
      error: /unsupported schema version/,
    },
    {
      name: "missing route",
      mutate(value) { delete value.cases[0].target.route; },
      error: /target\.route/,
    },
    {
      name: "missing state",
      mutate(value) { delete value.cases[0].state.name; },
      error: /state\.name/,
    },
    {
      name: "missing viewport",
      mutate(value) { delete value.cases[0].viewport; },
      error: /viewport/,
    },
    {
      name: "duplicate id",
      mutate(value) { value.cases.push(structuredClone(value.cases[0])); },
      error: /duplicate id/,
    },
    {
      name: "contradictory case",
      mutate(value) {
        const duplicate = structuredClone(value.cases[0]);
        duplicate.id = "same-observation";
        duplicate.reference.source = "references/same-observation.png";
        duplicate.reference.baselinePath = "references/same-observation.png";
        value.cases.push(duplicate);
      },
      prepare: async () => writeFile(path.join(fixture.workspaceRoot, "references", "same-observation.png"), "baseline\n"),
      error: /contradictory cases/,
    },
    {
      name: "path traversal",
      mutate(value) { value.cases[0].reference.baselinePath = "../outside.png"; },
      error: /parent-directory/,
    },
    {
      name: "unreadable baseline",
      mutate(value) { value.cases[0].reference.baselinePath = "references/missing.png"; },
      error: /not readable/,
    },
    {
      name: "invalid tolerance",
      mutate(value) { value.acceptancePolicy.maxMismatchRatio = 2; },
      error: /maxMismatchRatio/,
    },
    {
      name: "unstable URL baseline",
      mutate(value) {
        value.cases[0].reference.sourceKind = "url";
        value.cases[0].reference.source = "https://example.com/reference";
      },
      error: /captured baseline timestamp/,
    },
  ];

  for (const check of checks) {
    const value = manifest();
    check.mutate(value);
    if (check.prepare) await check.prepare();
    await assert.rejects(rewriteManifest(fixture, value), check.error, check.name);
  }
});

test("pinned screenshot diff metrics normalize to a measurable mismatch ratio", () => {
  const normalized = normalizeVisualMeasurement(
    {
      differentPixels: 12_000,
      totalPixels: 24_000,
      mismatchPercentage: 50,
      match: false,
      dimensionMismatch: null,
    },
    "measurement",
    { colorThreshold: 0.1, maxMismatchRatio: 0.01 },
  );
  assert.equal(normalized.mismatchRatio, 0.5);
  assert.equal(normalized.mismatchPercentage, 50);
  assert.equal(normalized.colorThreshold, 0.1);

  const rounded = normalizeVisualMeasurement(
    {
      differentPixels: 1,
      totalPixels: 3,
      mismatchPercentage: 33.33,
      match: false,
      dimensionMismatch: null,
    },
    "rounded measurement",
    { colorThreshold: 0.1, maxMismatchRatio: 0.5 },
  );
  assert.equal(rounded.mismatchRatio, 1 / 3);
});

test("hard-gate measurements derive FAIL even when the draft claims PASS", async (t) => {
  const fixture = await createFixture(t);
  const manifestResult = await validateReferenceManifestFile(fixture);
  const failedCase = evidenceCase(manifestResult.manifest.cases[0], {
    visualStatus: "PASS",
    measurement: { differentPixels: 50, totalPixels: 100 },
  });
  const findingId = "desktop:surface:visual";
  const normalized = normalizeReferenceEvidenceDraft(
    evidenceDraft(manifestResult, {
      cases: [failedCase],
      findings: [
        {
          findingId,
          caseId: "desktop",
          regionId: null,
          axis: "visual",
          severity: "high",
          expected: "The surface matches the baseline tolerance.",
          actual: "The mismatch ratio is 0.5.",
          evidence: ["cases/desktop/diff.png"],
          correctionTarget: "Restore the reference surface geometry and fills.",
        },
      ],
    }),
    manifestResult,
  );
  assert.equal(normalized.cases[0].axes.visual, "FAIL");
  assert.equal(normalized.verdict.status, "FAIL");
  assert.deepEqual(normalized.passedCases, []);
});

test("visual PASS requires current and diff artifacts in the case scope", async (t) => {
  const fixture = await createFixture(t);
  const manifestResult = await validateReferenceManifestFile(fixture);
  const missingDiff = evidenceCase(manifestResult.manifest.cases[0]);
  missingDiff.artifacts = missingDiff.artifacts.filter((item) => item.kind !== "diff");
  assert.throws(
    () => normalizeReferenceEvidenceDraft(evidenceDraft(manifestResult, { cases: [missingDiff] }), manifestResult),
    /visual PASS\/FAIL requires artifact kinds: current, diff/,
  );

  const wrongCase = evidenceCase(manifestResult.manifest.cases[0]);
  wrongCase.artifacts[0].path = "cases/another-case/current.png";
  assert.throws(
    () => normalizeReferenceEvidenceDraft(evidenceDraft(manifestResult, { cases: [wrongCase] }), manifestResult),
    /expected a path scoped under cases\/desktop\//,
  );

  const nestedCaseArtifact = evidenceCase(manifestResult.manifest.cases[0]);
  nestedCaseArtifact.artifacts[0].path = "cases/desktop/regions/header/current.png";
  assert.throws(
    () => normalizeReferenceEvidenceDraft(
      evidenceDraft(manifestResult, { cases: [nestedCaseArtifact] }),
      manifestResult,
    ),
    /artifact must be stored directly in cases\/desktop\//,
  );
});

test("region artifacts are confined to their declared case and region", async (t) => {
  const value = manifest([
    referenceCase({
      regions: [
        {
          id: "header",
          priority: "high",
          locator: { strategy: "role", value: "banner", name: "Site header" },
        },
      ],
    }),
  ]);
  const fixture = await createFixture(t, value);
  const manifestResult = await validateReferenceManifestFile(fixture);
  const wrongRegion = evidenceCase(manifestResult.manifest.cases[0]);
  wrongRegion.regions[0].artifacts[0].path = "cases/desktop/regions/footer/current.png";
  assert.throws(
    () => normalizeReferenceEvidenceDraft(evidenceDraft(manifestResult, { cases: [wrongRegion] }), manifestResult),
    /expected a path scoped under cases\/desktop\/regions\/header\//,
  );

  const nestedRegion = evidenceCase(manifestResult.manifest.cases[0]);
  nestedRegion.regions[0].artifacts[0].path = "cases/desktop/regions/header/nested/current.png";
  assert.throws(
    () => normalizeReferenceEvidenceDraft(evidenceDraft(manifestResult, { cases: [nestedRegion] }), manifestResult),
    /artifact must be stored directly in cases\/desktop\/regions\/header\//,
  );
});

test("actionable findings require the corresponding case axis to be FAIL", async (t) => {
  const fixture = await createFixture(t);
  const manifestResult = await validateReferenceManifestFile(fixture);
  const finding = {
    findingId: "desktop:surface:semantic",
    caseId: "desktop",
    regionId: null,
    axis: "semantic",
    severity: "high",
    expected: "The declared semantics are present.",
    actual: "The semantics do not match.",
    evidence: ["cases/desktop/diff.png"],
    correctionTarget: "Restore the declared semantics.",
  };

  const passing = evidenceCase(manifestResult.manifest.cases[0]);
  assert.throws(
    () => normalizeReferenceEvidenceDraft(
      evidenceDraft(manifestResult, { cases: [passing], findings: [finding] }),
      manifestResult,
    ),
    /requires desktop:semantic to be FAIL, got PASS/,
  );

  const notApplicable = evidenceCase(manifestResult.manifest.cases[0], { semanticStatus: "NOT-APPLICABLE" });
  assert.throws(
    () => normalizeReferenceEvidenceDraft(
      evidenceDraft(manifestResult, { cases: [notApplicable], findings: [finding] }),
      manifestResult,
    ),
    /requires desktop:semantic to be FAIL, got NOT-APPLICABLE/,
  );

  const failed = evidenceCase(manifestResult.manifest.cases[0], { semanticStatus: "FAIL" });
  const normalized = normalizeReferenceEvidenceDraft(
    evidenceDraft(manifestResult, { cases: [failed], findings: [finding] }),
    manifestResult,
  );
  assert.equal(normalized.cases[0].axes.semantic, "FAIL");
  assert.equal(normalized.verdict.status, "FAIL");
});

test("a finding requires at least one supporting artifact", async (t) => {
  const fixture = await createFixture(t);
  const manifestResult = await validateReferenceManifestFile(fixture);
  const failed = evidenceCase(manifestResult.manifest.cases[0], { semanticStatus: "FAIL" });
  const finding = {
    findingId: "desktop:surface:semantic",
    caseId: "desktop",
    regionId: null,
    axis: "semantic",
    severity: "high",
    expected: "The declared semantics are present.",
    actual: "The semantics do not match.",
    evidence: [],
    correctionTarget: "Restore the declared semantics.",
  };
  assert.throws(
    () => normalizeReferenceEvidenceDraft(
      evidenceDraft(manifestResult, { cases: [failed], findings: [finding] }),
      manifestResult,
    ),
    /evidence\.findings\[0\]\.evidence: expected at least one supporting artifact/,
  );

  finding.evidence = ["cases/desktop/diff.png"];
  const normalized = normalizeReferenceEvidenceDraft(
    evidenceDraft(manifestResult, { cases: [failed], findings: [finding] }),
    manifestResult,
  );
  assert.deepEqual(normalized.findings[0].evidence, ["cases/desktop/diff.png"]);
  assert.equal(normalized.verdict.status, "FAIL");
});

test("every BLOCKED case axis requires a concrete saved reason", async (t) => {
  const fixture = await createFixture(t);
  const manifestResult = await validateReferenceManifestFile(fixture);
  const blocked = evidenceCase(manifestResult.manifest.cases[0]);
  blocked.axes.console = "BLOCKED";
  blocked.axes.network = "BLOCKED";
  blocked.blockedReasons = { console: "Console collection was unavailable." };
  assert.throws(
    () => normalizeReferenceEvidenceDraft(evidenceDraft(manifestResult, { cases: [blocked] }), manifestResult),
    /blockedReasons\.network/,
  );

  blocked.blockedReasons.network = "   ";
  assert.throws(
    () => normalizeReferenceEvidenceDraft(evidenceDraft(manifestResult, { cases: [blocked] }), manifestResult),
    /expected a concrete non-blank reason/,
  );

  blocked.blockedReasons.network = "The required request did not complete before evidence capture.";
  const normalized = normalizeReferenceEvidenceDraft(
    evidenceDraft(manifestResult, { cases: [blocked] }),
    manifestResult,
  );
  assert.deepEqual(normalized.cases[0].blockedReasons, blocked.blockedReasons);
  assert.equal(normalized.verdict.status, "BLOCKED");
});

test("executed setup and interactions must exactly match manifest steps and derive behavior failures", async (t) => {
  const value = manifest([
    referenceCase({
      setup: [
        {
          action: "click",
          locator: { strategy: "role", value: "button", name: "Load fixture" },
          expected: "Fixture is loaded",
        },
      ],
      interactions: [
        {
          action: "fill",
          locator: { strategy: "label", value: "Search" },
          value: "reference",
          expected: "Results are filtered",
        },
      ],
    }),
  ]);
  const fixture = await createFixture(t, value);
  const manifestResult = await validateReferenceManifestFile(fixture);
  const passing = evidenceCase(manifestResult.manifest.cases[0]);
  const normalized = normalizeReferenceEvidenceDraft(
    evidenceDraft(manifestResult, { cases: [passing] }),
    manifestResult,
  );
  assert.deepEqual(normalized.cases[0].setup, passing.setup);
  assert.deepEqual(normalized.cases[0].interactions, passing.interactions);

  const mismatched = evidenceCase(manifestResult.manifest.cases[0]);
  mismatched.interactions[0].value = "different";
  assert.throws(
    () => normalizeReferenceEvidenceDraft(evidenceDraft(manifestResult, { cases: [mismatched] }), manifestResult),
    /does not match manifest step 1/,
  );

  const blocked = evidenceCase(manifestResult.manifest.cases[0], { interactionStatuses: ["BLOCKED"] });
  assert.throws(
    () => normalizeReferenceEvidenceDraft(evidenceDraft(manifestResult, { cases: [blocked] }), manifestResult),
    /blockedReasons\.behavior/,
  );
  blocked.blockedReasons.behavior = "The interaction target never became ready.";
  const blockedEvidence = normalizeReferenceEvidenceDraft(
    evidenceDraft(manifestResult, { cases: [blocked] }),
    manifestResult,
  );
  assert.equal(blockedEvidence.cases[0].axes.behavior, "BLOCKED");
  assert.equal(blockedEvidence.verdict.status, "BLOCKED");

  const failed = evidenceCase(manifestResult.manifest.cases[0], { interactionStatuses: ["FAIL"] });
  const failedEvidence = normalizeReferenceEvidenceDraft(
    evidenceDraft(manifestResult, {
      cases: [failed],
      findings: [
        {
          findingId: "desktop:surface:behavior",
          caseId: "desktop",
          regionId: null,
          axis: "behavior",
          severity: "high",
          expected: "The declared interaction succeeds.",
          actual: "The executed interaction failed.",
          evidence: ["cases/desktop/diff.png"],
          correctionTarget: "Restore the declared interaction behavior.",
        },
      ],
    }),
    manifestResult,
  );
  assert.equal(failedEvidence.cases[0].axes.behavior, "FAIL");
  assert.equal(failedEvidence.verdict.status, "FAIL");
});

test("finding comparison deterministically classifies new, resolved, unchanged, and regressed", () => {
  const finding = (findingId, caseId) => ({ findingId, caseId });
  const previous = {
    taskId: "TASK-001",
    manifestVersion: 1,
    manifestDigest: "a".repeat(64),
    passedCases: ["regressed-case"],
    findings: [finding("old:surface:visual", "old"), finding("same:surface:visual", "same")],
  };
  const current = {
    taskId: "TASK-001",
    manifestVersion: 1,
    manifestDigest: "a".repeat(64),
    findings: [
      finding("same:surface:visual", "same"),
      finding("new:surface:visual", "new"),
      finding("regressed-case:surface:visual", "regressed-case"),
    ],
  };
  assert.deepEqual(classifyReferenceFindings(previous, current), {
    new: ["new:surface:visual"],
    resolved: ["old:surface:visual"],
    unchanged: ["same:surface:visual"],
    regressed: ["regressed-case:surface:visual"],
  });
});

test("finalization confines artifacts and commits one append-only iteration", async (t) => {
  const fixture = await createFixture(t);
  const manifestResult = await validateReferenceManifestFile(fixture);
  const draft = evidenceDraft(manifestResult);
  const staging = await writeStagingDraft(fixture, draft);
  const result = await finalizeReferenceValidation({
    repositoryRoot: fixture.repositoryRoot,
    manifestPath: fixture.manifestPath,
    draftPath: staging.draftPath,
  });

  assert.equal(result.evidence.verdict.status, "PASS");
  assert.equal(result.cleanupWarning, null);
  assert.equal(result.evidence.manifestDigest, manifestResult.digest);
  assert.deepEqual(result.evidence.passedCases, ["desktop"]);
  assert.match(result.evidencePath, /validation[\\/]iteration-001[\\/]evidence\.json$/);
  assert.equal(await readFile(path.join(result.iterationRoot, "cases", "desktop", "current.png"), "utf8"), "current\n");
  await assert.rejects(readFile(staging.draftPath), /ENOENT/);
  assert.deepEqual(
    (await readdir(path.join(fixture.workspaceRoot, "validation"))).filter((name) => name.startsWith(".iteration-")),
    [],
  );

  const before = await readFile(result.evidencePath, "utf8");
  const secondDraft = evidenceDraft(manifestResult, { session: "session-b" });
  const secondStaging = await writeStagingDraft(fixture, secondDraft);
  await assert.rejects(
    finalizeReferenceValidation({
      repositoryRoot: fixture.repositoryRoot,
      manifestPath: fixture.manifestPath,
      draftPath: secondStaging.draftPath,
    }),
    /already exists; evidence is append-only/,
  );
  assert.equal(await readFile(result.evidencePath, "utf8"), before);
});

test("finalization publishes only complete iterations and rejects concurrent overwrite", async (t) => {
  const fixture = await createFixture(t);
  const manifestResult = await validateReferenceManifestFile(fixture);
  const incompleteDraft = evidenceDraft(manifestResult, { session: "incomplete" });
  const incompleteStaging = await writeStagingDraft(fixture, incompleteDraft);
  await rm(path.join(incompleteStaging.stagingRoot, "cases", "desktop", "diff.png"));
  await assert.rejects(
    finalizeReferenceValidation({
      repositoryRoot: fixture.repositoryRoot,
      manifestPath: fixture.manifestPath,
      draftPath: incompleteStaging.draftPath,
    }),
    /artifact is not readable/,
  );
  const validationRoot = path.join(fixture.workspaceRoot, "validation");
  assert.deepEqual(await readdir(validationRoot), []);

  const firstStaging = await writeStagingDraft(fixture, evidenceDraft(manifestResult, { session: "concurrent-a" }));
  const secondStaging = await writeStagingDraft(fixture, evidenceDraft(manifestResult, { session: "concurrent-b" }));
  const attempts = await Promise.allSettled([
    finalizeReferenceValidation({
      repositoryRoot: fixture.repositoryRoot,
      manifestPath: fixture.manifestPath,
      draftPath: firstStaging.draftPath,
    }),
    finalizeReferenceValidation({
      repositoryRoot: fixture.repositoryRoot,
      manifestPath: fixture.manifestPath,
      draftPath: secondStaging.draftPath,
    }),
  ]);
  assert.equal(attempts.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(attempts.filter((result) => result.status === "rejected").length, 1);
  assert.match(attempts.find((result) => result.status === "rejected").reason.message, /append-only/);
  assert.deepEqual(await readdir(validationRoot), ["iteration-001"]);
});

test("a staging cleanup error returns a warning after the iteration is committed", async (t) => {
  const fixture = await createFixture(t);
  const manifestResult = await validateReferenceManifestFile(fixture);
  const staging = await writeStagingDraft(fixture, evidenceDraft(manifestResult));
  const cleanupError = new Error("injected staging removal failure");
  cleanupError.code = "EPERM";
  const result = await finalizeReferenceValidation({
    repositoryRoot: fixture.repositoryRoot,
    manifestPath: fixture.manifestPath,
    draftPath: staging.draftPath,
    async removeStaging(target, options) {
      assert.equal(target, staging.stagingRoot);
      assert.deepEqual(options, { force: true, recursive: true });
      throw cleanupError;
    },
  });

  assert.equal(result.cleanupWarning.code, "STAGING_CLEANUP_FAILED");
  assert.equal(result.cleanupWarning.path, staging.stagingRoot);
  assert.match(result.cleanupWarning.message, /iteration-001 is committed/i);
  assert.match(result.cleanupWarning.message, /injected staging removal failure/);
  assert.equal(JSON.parse(await readFile(result.evidencePath, "utf8")).iteration, 1);
  assert.equal(JSON.parse(await readFile(staging.draftPath, "utf8")).iteration, 1);

  const duplicateStaging = await writeStagingDraft(
    fixture,
    evidenceDraft(manifestResult, { session: "cleanup-warning-duplicate" }),
  );
  await assert.rejects(
    finalizeReferenceValidation({
      repositoryRoot: fixture.repositoryRoot,
      manifestPath: fixture.manifestPath,
      draftPath: duplicateStaging.draftPath,
    }),
    /already exists; evidence is append-only/,
  );
});

test("manifestVersion is monotonic and binds one digest per committed version", async (t) => {
  const fixture = await createFixture(t);
  const versionOne = await validateReferenceManifestFile(fixture);
  const staging = await writeStagingDraft(fixture, evidenceDraft(versionOne));
  await finalizeReferenceValidation({
    repositoryRoot: fixture.repositoryRoot,
    manifestPath: fixture.manifestPath,
    draftPath: staging.draftPath,
  });
  await assert.doesNotReject(validateReferenceManifestFile(fixture));

  const sameVersionChangedDigest = manifest();
  sameVersionChangedDigest.acceptancePolicy.maxMismatchRatio = 0.02;
  await writeFile(fixture.manifestPath, `${JSON.stringify(sameVersionChangedDigest, null, 2)}\n`);
  await assert.rejects(
    validateReferenceManifestFile(fixture),
    /version 1 already has committed evidence for a different manifest digest; a digest change requires a version greater than 1/,
  );

  const versionTwoValue = structuredClone(sameVersionChangedDigest);
  versionTwoValue.manifestVersion = 2;
  const versionTwo = await rewriteManifest(fixture, versionTwoValue);
  const versionTwoStaging = await writeStagingDraft(
    fixture,
    evidenceDraft(versionTwo, { iteration: 2, session: "manifest-v2" }),
  );
  await finalizeReferenceValidation({
    repositoryRoot: fixture.repositoryRoot,
    manifestPath: fixture.manifestPath,
    draftPath: versionTwoStaging.draftPath,
  });
  await assert.doesNotReject(validateReferenceManifestFile(fixture));

  await writeFile(fixture.manifestPath, `${JSON.stringify(manifest(), null, 2)}\n`);
  await assert.rejects(
    validateReferenceManifestFile(fixture),
    /version 1 is lower than maximum committed version 2/,
  );

  const versionTwoChangedAgain = structuredClone(versionTwoValue);
  versionTwoChangedAgain.acceptancePolicy.maxMismatchRatio = 0.03;
  await writeFile(fixture.manifestPath, `${JSON.stringify(versionTwoChangedAgain, null, 2)}\n`);
  await assert.rejects(
    validateReferenceManifestFile(fixture),
    /version 2 already has committed evidence for a different manifest digest; a digest change requires a version greater than 2/,
  );

  versionTwoChangedAgain.manifestVersion = 3;
  await assert.doesNotReject(rewriteManifest(fixture, versionTwoChangedAgain));
});

test("finalization rejects draft and artifact paths outside the owned staging workspace", async (t) => {
  const fixture = await createFixture(t);
  const manifestResult = await validateReferenceManifestFile(fixture);
  const outsideDraft = path.join(fixture.workspaceRoot, "outside.json");
  await writeFile(outsideDraft, "{}\n", "utf8");
  await assert.rejects(
    finalizeReferenceValidation({
      repositoryRoot: fixture.repositoryRoot,
      manifestPath: fixture.manifestPath,
      draftPath: outsideDraft,
    }),
    /draft evidence must stay inside/,
  );

  const unsafe = evidenceDraft(manifestResult);
  unsafe.cases[0].artifacts[0].path = "../escaped.png";
  const staging = await writeStagingDraft(fixture, evidenceDraft(manifestResult, { session: "safe-source" }));
  await writeFile(staging.draftPath, `${JSON.stringify(unsafe, null, 2)}\n`, "utf8");
  await assert.rejects(
    finalizeReferenceValidation({
      repositoryRoot: fixture.repositoryRoot,
      manifestPath: fixture.manifestPath,
      draftPath: staging.draftPath,
    }),
    /parent-directory/,
  );
  await assert.rejects(readFile(path.join(fixture.workspaceRoot, "validation", "iteration-001", "evidence.json")), /ENOENT/);
});

test("physical baseline confinement rejects a directory symlink or junction escape", async (t) => {
  const fixture = await createFixture(t);
  const outside = await mkdtemp(path.join(os.tmpdir(), "reference ui outside "));
  t.after(() => rm(outside, { force: true, recursive: true }));
  await writeFile(path.join(outside, "baseline.png"), "outside\n", "utf8");
  const link = path.join(fixture.workspaceRoot, "references", "escaped");
  try {
    await symlink(outside, link, process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) {
      t.skip(`filesystem links unavailable: ${error.code}`);
      return;
    }
    throw error;
  }
  const value = manifest();
  value.cases[0].reference.source = "references/escaped/baseline.png";
  value.cases[0].reference.baselinePath = "references/escaped/baseline.png";
  await assert.rejects(rewriteManifest(fixture, value), /escapes its allowed workspace/);
});

test("append-only finalization rejects inserting or skipping iteration numbers", async (t) => {
  const fixture = await createFixture(t);
  const manifestResult = await validateReferenceManifestFile(fixture);
  const first = evidenceDraft(manifestResult);
  const firstStaging = await writeStagingDraft(fixture, first);
  await finalizeReferenceValidation({
    repositoryRoot: fixture.repositoryRoot,
    manifestPath: fixture.manifestPath,
    draftPath: firstStaging.draftPath,
  });

  const skipped = evidenceDraft(manifestResult, { iteration: 3, session: "session-three" });
  const skippedStaging = await writeStagingDraft(fixture, skipped);
  await assert.rejects(
    finalizeReferenceValidation({
      repositoryRoot: fixture.repositoryRoot,
      manifestPath: fixture.manifestPath,
      draftPath: skippedStaging.draftPath,
    }),
    /expected next append-only iteration 2/,
  );
  await assert.rejects(readFile(path.join(fixture.workspaceRoot, "validation", "iteration-003", "evidence.json")), /ENOENT/);
});
