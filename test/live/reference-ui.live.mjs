import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { validateReferenceManifestFile } from "../../toolchain/lib/reference-ui-contract.mjs";
import { finalizeReferenceValidation } from "../../toolchain/lib/reference-ui-evidence.mjs";
import { formatProcessFailure, runProcess } from "../../toolchain/lib/process.mjs";
import { runReferenceUiAdapterProcess } from "./reference-ui-adapter-process.mjs";
import { materializeReferenceUiDiffArtifact } from "./reference-ui-diff-artifact.mjs";
import { evaluateReferenceUiDoctorGate } from "./reference-ui-doctor-gate.mjs";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const fixtureRoot = path.join(sourceRoot, "test", "fixtures", "reference-ui");
const doctorPath = path.join(sourceRoot, "toolchain", "bin", "doctor.mjs");
const browserAdapterPath = path.join(sourceRoot, "toolchain", "bin", "agent-browser.mjs");
const baselineNames = ["desktop.png", "mobile.png"];
const liveIterations = [
  { variant: "initial", iteration: 1, expectedVerdict: "FAIL" },
  { variant: "corrected", iteration: 2, expectedVerdict: "PASS" },
  { variant: "regression", iteration: 3, expectedVerdict: "FAIL" },
];

function parseJson(output, label) {
  try {
    return JSON.parse(output.trim());
  } catch (error) {
    throw new Error(`${label} did not return JSON: ${error.message}; output=${output.trim() || "<empty>"}`);
  }
}

function visitObjects(value, visitor) {
  if (!value || typeof value !== "object") return undefined;
  const found = visitor(value);
  if (found !== undefined) return found;
  for (const child of Object.values(value)) {
    const nested = visitObjects(child, visitor);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

function extractText(payload, label) {
  const value = visitObjects(payload, (candidate) => {
    for (const key of ["value", "text", "attribute", "result"]) {
      if (typeof candidate[key] === "string") return candidate[key];
    }
    return undefined;
  });
  if (typeof value !== "string") throw new Error(`${label} returned no text value`);
  return value;
}

function extractObservation(payload, label) {
  const direct = visitObjects(payload, (candidate) =>
    typeof candidate.activeElementId === "string" ? candidate : undefined,
  );
  if (direct) return direct;
  const encoded = visitObjects(payload, (candidate) => {
    for (const key of ["result", "value", "text"]) {
      if (typeof candidate[key] === "string" && candidate[key].trim().startsWith("{")) return candidate[key];
    }
    return undefined;
  });
  if (encoded) {
    const decoded = parseJson(encoded, label);
    if (typeof decoded.activeElementId === "string") return decoded;
  }
  throw new Error(`${label} returned no structured keyboard/focus observation`);
}

function extractMeasurement(payload, manifestCase, region = false) {
  const raw = visitObjects(payload, (candidate) => {
    const differentPixels = candidate.differentPixels ?? candidate.different_pixels;
    const totalPixels = candidate.totalPixels ?? candidate.total_pixels;
    if (Number.isInteger(differentPixels) && Number.isInteger(totalPixels)) {
      return { candidate, differentPixels, totalPixels };
    }
    return undefined;
  });
  if (!raw) throw new Error(`screenshot diff returned no measurable mismatch ratio for ${manifestCase.id}`);
  const tolerance = region ? manifestCase.regions[0].tolerance : manifestCase.tolerance;
  const mismatchPercentage = raw.candidate.mismatchPercentage
    ?? raw.candidate.mismatch_percentage
    ?? (raw.differentPixels / raw.totalPixels) * 100;
  return {
    differentPixels: raw.differentPixels,
    totalPixels: raw.totalPixels,
    mismatchPercentage,
    mismatchRatio: raw.differentPixels / raw.totalPixels,
    colorThreshold: tolerance.colorThreshold,
    maxMismatchRatio: tolerance.maxMismatchRatio,
    match: typeof raw.candidate.match === "boolean" ? raw.candidate.match : raw.differentPixels === 0,
    dimensionMismatch: raw.candidate.dimensionMismatch ?? raw.candidate.dimension_mismatch ?? null,
  };
}

function executedSteps(steps, results) {
  assert.equal(results.length, steps.length, "every manifest step needs one observed result");
  return steps.map((step, index) => ({
    sequence: index + 1,
    ...step,
    status: results[index].pass ? "PASS" : "FAIL",
    observation: results[index].observation,
  }));
}

function finding(caseId, regionId, axis, evidence, actual) {
  return {
    findingId: `${caseId}:${regionId ?? "surface"}:${axis}`,
    caseId,
    regionId,
    axis,
    severity: "high",
    expected: "The committed fixture baseline and all required hard gates pass.",
    actual,
    evidence: [evidence],
    correctionTarget: "Repair the fixture implementation; do not update the committed baseline from this test.",
  };
}

async function hashBaselines() {
  return new Map(await Promise.all(baselineNames.map(async (name) => [
    name,
    createHash("sha256").update(await readFile(path.join(fixtureRoot, "references", name))).digest("hex"),
  ])));
}

async function assertBaselinesUnchanged(before) {
  const after = await hashBaselines();
  assert.deepEqual(after, before, "the explicit live test must never regenerate or mutate committed baselines");
}

async function prepareTemporaryTask() {
  const repositoryRoot = await mkdtemp(path.join(os.tmpdir(), "reference-ui-live-"));
  const workspaceRoot = path.join(repositoryRoot, "tasks", "TASK-900", "reference-ui");
  const applicationRoot = path.join(repositoryRoot, "test", "fixtures", "reference-ui", "app");
  await mkdir(workspaceRoot, { recursive: true });
  await cp(path.join(fixtureRoot, "app"), applicationRoot, { recursive: true });
  await cp(path.join(fixtureRoot, "references"), path.join(workspaceRoot, "references"), { recursive: true });
  const manifestPath = path.join(workspaceRoot, "manifest.json");
  await cp(path.join(fixtureRoot, "manifest.json"), manifestPath);
  return { applicationRoot, manifestPath, repositoryRoot, workspaceRoot };
}

async function removeTemporaryTask(repositoryRoot) {
  const relative = path.relative(os.tmpdir(), repositoryRoot);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`refusing to remove non-temporary live fixture path: ${repositoryRoot}`);
  }
  await rm(repositoryRoot, { force: true, recursive: true });
}

async function startFixtureServer(applicationRoot) {
  const requests = [];
  const variants = new Set(liveIterations.map((item) => item.variant));
  let servedVariant = "corrected";
  const contentTypes = new Map([
    [".html", "text/html; charset=utf-8"],
    [".css", "text/css; charset=utf-8"],
    [".js", "text/javascript; charset=utf-8"],
  ]);
  const server = createServer(async (request, response) => {
    let statusCode = 200;
    try {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      const relative = requestUrl.pathname === "/" ? "index.html" : decodeURIComponent(requestUrl.pathname.slice(1));
      if (relative === "favicon.ico") {
        statusCode = 204;
        response.writeHead(statusCode, { "cache-control": "no-store" });
        response.end();
      } else if (!new Set(["index.html", "styles.css", "app.js"]).has(relative)) {
        statusCode = 404;
        response.writeHead(statusCode, { "content-type": "text/plain; charset=utf-8" });
        response.end("Not found");
      } else {
        const source = await readFile(path.join(applicationRoot, relative));
        const body = relative === "app.js"
          ? Buffer.concat([
              Buffer.from(`window.__REFERENCE_FIXTURE_VARIANT__ = ${JSON.stringify(servedVariant)};\n`),
              source,
            ])
          : source;
        response.writeHead(statusCode, {
          "cache-control": "no-store",
          "content-type": contentTypes.get(path.extname(relative)),
        });
        response.end(body);
      }
    } catch (error) {
      statusCode = 500;
      response.writeHead(statusCode, { "content-type": "text/plain; charset=utf-8" });
      response.end(error.message);
    } finally {
      requests.push({ method: request.method, url: request.url, statusCode, variant: servedVariant });
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture server did not expose a TCP port");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    setVariant(variant) {
      if (!variants.has(variant)) throw new Error(`unknown fixture variant: ${variant}`);
      servedVariant = variant;
    },
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

async function runDoctorGate() {
  const result = await runProcess(process.execPath, [doctorPath, "--json"], { cwd: sourceRoot });
  const report = parseJson(result.stdout, "project Doctor");
  const decision = evaluateReferenceUiDoctorGate({ exitCode: result.code, report });
  if (!decision.allowed) {
    throw new Error(`managed browser readiness is BLOCKED by project Doctor: ${decision.reason}`);
  }
  return report;
}

async function runAdapter(session, args) {
  const fullArgs = [browserAdapterPath, "--session", session, "--json", ...args];
  const result = await runReferenceUiAdapterProcess(process.execPath, fullArgs, { cwd: sourceRoot });
  if (result.code !== 0) throw new Error(formatProcessFailure(process.execPath, fullArgs, result));
  return result.stdout;
}

function interactionObservationScript() {
  return `(() => {
    const control = document.querySelector('#details-toggle');
    const panel = document.querySelector('#details-panel');
    const focusStyle = getComputedStyle(control);
    const panelStyle = getComputedStyle(panel);
    const panelRect = panel.getBoundingClientRect();
    return {
      activeElementId: document.activeElement?.id ?? '',
      outlineStyle: focusStyle.outlineStyle,
      outlineWidth: Number.parseFloat(focusStyle.outlineWidth),
      outlineColor: focusStyle.outlineColor,
      ariaExpanded: control.getAttribute('aria-expanded'),
      panelHidden: panel.hidden,
      panelVisible: !panel.hidden && panelStyle.display !== 'none' && panelStyle.visibility !== 'hidden' && panelRect.width > 0 && panelRect.height > 0
    };
  })()`;
}

async function observeInteraction(session, label) {
  return extractObservation(
    parseJson(await runAdapter(session, ["eval", interactionObservationScript()]), label),
    label,
  );
}

function focusIsVisible(observation) {
  return observation.activeElementId === "details-toggle"
    && observation.outlineStyle !== "none"
    && Number(observation.outlineWidth) >= 2
    && !/rgba?\(0,\s*0,\s*0,\s*0\)|transparent/i.test(String(observation.outlineColor));
}

async function exerciseKeyboardFlow(session) {
  await runAdapter(session, ["press", "Tab"]);
  const focus = await observeInteraction(session, "keyboard focus");

  await runAdapter(session, ["press", "Enter"]);
  await runAdapter(session, ["wait", "#details-panel:not([hidden])"]);
  const expanded = await observeInteraction(session, "keyboard activation");

  await runAdapter(session, ["press", "Enter"]);
  const recovery = await observeInteraction(session, "keyboard recovery");

  await runAdapter(session, ["press", "Enter"]);
  await runAdapter(session, ["wait", "#details-panel:not([hidden])"]);
  const restored = await observeInteraction(session, "keyboard restored state");

  const results = [
    {
      pass: focus.activeElementId === "details-toggle",
      observation: `Tab active element: ${focus.activeElementId || "<none>"}; outline: ${focus.outlineWidth}px ${focus.outlineStyle} ${focus.outlineColor}.`,
    },
    {
      pass: expanded.ariaExpanded === "true" && expanded.panelVisible === true,
      observation: `Enter expanded=${expanded.ariaExpanded}; panelVisible=${expanded.panelVisible}.`,
    },
    {
      pass: recovery.ariaExpanded === "false" && recovery.panelHidden === true && recovery.panelVisible === false,
      observation: `Recovery expanded=${recovery.ariaExpanded}; panelHidden=${recovery.panelHidden}; panelVisible=${recovery.panelVisible}.`,
    },
    {
      pass: restored.ariaExpanded === "true" && restored.panelVisible === true,
      observation: `Restored expanded=${restored.ariaExpanded}; panelVisible=${restored.panelVisible}.`,
    },
  ];
  return { focus, expanded, recovery, restored, results };
}

async function captureLiveCaseUnchecked(options) {
  const { baseUrl, iteration, manifestCase, requestLog, session, stagingRoot, workspaceRoot } = options;
  const routeUrl = new URL(manifestCase.target.route, baseUrl).href;
  const requestStart = requestLog.length;
  await runAdapter(session, ["open", routeUrl]);
  await runAdapter(session, [
    "set", "viewport",
    String(manifestCase.viewport.width),
    String(manifestCase.viewport.height),
    String(manifestCase.viewport.deviceScaleFactor),
  ]);
  await runAdapter(session, ["set", "media", manifestCase.theme]);
  await runAdapter(session, ["wait", "#surface"]);

  const snapshotOutput = await runAdapter(session, ["snapshot", "-i"]);
  const keyboard = await exerciseKeyboardFlow(session);
  const anchor = extractText(
    parseJson(await runAdapter(session, ["get", "text", "#required-anchor"]), "required anchor"),
    "required anchor",
  );
  const dynamic = extractText(
    parseJson(await runAdapter(session, ["get", "text", "#dynamic-value"]), "dynamic value"),
    "dynamic value",
  );
  const semanticPass = keyboard.restored.ariaExpanded === "true"
    && keyboard.restored.panelVisible === true
    && anchor.trim() === "ready"
    && /^run-[a-z0-9]+$/.test(dynamic.trim());
  const behaviorPass = keyboard.results.every((result) => result.pass);
  const accessibilityPass = /Show required details/i.test(snapshotOutput) && focusIsVisible(keyboard.focus);

  await runAdapter(session, [
    "eval",
    "document.activeElement?.blur(); document.documentElement.classList.add('reference-mask-dynamic')",
  ]);
  const base = `cases/${manifestCase.id}`;
  const currentRelative = `${base}/current.png`;
  const diffRelative = `${base}/diff.png`;
  const regionCurrentRelative = `${base}/regions/surface/current.png`;
  const regionDiffRelative = `${base}/regions/surface/diff.png`;
  const currentPath = path.join(stagingRoot, ...currentRelative.split("/"));
  const diffPath = path.join(stagingRoot, ...diffRelative.split("/"));
  const regionCurrentPath = path.join(stagingRoot, ...regionCurrentRelative.split("/"));
  const regionDiffPath = path.join(stagingRoot, ...regionDiffRelative.split("/"));
  await mkdir(path.dirname(regionCurrentPath), { recursive: true });
  await runAdapter(session, ["screenshot", currentPath]);
  const baselinePath = path.join(workspaceRoot, ...manifestCase.reference.baselinePath.split("/"));
  const diffOutput = parseJson(await runAdapter(session, [
    "diff", "screenshot", "--baseline", baselinePath,
    "--output", diffPath,
    "--threshold", String(manifestCase.tolerance.colorThreshold),
  ]), `${manifestCase.id} screenshot diff`);
  const measurement = extractMeasurement(diffOutput, manifestCase);
  const diffArtifact = await materializeReferenceUiDiffArtifact({
    artifactKind: "diff",
    caseId: manifestCase.id,
    iteration,
    measurement,
    requestedOutputPath: diffPath,
    requestedOutputRelativePath: diffRelative,
  });
  await runAdapter(session, ["screenshot", "#surface", regionCurrentPath]);
  const regionDiffOutput = parseJson(await runAdapter(session, [
    "diff", "screenshot", "--baseline", baselinePath,
    "--selector", "#surface",
    "--output", regionDiffPath,
    "--threshold", String(manifestCase.regions[0].tolerance.colorThreshold),
  ]), `${manifestCase.id} region diff`);
  const regionMeasurement = extractMeasurement(regionDiffOutput, manifestCase, true);
  const regionDiffArtifact = await materializeReferenceUiDiffArtifact({
    artifactKind: "region-diff",
    caseId: manifestCase.id,
    iteration,
    measurement: regionMeasurement,
    regionId: "surface",
    requestedOutputPath: regionDiffPath,
    requestedOutputRelativePath: regionDiffRelative,
  });

  const consoleOutput = await runAdapter(session, ["console"]);
  const errorsOutput = await runAdapter(session, ["errors"]);
  const networkOutput = await runAdapter(session, ["network", "requests"]);
  const consolePass = !/uncaught|page error|"type"\s*:\s*"error"/i.test(`${consoleOutput}\n${errorsOutput}`);
  const caseRequests = requestLog.slice(requestStart);
  const networkPass = ["/styles.css", "/app.js"].every((requiredPath) =>
    caseRequests.some((request) => request.statusCode === 200 && request.url?.startsWith(requiredPath)),
  ) && !caseRequests.some((request) => request.statusCode >= 400);

  const snapshotRelative = `${base}/snapshot.txt`;
  const consoleRelative = `${base}/console.txt`;
  const networkRelative = `${base}/network.txt`;
  await writeFile(
    path.join(stagingRoot, ...snapshotRelative.split("/")),
    `${snapshotOutput}\n${JSON.stringify(keyboard, null, 2)}\n`,
    "utf8",
  );
  await writeFile(path.join(stagingRoot, ...consoleRelative.split("/")), `${consoleOutput}\n${errorsOutput}`, "utf8");
  await writeFile(path.join(stagingRoot, ...networkRelative.split("/")), networkOutput, "utf8");

  const visualPass = [measurement, regionMeasurement].every((item) =>
    !item.dimensionMismatch && item.mismatchRatio <= item.maxMismatchRatio,
  );
  const axes = {
    visual: visualPass ? "PASS" : "FAIL",
    semantic: semanticPass ? "PASS" : "FAIL",
    behavior: behaviorPass ? "PASS" : "FAIL",
    accessibility: accessibilityPass ? "PASS" : "FAIL",
    console: consolePass ? "PASS" : "FAIL",
    network: networkPass ? "PASS" : "FAIL",
  };
  const artifacts = [
    { kind: "current", path: currentRelative },
    diffArtifact,
    { kind: "snapshot", path: snapshotRelative },
    { kind: "console", path: consoleRelative },
    { kind: "network", path: networkRelative },
  ];
  const findings = [];
  if (!visualPass) findings.push(finding(manifestCase.id, "surface", "visual", regionDiffArtifact.path, "Screenshot mismatch exceeded the manifest threshold."));
  if (!semanticPass) findings.push(finding(manifestCase.id, null, "semantic", snapshotRelative, "Required anchor, dynamic assertion, or restored visible state failed."));
  if (!behaviorPass) findings.push(finding(manifestCase.id, null, "behavior", snapshotRelative, "Keyboard activation or recovery did not produce the declared visible state."));
  if (!accessibilityPass) findings.push(finding(manifestCase.id, null, "accessibility", snapshotRelative, "Keyboard focus or its visible focus style failed."));
  if (!consolePass) findings.push(finding(manifestCase.id, null, "console", consoleRelative, "The fixture emitted a page or console error."));
  if (!networkPass) findings.push(finding(manifestCase.id, null, "network", networkRelative, "A required fixture request was missing or failed."));
  return {
    evidence: {
      caseId: manifestCase.id,
      required: manifestCase.required,
      route: manifestCase.target.route,
      state: manifestCase.state.name,
      viewport: manifestCase.viewport,
      setup: executedSteps(manifestCase.state.setup, [
        { pass: true, observation: "The declared #surface readiness anchor became visible." },
      ]),
      interactions: executedSteps(manifestCase.interactions, keyboard.results),
      axes,
      blockedReasons: {},
      measurements: { visual: measurement },
      artifacts,
      regions: [{
        regionId: "surface",
        measurement: regionMeasurement,
        artifacts: [
          { kind: "region-current", path: regionCurrentRelative },
          regionDiffArtifact,
        ],
      }],
      observations: [
        `Keyboard focus used ${keyboard.focus.outlineWidth}px ${keyboard.focus.outlineStyle} outline on ${keyboard.focus.activeElementId}.`,
        `Keyboard recovery collapsed the panel (${keyboard.recovery.panelHidden}) and restored it (${keyboard.restored.panelVisible}).`,
        `Dynamic value ${dynamic.trim()} passed its semantic assertion before masking.`,
        "Only declared dynamic region run-id-pixels was masked for screenshot comparison.",
      ],
    },
    findings,
    routeUrl,
  };
}

async function captureLiveCase(options) {
  try {
    return await captureLiveCaseUnchecked(options);
  } catch (error) {
    throw new Error(
      `Reference UI live capture failed (iteration=${options.iteration}, case=${options.manifestCase.id}): ${error.message}`,
      { cause: error },
    );
  }
}

async function finalizeLiveIteration(options) {
  const { baseUrl, fixtureServer, liveIteration, manifestResult, session, temporaryTask } = options;
  fixtureServer.setVariant(liveIteration.variant);
  const stagingRoot = path.join(temporaryTask.workspaceRoot, ".staging", session);
  await mkdir(stagingRoot, { recursive: true });
  const cases = [];
  const findings = [];
  let firstUrl;
  for (const manifestCase of manifestResult.manifest.cases) {
    const captured = await captureLiveCase({
      baseUrl,
      iteration: liveIteration.iteration,
      manifestCase,
      requestLog: fixtureServer.requests,
      session,
      stagingRoot,
      workspaceRoot: temporaryTask.workspaceRoot,
    });
    firstUrl ??= captured.routeUrl;
    cases.push(captured.evidence);
    findings.push(...captured.findings);
  }
  const draft = {
    $schema: "../../../../../toolchain/schemas/reference-validation.schema.json",
    schemaVersion: 1,
    taskId: manifestResult.manifest.taskId,
    manifestVersion: manifestResult.manifest.manifestVersion,
    manifestDigest: manifestResult.digest,
    iteration: liveIteration.iteration,
    applicationUrl: firstUrl,
    browser: { session, capability: "agent-browser", version: "0.32.3" },
    cases,
    findings,
    passedCases: [],
    changes: { new: [], resolved: [], unchanged: [], regressed: [] },
    verdict: { status: "PASS", reason: "The finalizer derives this value." },
  };
  const draftPath = path.join(stagingRoot, "evidence.json");
  await writeFile(draftPath, `${JSON.stringify(draft, null, 2)}\n`, "utf8");
  return finalizeReferenceValidation({
    repositoryRoot: temporaryTask.repositoryRoot,
    manifestPath: temporaryTask.manifestPath,
    draftPath,
  });
}

function assertLiveIterationSequence(finalizedIterations, compatibility) {
  assert.equal(finalizedIterations.length, liveIterations.length);
  for (const [index, finalized] of finalizedIterations.entries()) {
    const expected = liveIterations[index];
    assert.equal(finalized.evidence.verdict.status, expected.expectedVerdict, `${expected.variant} verdict`);
    assert.deepEqual(
      {
        taskId: finalized.evidence.taskId,
        manifestVersion: finalized.evidence.manifestVersion,
        manifestDigest: finalized.evidence.manifestDigest,
      },
      compatibility,
      `${expected.variant} compatibility`,
    );
  }

  const initialFindingIds = finalizedIterations[0].evidence.findings.map((item) => item.findingId).sort();
  assert.ok(initialFindingIds.length > 0, "initial iteration must produce actionable findings");
  assert.deepEqual(finalizedIterations[0].evidence.changes.new, initialFindingIds);
  assert.deepEqual(finalizedIterations[1].evidence.changes.resolved, initialFindingIds);
  assert.deepEqual(finalizedIterations[1].evidence.findings, []);

  const regressionFindingIds = finalizedIterations[2].evidence.findings.map((item) => item.findingId).sort();
  assert.ok(regressionFindingIds.length > 0, "regression iteration must produce actionable findings");
  assert.deepEqual(finalizedIterations[2].evidence.changes.regressed, regressionFindingIds);
}

async function main() {
  const baselineHashes = await hashBaselines();
  let temporaryTask;
  let fixtureServer;
  let session;
  let sessionOpened = false;
  try {
    const doctor = await runDoctorGate();
    temporaryTask = await prepareTemporaryTask();
    const manifestResult = await validateReferenceManifestFile({
      repositoryRoot: temporaryTask.repositoryRoot,
      manifestPath: temporaryTask.manifestPath,
    });
    const compatibility = {
      taskId: manifestResult.manifest.taskId,
      manifestVersion: manifestResult.manifest.manifestVersion,
      manifestDigest: manifestResult.digest,
    };
    fixtureServer = await startFixtureServer(temporaryTask.applicationRoot);
    session = `reference-ui-live-${process.pid}-${Date.now()}`;
    sessionOpened = true;

    const finalizedIterations = [];
    for (const liveIteration of liveIterations) {
      const finalized = await finalizeLiveIteration({
        baseUrl: fixtureServer.baseUrl,
        fixtureServer,
        liveIteration,
        manifestResult,
        session,
        temporaryTask,
      });
      finalizedIterations.push(finalized);
    }
    assertLiveIterationSequence(finalizedIterations, compatibility);
    console.log(JSON.stringify({
      status: "PASS",
      doctor: doctor.status,
      compatibility,
      iterations: finalizedIterations.map((item, index) => ({
        variant: liveIterations[index].variant,
        iteration: item.evidence.iteration,
        verdict: item.evidence.verdict.status,
        changes: item.evidence.changes,
        evidence: item.evidencePath,
      })),
    }, null, 2));
  } finally {
    if (sessionOpened && session) {
      try {
        await runAdapter(session, ["close"]);
      } catch (error) {
        console.error(`Owned browser session cleanup warning: ${error.message}`);
      }
    }
    if (fixtureServer) await fixtureServer.close();
    if (temporaryTask) await removeTemporaryTask(temporaryTask.repositoryRoot);
    await assertBaselinesUnchanged(baselineHashes);
  }
}

main().catch((error) => {
  console.error(`Reference UI live test failed: ${error.message}`);
  process.exitCode = 1;
});
