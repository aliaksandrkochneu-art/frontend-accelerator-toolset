import { createHash } from "node:crypto";
import { readFile, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { canonicalPath, isPathInside, isResolvedPathInside } from "./cache.mjs";

export const REFERENCE_UI_SCHEMA_VERSION = 1;
export const REFERENCE_UI_AXES = [
  "visual",
  "semantic",
  "behavior",
  "accessibility",
  "console",
  "network",
];
export const REFERENCE_UI_AXIS_STATUSES = ["PASS", "FAIL", "BLOCKED", "NOT-APPLICABLE"];

const TASK_ID_PATTERN = /^TASK-[0-9]{3,}$/;
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const SESSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const DRAFT_DIGEST_PLACEHOLDER = "0".repeat(64);
const PRIORITIES = ["high", "normal", "low"];
const LOCATOR_STRATEGIES = ["role", "label", "testId", "text", "selector"];
const STEP_ACTIONS = ["click", "fill", "press", "select", "check", "uncheck", "waitFor"];
const STEP_EXECUTION_STATUSES = ["PASS", "FAIL", "BLOCKED"];
const ARTIFACT_KINDS = [
  "current",
  "diff",
  "region-current",
  "region-diff",
  "snapshot",
  "console",
  "network",
];

export class ReferenceUiContractError extends Error {
  constructor(message) {
    super(message);
    this.name = "ReferenceUiContractError";
  }
}

function fail(label, message) {
  throw new ReferenceUiContractError(`${label}: ${message}`);
}

function record(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(label, "expected an object");
  }
  return value;
}

function array(value, label) {
  if (!Array.isArray(value)) fail(label, "expected an array");
  return value;
}

function allowedKeys(value, allowed, label) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) fail(label, `unknown field${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}`);
}

function string(value, label, options = {}) {
  if (typeof value !== "string" || (!options.allowEmpty && value.length === 0)) {
    fail(label, "expected a non-empty string");
  }
  if (options.pattern && !options.pattern.test(value)) fail(label, `invalid value: ${value}`);
  return value;
}

function boolean(value, label) {
  if (typeof value !== "boolean") fail(label, "expected a boolean");
  return value;
}

function integer(value, label, minimum = Number.MIN_SAFE_INTEGER, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    fail(label, `expected an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

function number(value, label, minimum = -Infinity, maximum = Infinity) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    fail(label, `expected a number from ${minimum} to ${maximum}`);
  }
  return value;
}

function enumeration(value, values, label) {
  if (!values.includes(value)) fail(label, `expected one of: ${values.join(", ")}`);
  return value;
}

function uniqueById(values, label) {
  const seen = new Set();
  for (const [index, value] of values.entries()) {
    const id = string(record(value, `${label}[${index}]`).id, `${label}[${index}].id`, { pattern: ID_PATTERN });
    if (seen.has(id)) fail(`${label}[${index}].id`, `duplicate id: ${id}`);
    seen.add(id);
  }
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])]),
    );
  }
  return value;
}

export function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

export function manifestDigest(manifest) {
  return createHash("sha256").update(stableJson(manifest)).digest("hex");
}

export function normalizeRelativePath(value, label, options = {}) {
  string(value, label);
  if (options.allowDot && value === ".") return ".";
  if (path.isAbsolute(value) || path.win32.isAbsolute(value) || path.posix.isAbsolute(value)) {
    fail(label, "absolute paths are forbidden");
  }
  const normalized = value.replaceAll("\\", "/");
  const segments = normalized.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    fail(label, "path must not contain empty, current-directory, or parent-directory segments");
  }
  if (normalized.includes("\0")) fail(label, "path contains a null byte");
  return segments.join("/");
}

async function existingConfinedPath(base, relativeValue, label, kind) {
  const normalized = normalizeRelativePath(relativeValue, label);
  const candidate = path.resolve(base, ...normalized.split("/"));
  if (!(await isResolvedPathInside(base, candidate))) fail(label, "path escapes its allowed workspace");
  let details;
  try {
    details = await stat(candidate);
  } catch (error) {
    if (error.code === "ENOENT") fail(label, `path is not readable: ${relativeValue}`);
    throw error;
  }
  if (kind === "file" && !details.isFile()) fail(label, "expected a regular file");
  if (kind === "directory" && !details.isDirectory()) fail(label, "expected a directory");
  const resolved = await realpath(candidate);
  if (!(await isResolvedPathInside(base, resolved))) fail(label, "resolved path escapes its allowed workspace");
  return resolved;
}

export async function resolveReferenceContext(repositoryRoot, manifestPath) {
  let root;
  let resolvedManifest;
  try {
    root = await realpath(repositoryRoot);
  } catch (error) {
    if (error.code === "ENOENT") fail("repositoryRoot", `path is not readable: ${repositoryRoot}`);
    throw error;
  }
  try {
    resolvedManifest = await realpath(manifestPath);
  } catch (error) {
    if (error.code === "ENOENT") fail("manifestPath", `path is not readable: ${manifestPath}`);
    throw error;
  }
  if (!isPathInside(root, resolvedManifest)) fail("manifestPath", "manifest must be inside the Repository Root");

  const relative = path.relative(root, resolvedManifest);
  const segments = relative.split(path.sep);
  if (
    segments.length !== 4 ||
    segments[0].toLowerCase() !== "tasks" ||
    !TASK_ID_PATTERN.test(segments[1]) ||
    segments[2].toLowerCase() !== "reference-ui" ||
    segments[3].toLowerCase() !== "manifest.json"
  ) {
    fail("manifestPath", "expected tasks/TASK-NNN/reference-ui/manifest.json");
  }

  const workspaceRoot = path.dirname(resolvedManifest);
  if (!(await isResolvedPathInside(root, workspaceRoot))) fail("manifestPath", "reference workspace escapes the repository");
  return {
    repositoryRoot: root,
    taskId: segments[1],
    taskRoot: path.dirname(workspaceRoot),
    workspaceRoot,
    manifestPath: resolvedManifest,
  };
}

function validateTolerance(value, label) {
  const tolerance = record(value, label);
  allowedKeys(tolerance, ["colorThreshold", "maxMismatchRatio"], label);
  return {
    colorThreshold: number(tolerance.colorThreshold, `${label}.colorThreshold`, 0, 1),
    maxMismatchRatio: number(tolerance.maxMismatchRatio, `${label}.maxMismatchRatio`, 0, 1),
  };
}

function validateLocator(value, label) {
  const locator = record(value, label);
  allowedKeys(locator, ["strategy", "value", "name"], label);
  const strategy = enumeration(locator.strategy, LOCATOR_STRATEGIES, `${label}.strategy`);
  const normalized = {
    strategy,
    value: string(locator.value, `${label}.value`),
  };
  if (locator.name !== undefined) normalized.name = string(locator.name, `${label}.name`);
  if (strategy === "role" && !normalized.name) fail(`${label}.name`, "role locators require an accessible name");
  return normalized;
}

function validateStep(value, label) {
  const step = record(value, label);
  allowedKeys(step, ["action", "locator", "value", "expected", "timeoutMs"], label);
  const action = enumeration(step.action, STEP_ACTIONS, `${label}.action`);
  const needsLocator = ["click", "fill", "select", "check", "uncheck", "waitFor"].includes(action);
  const needsValue = ["fill", "press", "select"].includes(action);
  if (needsLocator && step.locator === undefined) fail(`${label}.locator`, `${action} requires a locator`);
  if (needsValue && step.value === undefined) fail(`${label}.value`, `${action} requires a value`);
  const normalized = { action };
  if (step.locator !== undefined) normalized.locator = validateLocator(step.locator, `${label}.locator`);
  if (step.value !== undefined) normalized.value = string(step.value, `${label}.value`, { allowEmpty: action === "fill" });
  if (step.expected !== undefined) normalized.expected = string(step.expected, `${label}.expected`);
  if (step.timeoutMs !== undefined) normalized.timeoutMs = integer(step.timeoutMs, `${label}.timeoutMs`, 1, 120_000);
  return normalized;
}

function validateViewport(value, label) {
  const viewport = record(value, label);
  allowedKeys(viewport, ["width", "height", "deviceScaleFactor"], label);
  return {
    width: integer(viewport.width, `${label}.width`, 1, 10_000),
    height: integer(viewport.height, `${label}.height`, 1, 10_000),
    deviceScaleFactor: number(viewport.deviceScaleFactor, `${label}.deviceScaleFactor`, 0.1, 4),
  };
}

async function validateCase(value, index, context, defaults) {
  const label = `manifest.cases[${index}]`;
  const item = record(value, label);
  allowedKeys(
    item,
    [
      "id",
      "required",
      "priority",
      "target",
      "state",
      "viewport",
      "theme",
      "locale",
      "reference",
      "tolerance",
      "regions",
      "interactions",
      "dynamicRegions",
      "allowedDeviations",
    ],
    label,
  );
  const id = string(item.id, `${label}.id`, { pattern: ID_PATTERN });
  const target = record(item.target, `${label}.target`);
  allowedKeys(target, ["kind", "identity", "route"], `${label}.target`);
  const targetKind = enumeration(target.kind, ["route", "component"], `${label}.target.kind`);
  const targetIdentity = string(target.identity, `${label}.target.identity`);
  let route;
  if (targetKind === "route") {
    route = string(target.route, `${label}.target.route`);
    if (!route.startsWith("/")) fail(`${label}.target.route`, "route targets must start with /");
  } else if (target.route !== undefined) {
    fail(`${label}.target.route`, "component targets must not declare a route");
  }

  const stateValue = record(item.state, `${label}.state`);
  allowedKeys(stateValue, ["name", "setup"], `${label}.state`);
  const setup = array(stateValue.setup, `${label}.state.setup`).map((step, stepIndex) =>
    validateStep(step, `${label}.state.setup[${stepIndex}]`),
  );
  const viewport = validateViewport(item.viewport, `${label}.viewport`);
  const theme = enumeration(item.theme, ["light", "dark", "no-preference"], `${label}.theme`);

  const reference = record(item.reference, `${label}.reference`);
  allowedKeys(reference, ["sourceKind", "source", "baselinePath", "capturedAt"], `${label}.reference`);
  const sourceKind = enumeration(reference.sourceKind, ["local", "attachment", "url"], `${label}.reference.sourceKind`);
  const source = string(reference.source, `${label}.reference.source`);
  if (sourceKind === "url") {
    try {
      new URL(source);
    } catch {
      fail(`${label}.reference.source`, "expected a valid URL");
    }
    if (reference.capturedAt === undefined || Number.isNaN(Date.parse(reference.capturedAt))) {
      fail(`${label}.reference.capturedAt`, "URL references require a captured baseline timestamp");
    }
  }
  const baselinePath = normalizeRelativePath(reference.baselinePath, `${label}.reference.baselinePath`);
  const resolvedBaseline = await existingConfinedPath(
    context.workspaceRoot,
    baselinePath,
    `${label}.reference.baselinePath`,
    "file",
  );

  const regions = array(item.regions, `${label}.regions`).map((regionValue, regionIndex) => {
    const regionLabel = `${label}.regions[${regionIndex}]`;
    const region = record(regionValue, regionLabel);
    allowedKeys(region, ["id", "priority", "locator", "tolerance"], regionLabel);
    return {
      id: string(region.id, `${regionLabel}.id`, { pattern: ID_PATTERN }),
      priority: enumeration(region.priority, PRIORITIES, `${regionLabel}.priority`),
      locator: validateLocator(region.locator, `${regionLabel}.locator`),
      tolerance: region.tolerance === undefined ? defaults : validateTolerance(region.tolerance, `${regionLabel}.tolerance`),
    };
  });
  uniqueById(regions, `${label}.regions`);

  const interactions = array(item.interactions, `${label}.interactions`).map((step, stepIndex) =>
    validateStep(step, `${label}.interactions[${stepIndex}]`),
  );
  const dynamicRegions = array(item.dynamicRegions, `${label}.dynamicRegions`).map((dynamicValue, dynamicIndex) => {
    const dynamicLabel = `${label}.dynamicRegions[${dynamicIndex}]`;
    const dynamic = record(dynamicValue, dynamicLabel);
    allowedKeys(dynamic, ["id", "strategy", "locator", "assertion"], dynamicLabel);
    const strategy = enumeration(
      dynamic.strategy,
      ["semantic", "scoped-pixel", "excluded-from-pixel"],
      `${dynamicLabel}.strategy`,
    );
    if (strategy === "semantic" && dynamic.assertion === undefined) {
      fail(`${dynamicLabel}.assertion`, "semantic dynamic regions require an assertion");
    }
    return {
      id: string(dynamic.id, `${dynamicLabel}.id`, { pattern: ID_PATTERN }),
      strategy,
      locator: validateLocator(dynamic.locator, `${dynamicLabel}.locator`),
      ...(dynamic.assertion === undefined ? {} : { assertion: string(dynamic.assertion, `${dynamicLabel}.assertion`) }),
    };
  });
  uniqueById(dynamicRegions, `${label}.dynamicRegions`);

  const allowedDeviations = array(item.allowedDeviations, `${label}.allowedDeviations`).map(
    (deviationValue, deviationIndex) => {
      const deviationLabel = `${label}.allowedDeviations[${deviationIndex}]`;
      const deviation = record(deviationValue, deviationLabel);
      allowedKeys(deviation, ["id", "description", "reason"], deviationLabel);
      return {
        id: string(deviation.id, `${deviationLabel}.id`, { pattern: ID_PATTERN }),
        description: string(deviation.description, `${deviationLabel}.description`),
        reason: string(deviation.reason, `${deviationLabel}.reason`),
      };
    },
  );
  uniqueById(allowedDeviations, `${label}.allowedDeviations`);

  const tolerance = item.tolerance === undefined ? defaults : validateTolerance(item.tolerance, `${label}.tolerance`);
  return {
    id,
    required: boolean(item.required, `${label}.required`),
    priority: enumeration(item.priority, PRIORITIES, `${label}.priority`),
    target: { kind: targetKind, identity: targetIdentity, ...(route === undefined ? {} : { route }) },
    state: { name: string(stateValue.name, `${label}.state.name`), setup },
    viewport,
    theme,
    ...(item.locale === undefined ? {} : { locale: string(item.locale, `${label}.locale`) }),
    reference: {
      sourceKind,
      source,
      baselinePath,
      ...(reference.capturedAt === undefined ? {} : { capturedAt: string(reference.capturedAt, `${label}.reference.capturedAt`) }),
    },
    tolerance,
    regions,
    interactions,
    dynamicRegions,
    allowedDeviations,
    resolvedBaseline,
  };
}

export async function validateReferenceManifest(manifestValue, options) {
  const context = options.context ?? (await resolveReferenceContext(options.repositoryRoot, options.manifestPath));
  const manifest = record(manifestValue, "manifest");
  allowedKeys(
    manifest,
    ["$schema", "schemaVersion", "taskId", "manifestVersion", "applicationRoot", "acceptancePolicy", "cases"],
    "manifest",
  );
  if (manifest.schemaVersion !== REFERENCE_UI_SCHEMA_VERSION) {
    fail("manifest.schemaVersion", `unsupported schema version: ${manifest.schemaVersion}`);
  }
  const taskId = string(manifest.taskId, "manifest.taskId", { pattern: TASK_ID_PATTERN });
  if (taskId !== context.taskId) fail("manifest.taskId", `expected ${context.taskId} from the task workspace`);
  const acceptancePolicy = validateTolerance(manifest.acceptancePolicy, "manifest.acceptancePolicy");
  const applicationRootValue = normalizeRelativePath(manifest.applicationRoot, "manifest.applicationRoot", { allowDot: true });
  const applicationRoot =
    applicationRootValue === "."
      ? context.repositoryRoot
      : path.resolve(context.repositoryRoot, ...applicationRootValue.split("/"));
  if (!(await isResolvedPathInside(context.repositoryRoot, applicationRoot))) {
    fail("manifest.applicationRoot", "Application Root escapes the Repository Root");
  }
  let applicationDetails;
  try {
    applicationDetails = await stat(applicationRoot);
  } catch (error) {
    if (error.code === "ENOENT") fail("manifest.applicationRoot", "Application Root is not readable");
    throw error;
  }
  if (!applicationDetails.isDirectory()) fail("manifest.applicationRoot", "Application Root must be a directory");

  const rawCases = array(manifest.cases, "manifest.cases");
  uniqueById(rawCases, "manifest.cases");
  const cases = [];
  for (const [index, caseValue] of rawCases.entries()) {
    cases.push(await validateCase(caseValue, index, context, acceptancePolicy));
  }
  const signatures = new Map();
  for (const item of cases) {
    const signature = stableJson({
      target: item.target,
      state: item.state.name,
      viewport: item.viewport,
      theme: item.theme,
      locale: item.locale ?? null,
    });
    if (signatures.has(signature)) {
      fail("manifest.cases", `contradictory cases ${signatures.get(signature)} and ${item.id} describe the same observable state`);
    }
    signatures.set(signature, item.id);
  }

  const normalizedManifest = {
    ...(manifest.$schema === undefined ? {} : { $schema: string(manifest.$schema, "manifest.$schema") }),
    schemaVersion: REFERENCE_UI_SCHEMA_VERSION,
    taskId,
    manifestVersion: integer(manifest.manifestVersion, "manifest.manifestVersion", 1),
    applicationRoot: applicationRootValue,
    acceptancePolicy,
    cases: cases.map(({ resolvedBaseline, ...item }) => item),
  };
  return {
    context,
    manifest: normalizedManifest,
    digest: manifestDigest(normalizedManifest),
    applicationRoot: await canonicalPath(applicationRoot),
    baselines: Object.fromEntries(cases.map((item) => [item.id, item.resolvedBaseline])),
  };
}

export async function validateReferenceManifestFile(options) {
  const context = await resolveReferenceContext(options.repositoryRoot, options.manifestPath);
  let manifest;
  try {
    manifest = JSON.parse(await readFile(context.manifestPath, "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) fail("manifest", `invalid JSON: ${error.message}`);
    throw error;
  }
  const result = await validateReferenceManifest(manifest, { ...options, context });
  await assertReferenceManifestEvidenceCompatibility(result);
  return result;
}

export async function assertReferenceManifestEvidenceCompatibility(manifestResult) {
  const validationRoot = path.join(manifestResult.context.workspaceRoot, "validation");
  let entries;
  try {
    entries = await readdir(validationRoot, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }

  const committed = entries
    .filter((entry) => entry.isDirectory() && /^iteration-[0-9]{3}$/.test(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name));
  const committedManifests = [];
  for (const entry of committed) {
    const evidencePath = path.join(validationRoot, entry.name, "evidence.json");
    let evidence;
    try {
      evidence = JSON.parse(await readFile(evidencePath, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") continue;
      if (error instanceof SyntaxError) fail(`validation.${entry.name}`, `invalid evidence JSON: ${error.message}`);
      throw error;
    }
    if (evidence.taskId !== manifestResult.manifest.taskId) continue;
    if (!Number.isInteger(evidence.manifestVersion) || evidence.manifestVersion < 1) {
      fail(`validation.${entry.name}.manifestVersion`, "invalid committed manifest version");
    }
    if (typeof evidence.manifestDigest !== "string" || !DIGEST_PATTERN.test(evidence.manifestDigest)) {
      fail(`validation.${entry.name}.manifestDigest`, "invalid committed manifest digest");
    }
    committedManifests.push({
      manifestVersion: evidence.manifestVersion,
      manifestDigest: evidence.manifestDigest,
    });
  }
  if (committedManifests.length === 0) return;

  const currentVersion = manifestResult.manifest.manifestVersion;
  const maximumCommittedVersion = Math.max(...committedManifests.map((item) => item.manifestVersion));
  const digestsByVersion = new Map();
  for (const item of committedManifests) {
    const digests = digestsByVersion.get(item.manifestVersion) ?? new Set();
    digests.add(item.manifestDigest);
    digestsByVersion.set(item.manifestVersion, digests);
  }
  for (const [version, digests] of digestsByVersion) {
    if (digests.size > 1) {
      fail(
        "manifest.manifestVersion",
        `committed evidence contains multiple digests for manifest version ${version}`,
      );
    }
  }
  if (currentVersion < maximumCommittedVersion) {
    fail(
      "manifest.manifestVersion",
      `version ${currentVersion} is lower than maximum committed version ${maximumCommittedVersion}`,
    );
  }
  const sameVersionDigests = digestsByVersion.get(currentVersion) ?? new Set();
  if (sameVersionDigests.size > 0 && !sameVersionDigests.has(manifestResult.digest)) {
    fail(
      "manifest.manifestVersion",
      `version ${currentVersion} already has committed evidence for a different manifest digest; a digest change requires a version greater than ${maximumCommittedVersion}`,
    );
  }
}

function normalizeArtifact(value, label) {
  const artifact = record(value, label);
  allowedKeys(artifact, ["kind", "path"], label);
  return {
    kind: enumeration(artifact.kind, ARTIFACT_KINDS, `${label}.kind`),
    path: normalizeRelativePath(artifact.path, `${label}.path`),
  };
}

function validateArtifactScope(artifact, label, caseId, regionId = null) {
  const prefix =
    regionId === null
      ? `cases/${caseId}/`
      : `cases/${caseId}/regions/${regionId}/`;
  if (!artifact.path.startsWith(prefix)) {
    fail(`${label}.path`, `expected a path scoped under ${prefix}`);
  }
  const relativeArtifactPath = artifact.path.slice(prefix.length);
  if (relativeArtifactPath.includes("/")) {
    fail(`${label}.path`, `artifact must be stored directly in ${prefix}`);
  }
  const allowedKinds = regionId === null
    ? ["current", "diff", "snapshot", "console", "network"]
    : ["region-current", "region-diff"];
  if (!allowedKinds.includes(artifact.kind)) {
    fail(`${label}.kind`, `expected one of: ${allowedKinds.join(", ")}`);
  }
  return artifact;
}

function requireArtifactKinds(artifacts, requiredKinds, label) {
  const kinds = new Set(artifacts.map((artifact) => artifact.kind));
  const missing = requiredKinds.filter((kind) => !kinds.has(kind));
  if (missing.length > 0) fail(label, `visual PASS/FAIL requires artifact kinds: ${requiredKinds.join(", ")}`);
}

function normalizeExecutedSteps(value, label, expectedSteps) {
  const executions = array(value, label);
  if (executions.length !== expectedSteps.length) {
    fail(label, `expected exactly ${expectedSteps.length} executed manifest step${expectedSteps.length === 1 ? "" : "s"}`);
  }
  return executions.map((executionValue, index) => {
    const executionLabel = `${label}[${index}]`;
    const execution = record(executionValue, executionLabel);
    allowedKeys(
      execution,
      ["sequence", "action", "locator", "value", "expected", "timeoutMs", "status", "observation"],
      executionLabel,
    );
    const descriptor = validateStep(
      Object.fromEntries(
        ["action", "locator", "value", "expected", "timeoutMs"]
          .filter((key) => execution[key] !== undefined)
          .map((key) => [key, execution[key]]),
      ),
      executionLabel,
    );
    if (stableJson(descriptor) !== stableJson(expectedSteps[index])) {
      fail(executionLabel, `does not match manifest step ${index + 1}`);
    }
    const sequence = integer(execution.sequence, `${executionLabel}.sequence`, 1);
    if (sequence !== index + 1) fail(`${executionLabel}.sequence`, `expected ${index + 1}`);
    return {
      sequence,
      ...descriptor,
      status: enumeration(execution.status, STEP_EXECUTION_STATUSES, `${executionLabel}.status`),
      observation: string(execution.observation, `${executionLabel}.observation`),
    };
  });
}

export function normalizeVisualMeasurement(value, label, tolerance) {
  const measurement = record(value, label);
  allowedKeys(
    measurement,
    [
      "differentPixels",
      "totalPixels",
      "mismatchPercentage",
      "mismatchRatio",
      "colorThreshold",
      "maxMismatchRatio",
      "match",
      "dimensionMismatch",
    ],
    label,
  );
  const differentPixels = integer(measurement.differentPixels, `${label}.differentPixels`, 0);
  const totalPixels = integer(measurement.totalPixels, `${label}.totalPixels`, 1);
  if (differentPixels > totalPixels) fail(`${label}.differentPixels`, "cannot exceed totalPixels");
  const mismatchPercentage = number(measurement.mismatchPercentage, `${label}.mismatchPercentage`, 0, 100);
  const mismatchRatio = differentPixels / totalPixels;
  // agent-browser reports a percentage, while acceptance policy uses a ratio.
  // Allow percentage rounding to two decimal places but derive the stored ratio
  // from the exact pixel counts so verdict math remains deterministic.
  if (Math.abs(mismatchPercentage - mismatchRatio * 100) > 0.01) {
    fail(label, "mismatchPercentage is inconsistent with differentPixels and totalPixels");
  }
  if (measurement.mismatchRatio !== undefined) {
    const declaredRatio = number(measurement.mismatchRatio, `${label}.mismatchRatio`, 0, 1);
    if (Math.abs(declaredRatio - mismatchRatio) > 1e-9) {
      fail(`${label}.mismatchRatio`, "is inconsistent with differentPixels and totalPixels");
    }
  }
  if (measurement.colorThreshold !== undefined && measurement.colorThreshold !== tolerance.colorThreshold) {
    fail(`${label}.colorThreshold`, `expected manifest threshold ${tolerance.colorThreshold}`);
  }
  if (measurement.maxMismatchRatio !== undefined && measurement.maxMismatchRatio !== tolerance.maxMismatchRatio) {
    fail(`${label}.maxMismatchRatio`, `expected manifest tolerance ${tolerance.maxMismatchRatio}`);
  }
  if (typeof measurement.match !== "boolean") fail(`${label}.match`, "expected a boolean from screenshot diff output");
  if (measurement.dimensionMismatch !== null && (typeof measurement.dimensionMismatch !== "object" || Array.isArray(measurement.dimensionMismatch))) {
    fail(`${label}.dimensionMismatch`, "expected null or an object");
  }
  return {
    differentPixels,
    totalPixels,
    mismatchPercentage,
    mismatchRatio,
    colorThreshold: tolerance.colorThreshold,
    maxMismatchRatio: tolerance.maxMismatchRatio,
    match: measurement.match,
    dimensionMismatch: measurement.dimensionMismatch,
  };
}

function validateAxes(value, label) {
  const axes = record(value, label);
  allowedKeys(axes, REFERENCE_UI_AXES, label);
  return Object.fromEntries(
    REFERENCE_UI_AXES.map((axis) => [axis, enumeration(axes[axis], REFERENCE_UI_AXIS_STATUSES, `${label}.${axis}`)]),
  );
}

function measurementsPass(measurement) {
  return measurement.dimensionMismatch === null && measurement.mismatchRatio <= measurement.maxMismatchRatio;
}

function validateFinding(value, index, manifestCases, artifactPaths) {
  const label = `evidence.findings[${index}]`;
  const finding = record(value, label);
  allowedKeys(
    finding,
    ["findingId", "caseId", "regionId", "axis", "severity", "expected", "actual", "evidence", "correctionTarget"],
    label,
  );
  const caseId = string(finding.caseId, `${label}.caseId`);
  const manifestCase = manifestCases.get(caseId);
  if (!manifestCase) fail(`${label}.caseId`, `unknown case: ${caseId}`);
  const regionId = finding.regionId === null ? null : string(finding.regionId, `${label}.regionId`, { pattern: ID_PATTERN });
  if (regionId !== null) {
    const knownRegions = new Set([
      ...manifestCase.regions.map((item) => item.id),
      ...manifestCase.dynamicRegions.map((item) => item.id),
    ]);
    if (!knownRegions.has(regionId)) fail(`${label}.regionId`, `unknown region: ${regionId}`);
  }
  const axis = enumeration(finding.axis, REFERENCE_UI_AXES, `${label}.axis`);
  const expectedId = `${caseId}:${regionId ?? "surface"}:${axis}`;
  const findingId = string(finding.findingId, `${label}.findingId`);
  if (findingId !== expectedId) fail(`${label}.findingId`, `expected stable id ${expectedId}`);
  const rawSupportingEvidence = array(finding.evidence, `${label}.evidence`);
  if (rawSupportingEvidence.length === 0) {
    fail(`${label}.evidence`, "expected at least one supporting artifact");
  }
  const supportingEvidence = rawSupportingEvidence.map((item, evidenceIndex) => {
    const artifactPath = normalizeRelativePath(item, `${label}.evidence[${evidenceIndex}]`);
    if (!artifactPaths.has(artifactPath)) fail(`${label}.evidence[${evidenceIndex}]`, "path is not declared as an artifact");
    const casePrefix = `cases/${caseId}/`;
    const regionPrefix = regionId === null ? null : `${casePrefix}regions/${regionId}/`;
    if (regionPrefix !== null && !artifactPath.startsWith(regionPrefix)) {
      fail(`${label}.evidence[${evidenceIndex}]`, `expected region-scoped evidence under ${regionPrefix}`);
    }
    if (regionPrefix === null && (!artifactPath.startsWith(casePrefix) || artifactPath.startsWith(`${casePrefix}regions/`))) {
      fail(`${label}.evidence[${evidenceIndex}]`, `expected case-scoped evidence under ${casePrefix}`);
    }
    return artifactPath;
  });
  return {
    findingId,
    caseId,
    regionId,
    axis,
    severity: enumeration(finding.severity, ["critical", "high", "medium", "low"], `${label}.severity`),
    expected: string(finding.expected, `${label}.expected`),
    actual: string(finding.actual, `${label}.actual`),
    evidence: supportingEvidence,
    correctionTarget: string(finding.correctionTarget, `${label}.correctionTarget`),
  };
}

function sameViewport(left, right) {
  return (
    left.width === right.width &&
    left.height === right.height &&
    left.deviceScaleFactor === right.deviceScaleFactor
  );
}

export function normalizeReferenceEvidenceDraft(draftValue, manifestResult) {
  const draft = record(draftValue, "evidence");
  allowedKeys(
    draft,
    [
      "$schema",
      "schemaVersion",
      "taskId",
      "manifestVersion",
      "manifestDigest",
      "iteration",
      "applicationUrl",
      "browser",
      "cases",
      "findings",
      "passedCases",
      "changes",
      "verdict",
    ],
    "evidence",
  );
  if (draft.schemaVersion !== REFERENCE_UI_SCHEMA_VERSION) {
    fail("evidence.schemaVersion", `unsupported schema version: ${draft.schemaVersion}`);
  }
  if (draft.taskId !== manifestResult.manifest.taskId) fail("evidence.taskId", "does not match the manifest");
  if (draft.manifestVersion !== manifestResult.manifest.manifestVersion) {
    fail("evidence.manifestVersion", "does not match the manifest");
  }
  const declaredManifestDigest = string(draft.manifestDigest, "evidence.manifestDigest", { pattern: DIGEST_PATTERN });
  if (declaredManifestDigest !== DRAFT_DIGEST_PLACEHOLDER && declaredManifestDigest !== manifestResult.digest) {
    fail("evidence.manifestDigest", "does not match the manifest content");
  }
  try {
    const parsedUrl = new URL(string(draft.applicationUrl, "evidence.applicationUrl"));
    if (!parsedUrl.protocol) fail("evidence.applicationUrl", "expected an absolute URL");
  } catch (error) {
    if (error instanceof ReferenceUiContractError) throw error;
    fail("evidence.applicationUrl", "expected an absolute URL");
  }

  const browser = record(draft.browser, "evidence.browser");
  allowedKeys(browser, ["session", "capability", "version"], "evidence.browser");
  const normalizedBrowser = {
    session: string(browser.session, "evidence.browser.session", { pattern: SESSION_PATTERN }),
    capability: enumeration(browser.capability, ["agent-browser"], "evidence.browser.capability"),
    version: string(browser.version, "evidence.browser.version"),
  };

  const manifestCases = new Map(manifestResult.manifest.cases.map((item) => [item.id, item]));
  const rawCases = array(draft.cases, "evidence.cases");
  const seenCases = new Set();
  const artifactPaths = new Set();
  const cases = rawCases.map((caseValue, caseIndex) => {
    const label = `evidence.cases[${caseIndex}]`;
    const item = record(caseValue, label);
    allowedKeys(
      item,
      ["caseId", "required", "route", "state", "viewport", "setup", "interactions", "axes", "blockedReasons", "measurements", "artifacts", "regions", "observations"],
      label,
    );
    const caseId = string(item.caseId, `${label}.caseId`);
    if (seenCases.has(caseId)) fail(`${label}.caseId`, `duplicate case evidence: ${caseId}`);
    seenCases.add(caseId);
    const manifestCase = manifestCases.get(caseId);
    if (!manifestCase) fail(`${label}.caseId`, `unknown manifest case: ${caseId}`);
    if (item.required !== manifestCase.required) fail(`${label}.required`, "does not match the manifest");
    const expectedRoute = manifestCase.target.route ?? null;
    if (item.route !== expectedRoute) fail(`${label}.route`, "does not match the manifest target");
    if (item.state !== manifestCase.state.name) fail(`${label}.state`, "does not match the manifest state");
    const viewport = validateViewport(item.viewport, `${label}.viewport`);
    if (!sameViewport(viewport, manifestCase.viewport)) fail(`${label}.viewport`, "does not match the manifest viewport");
    const axes = validateAxes(item.axes, `${label}.axes`);
    if (axes.visual === "NOT-APPLICABLE") {
      fail(`${label}.axes.visual`, "a declared reference case must be PASS, FAIL, or BLOCKED on the visual axis");
    }
    const setup = normalizeExecutedSteps(item.setup, `${label}.setup`, manifestCase.state.setup);
    const interactions = normalizeExecutedSteps(item.interactions, `${label}.interactions`, manifestCase.interactions);
    const executedSteps = [...setup, ...interactions];
    if (executedSteps.some((step) => step.status === "BLOCKED")) axes.behavior = "BLOCKED";
    else if (executedSteps.some((step) => step.status === "FAIL")) axes.behavior = "FAIL";

    const artifacts = array(item.artifacts, `${label}.artifacts`).map((artifact, artifactIndex) => {
      const artifactLabel = `${label}.artifacts[${artifactIndex}]`;
      return validateArtifactScope(normalizeArtifact(artifact, artifactLabel), artifactLabel, caseId);
    });
    if (["PASS", "FAIL"].includes(axes.visual)) {
      requireArtifactKinds(artifacts, ["current", "diff"], `${label}.artifacts`);
    }
    for (const artifact of artifacts) {
      if (artifactPaths.has(artifact.path)) fail(`${label}.artifacts`, `duplicate artifact path: ${artifact.path}`);
      artifactPaths.add(artifact.path);
    }

    const measurementsValue = record(item.measurements, `${label}.measurements`);
    allowedKeys(measurementsValue, ["visual"], `${label}.measurements`);
    let visualMeasurement;
    if (["PASS", "FAIL"].includes(axes.visual)) {
      if (measurementsValue.visual === undefined) fail(`${label}.measurements.visual`, "visual PASS/FAIL requires screenshot diff measurements");
      visualMeasurement = normalizeVisualMeasurement(
        measurementsValue.visual,
        `${label}.measurements.visual`,
        manifestCase.tolerance,
      );
    } else if (measurementsValue.visual !== undefined) {
      fail(`${label}.measurements.visual`, "visual measurements are not allowed for BLOCKED or NOT-APPLICABLE axes");
    }

    const rawRegions = array(item.regions, `${label}.regions`);
    const manifestRegions = new Map(manifestCase.regions.map((region) => [region.id, region]));
    const seenRegions = new Set();
    const regions = rawRegions.map((regionValue, regionIndex) => {
      const regionLabel = `${label}.regions[${regionIndex}]`;
      const region = record(regionValue, regionLabel);
      allowedKeys(region, ["regionId", "measurement", "artifacts"], regionLabel);
      const regionId = string(region.regionId, `${regionLabel}.regionId`, { pattern: ID_PATTERN });
      if (seenRegions.has(regionId)) fail(`${regionLabel}.regionId`, `duplicate region evidence: ${regionId}`);
      seenRegions.add(regionId);
      const manifestRegion = manifestRegions.get(regionId);
      if (!manifestRegion) fail(`${regionLabel}.regionId`, `unknown manifest region: ${regionId}`);
      const regionArtifacts = array(region.artifacts, `${regionLabel}.artifacts`).map((artifact, artifactIndex) => {
        const artifactLabel = `${regionLabel}.artifacts[${artifactIndex}]`;
        return validateArtifactScope(normalizeArtifact(artifact, artifactLabel), artifactLabel, caseId, regionId);
      });
      requireArtifactKinds(regionArtifacts, ["region-current", "region-diff"], `${regionLabel}.artifacts`);
      for (const artifact of regionArtifacts) {
        if (artifactPaths.has(artifact.path)) fail(`${regionLabel}.artifacts`, `duplicate artifact path: ${artifact.path}`);
        artifactPaths.add(artifact.path);
      }
      return {
        regionId,
        measurement: normalizeVisualMeasurement(region.measurement, `${regionLabel}.measurement`, manifestRegion.tolerance),
        artifacts: regionArtifacts,
      };
    });
    if (["PASS", "FAIL"].includes(axes.visual) && seenRegions.size !== manifestRegions.size) {
      fail(`${label}.regions`, "visual PASS/FAIL requires evidence for every declared region");
    }

    if (visualMeasurement) {
      const visualPasses = measurementsPass(visualMeasurement) && regions.every((region) => measurementsPass(region.measurement));
      axes.visual = visualPasses ? "PASS" : "FAIL";
    }
    const blockedReasonsValue = record(item.blockedReasons, `${label}.blockedReasons`);
    allowedKeys(blockedReasonsValue, REFERENCE_UI_AXES, `${label}.blockedReasons`);
    const blockedReasons = {};
    for (const axis of REFERENCE_UI_AXES) {
      if (axes[axis] === "BLOCKED") {
        const reason = string(blockedReasonsValue[axis], `${label}.blockedReasons.${axis}`);
        if (reason.trim().length === 0) fail(`${label}.blockedReasons.${axis}`, "expected a concrete non-blank reason");
        blockedReasons[axis] = reason;
      } else if (blockedReasonsValue[axis] !== undefined) {
        fail(`${label}.blockedReasons.${axis}`, `reason is allowed only when ${axis} is BLOCKED`);
      }
    }
    return {
      caseId,
      required: manifestCase.required,
      route: expectedRoute,
      state: manifestCase.state.name,
      viewport,
      setup,
      interactions,
      axes,
      blockedReasons,
      measurements: visualMeasurement ? { visual: visualMeasurement } : {},
      artifacts,
      regions,
      observations: array(item.observations, `${label}.observations`).map((value, observationIndex) =>
        string(value, `${label}.observations[${observationIndex}]`),
      ),
    };
  });
  if (seenCases.size !== manifestCases.size) fail("evidence.cases", "evidence must contain every manifest case exactly once");

  const findings = array(draft.findings, "evidence.findings").map((finding, index) =>
    validateFinding(finding, index, manifestCases, artifactPaths),
  );
  const findingIds = new Set();
  const caseEvidenceById = new Map(cases.map((item) => [item.caseId, item]));
  for (const finding of findings) {
    if (findingIds.has(finding.findingId)) fail("evidence.findings", `duplicate finding id: ${finding.findingId}`);
    findingIds.add(finding.findingId);
    const axisStatus = caseEvidenceById.get(finding.caseId).axes[finding.axis];
    if (axisStatus !== "FAIL") {
      fail(
        "evidence.findings",
        `actionable finding ${finding.findingId} requires ${finding.caseId}:${finding.axis} to be FAIL, got ${axisStatus}`,
      );
    }
  }
  for (const caseEvidence of cases) {
    for (const axis of REFERENCE_UI_AXES) {
      if (
        caseEvidence.axes[axis] === "FAIL" &&
        !findings.some((finding) => finding.caseId === caseEvidence.caseId && finding.axis === axis)
      ) {
        fail("evidence.findings", `missing actionable finding for ${caseEvidence.caseId}:${axis}`);
      }
    }
  }

  const passedCases = cases
    .filter((item) => REFERENCE_UI_AXES.every((axis) => ["PASS", "NOT-APPLICABLE"].includes(item.axes[axis])))
    .map((item) => item.caseId)
    .sort();
  const requiredCases = cases.filter((item) => item.required);
  let verdict;
  if (manifestResult.manifest.cases.length === 0) {
    verdict = { status: "NOT-APPLICABLE", reason: "The manifest contains no reference-verifiable UI cases." };
  } else if (requiredCases.some((item) => REFERENCE_UI_AXES.some((axis) => item.axes[axis] === "BLOCKED"))) {
    verdict = { status: "BLOCKED", reason: "At least one required reference case is blocked." };
  } else if (requiredCases.some((item) => REFERENCE_UI_AXES.some((axis) => item.axes[axis] === "FAIL"))) {
    verdict = { status: "FAIL", reason: "At least one required reference case failed an applicable axis." };
  } else {
    verdict = { status: "PASS", reason: "Every required reference case passed every applicable axis." };
  }

  return {
    ...(draft.$schema === undefined
      ? { $schema: "../../../../../toolchain/schemas/reference-validation.schema.json" }
      : { $schema: string(draft.$schema, "evidence.$schema") }),
    schemaVersion: REFERENCE_UI_SCHEMA_VERSION,
    taskId: manifestResult.manifest.taskId,
    manifestVersion: manifestResult.manifest.manifestVersion,
    manifestDigest: manifestResult.digest,
    iteration: integer(draft.iteration, "evidence.iteration", 1, 999),
    applicationUrl: draft.applicationUrl,
    browser: normalizedBrowser,
    cases,
    findings,
    passedCases,
    changes: { new: [], resolved: [], unchanged: [], regressed: [] },
    verdict,
  };
}

export function classifyReferenceFindings(previousEvidence, currentEvidence) {
  if (!previousEvidence) {
    return {
      new: currentEvidence.findings.map((item) => item.findingId).sort(),
      resolved: [],
      unchanged: [],
      regressed: [],
    };
  }
  for (const field of ["taskId", "manifestVersion", "manifestDigest"]) {
    if (previousEvidence[field] !== currentEvidence[field]) fail("evidence.changes", `previous ${field} is incompatible`);
  }
  const previousFindings = new Set(previousEvidence.findings.map((item) => item.findingId));
  const currentFindings = new Set(currentEvidence.findings.map((item) => item.findingId));
  const previouslyPassed = new Set(previousEvidence.passedCases);
  const changes = { new: [], resolved: [], unchanged: [], regressed: [] };
  for (const finding of currentEvidence.findings) {
    if (previousFindings.has(finding.findingId)) changes.unchanged.push(finding.findingId);
    else if (previouslyPassed.has(finding.caseId)) changes.regressed.push(finding.findingId);
    else changes.new.push(finding.findingId);
  }
  for (const finding of previousEvidence.findings) {
    if (!currentFindings.has(finding.findingId)) changes.resolved.push(finding.findingId);
  }
  for (const values of Object.values(changes)) values.sort();
  return changes;
}

export function collectReferenceArtifactPaths(evidence) {
  const paths = [];
  for (const item of evidence.cases) {
    paths.push(...item.artifacts.map((artifact) => artifact.path));
    for (const region of item.regions) paths.push(...region.artifacts.map((artifact) => artifact.path));
  }
  return [...new Set(paths)].sort();
}
