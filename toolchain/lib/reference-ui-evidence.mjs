import { constants } from "node:fs";
import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { canonicalPath, isPathInside, isResolvedPathInside } from "./cache.mjs";
import {
  ReferenceUiContractError,
  classifyReferenceFindings,
  collectReferenceArtifactPaths,
  normalizeReferenceEvidenceDraft,
  validateReferenceManifestFile,
} from "./reference-ui-contract.mjs";

function evidenceError(label, message) {
  throw new ReferenceUiContractError(`${label}: ${message}`);
}

async function readJson(file, label) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") evidenceError(label, `path is not readable: ${file}`);
    if (error instanceof SyntaxError) evidenceError(label, `invalid JSON: ${error.message}`);
    throw error;
  }
}

async function resolveStagingDraft(manifestResult, draftPath) {
  let resolvedDraft;
  try {
    resolvedDraft = await realpath(draftPath);
  } catch (error) {
    if (error.code === "ENOENT") evidenceError("draftPath", `path is not readable: ${draftPath}`);
    throw error;
  }
  const stagingBase = await canonicalPath(path.join(manifestResult.context.workspaceRoot, ".staging"));
  if (!isPathInside(stagingBase, resolvedDraft) || !(await isResolvedPathInside(stagingBase, resolvedDraft))) {
    evidenceError("draftPath", "draft evidence must stay inside reference-ui/.staging/<owned-session>/");
  }
  const relative = path.relative(stagingBase, resolvedDraft).split(path.sep);
  if (relative.length !== 2 || relative[1].toLowerCase() !== "evidence.json") {
    evidenceError("draftPath", "expected reference-ui/.staging/<owned-session>/evidence.json");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(relative[0])) {
    evidenceError("draftPath", `invalid owned session directory: ${relative[0]}`);
  }
  const stagingRoot = path.dirname(resolvedDraft);
  if (!(await isResolvedPathInside(manifestResult.context.workspaceRoot, stagingRoot))) {
    evidenceError("draftPath", "resolved staging directory escapes the task workspace");
  }
  return { draftPath: resolvedDraft, session: relative[0], stagingRoot };
}

async function resolveArtifactSource(stagingRoot, artifactPath) {
  if (!artifactPath.startsWith("cases/")) {
    evidenceError("evidence.artifacts", `artifact paths must start with cases/: ${artifactPath}`);
  }
  const candidate = path.resolve(stagingRoot, ...artifactPath.split("/"));
  if (!(await isResolvedPathInside(stagingRoot, candidate))) {
    evidenceError("evidence.artifacts", `artifact escapes the owned staging directory: ${artifactPath}`);
  }
  let details;
  try {
    details = await stat(candidate);
  } catch (error) {
    if (error.code === "ENOENT") evidenceError("evidence.artifacts", `artifact is not readable: ${artifactPath}`);
    throw error;
  }
  if (!details.isFile()) evidenceError("evidence.artifacts", `artifact is not a regular file: ${artifactPath}`);
  const resolved = await realpath(candidate);
  if (!(await isResolvedPathInside(stagingRoot, resolved))) {
    evidenceError("evidence.artifacts", `resolved artifact escapes the owned staging directory: ${artifactPath}`);
  }
  return resolved;
}

function iterationDirectory(iteration) {
  return `iteration-${String(iteration).padStart(3, "0")}`;
}

async function latestCompatibleEvidence(validationRoot, currentEvidence) {
  let entries;
  try {
    entries = await readdir(validationRoot, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
  const candidates = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ entry, match: entry.name.match(/^iteration-([0-9]{3})$/) }))
    .filter((item) => item.match)
    .map((item) => ({ name: item.entry.name, iteration: Number(item.match[1]) }))
    .filter((item) => item.iteration < currentEvidence.iteration)
    .sort((left, right) => right.iteration - left.iteration);

  for (const candidate of candidates) {
    const file = path.join(validationRoot, candidate.name, "evidence.json");
    let evidence;
    try {
      evidence = JSON.parse(await readFile(file, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT" || error instanceof SyntaxError) continue;
      throw error;
    }
    if (
      evidence.taskId === currentEvidence.taskId &&
      evidence.manifestVersion === currentEvidence.manifestVersion &&
      evidence.manifestDigest === currentEvidence.manifestDigest
    ) {
      return evidence;
    }
  }
  return undefined;
}

async function committedIterations(validationRoot) {
  let entries;
  try {
    entries = await readdir(validationRoot, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const committed = [];
  for (const entry of entries) {
    const match = entry.isDirectory() ? entry.name.match(/^iteration-([0-9]{3})$/) : null;
    if (!match) continue;
    try {
      const details = await stat(path.join(validationRoot, entry.name, "evidence.json"));
      if (details.isFile()) committed.push(Number(match[1]));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return committed.sort((left, right) => left - right);
}

export async function finalizeReferenceValidation(options) {
  const manifestResult = await validateReferenceManifestFile({
    repositoryRoot: options.repositoryRoot,
    manifestPath: options.manifestPath,
  });
  const staging = await resolveStagingDraft(manifestResult, options.draftPath);
  const draft = await readJson(staging.draftPath, "draftPath");
  const evidence = normalizeReferenceEvidenceDraft(draft, manifestResult);
  if (evidence.browser.session !== staging.session) {
    evidenceError("evidence.browser.session", `expected owned staging session ${staging.session}`);
  }

  const validationRoot = path.join(manifestResult.context.workspaceRoot, "validation");
  if (!(await isResolvedPathInside(manifestResult.context.workspaceRoot, validationRoot))) {
    evidenceError("validation", "validation directory escapes the task workspace");
  }
  await mkdir(validationRoot, { recursive: true });
  if (!(await isResolvedPathInside(manifestResult.context.workspaceRoot, validationRoot))) {
    evidenceError("validation", "resolved validation directory escapes the task workspace");
  }

  const previousEvidence = await latestCompatibleEvidence(validationRoot, evidence);
  evidence.changes = classifyReferenceFindings(previousEvidence, evidence);
  const targetRoot = path.join(validationRoot, iterationDirectory(evidence.iteration));
  if (!(await isResolvedPathInside(manifestResult.context.workspaceRoot, targetRoot))) {
    evidenceError("evidence.iteration", "iteration target escapes the task workspace");
  }
  try {
    await stat(targetRoot);
    evidenceError("evidence.iteration", `${iterationDirectory(evidence.iteration)} already exists; evidence is append-only`);
  } catch (error) {
    if (error instanceof ReferenceUiContractError) throw error;
    if (error.code !== "ENOENT") throw error;
  }
  const existingIterations = await committedIterations(validationRoot);
  const expectedIteration = (existingIterations.at(-1) ?? 0) + 1;
  if (evidence.iteration !== expectedIteration) {
    evidenceError("evidence.iteration", `expected next append-only iteration ${expectedIteration}`);
  }

  const artifactPaths = collectReferenceArtifactPaths(evidence);
  const artifactSources = new Map();
  for (const artifactPath of artifactPaths) {
    artifactSources.set(artifactPath, await resolveArtifactSource(staging.stagingRoot, artifactPath));
  }

  const temporaryRoot = path.join(
    validationRoot,
    `.${iterationDirectory(evidence.iteration)}-${randomUUID()}.tmp`,
  );
  if (!(await isResolvedPathInside(validationRoot, temporaryRoot))) {
    evidenceError("evidence.iteration", "temporary iteration directory escapes validation");
  }
  let temporaryCreated = false;
  try {
    await mkdir(temporaryRoot, { recursive: false });
    temporaryCreated = true;

    for (const artifactPath of artifactPaths) {
      const destination = path.join(temporaryRoot, ...artifactPath.split("/"));
      if (!(await isResolvedPathInside(temporaryRoot, destination))) {
        evidenceError("evidence.artifacts", `artifact destination escapes the iteration: ${artifactPath}`);
      }
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(artifactSources.get(artifactPath), destination, constants.COPYFILE_EXCL);
    }

    const temporaryEvidencePath = path.join(temporaryRoot, "evidence.json");
    await writeFile(temporaryEvidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    try {
      await rename(temporaryRoot, targetRoot);
      temporaryCreated = false;
    } catch (error) {
      if (["EEXIST", "ENOTEMPTY", "EPERM"].includes(error.code)) {
        evidenceError("evidence.iteration", `${iterationDirectory(evidence.iteration)} already exists; evidence is append-only`);
      }
      throw error;
    }
  } catch (error) {
    if (temporaryCreated) await rm(temporaryRoot, { force: true, recursive: true });
    throw error;
  }

  let cleanupWarning = null;
  if (!options.keepStaging) {
    try {
      await (options.removeStaging ?? rm)(staging.stagingRoot, { force: true, recursive: true });
    } catch (error) {
      const cleanupMessage = error instanceof Error ? error.message : String(error);
      cleanupWarning = {
        code: "STAGING_CLEANUP_FAILED",
        path: staging.stagingRoot,
        message: `Iteration ${iterationDirectory(evidence.iteration)} is committed, but staging cleanup failed: ${cleanupMessage}`,
      };
    }
  }
  return {
    evidence,
    evidencePath: path.join(targetRoot, "evidence.json"),
    iterationRoot: targetRoot,
    cleanupWarning,
  };
}
