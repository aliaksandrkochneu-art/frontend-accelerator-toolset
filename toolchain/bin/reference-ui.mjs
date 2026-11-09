#!/usr/bin/env node

import path from "node:path";
import { pathToFileURL } from "node:url";
import { finalizeReferenceValidation } from "../lib/reference-ui-evidence.mjs";
import { validateReferenceManifestFile } from "../lib/reference-ui-contract.mjs";
import { findGitRoot } from "../lib/repository.mjs";

function usage() {
  return [
    "Usage:",
    "  reference-ui validate-manifest <manifest> [--json]",
    "  reference-ui finalize-validation --manifest <manifest> --draft <evidence-draft> [--keep-staging] [--json]",
  ].join("\n");
}

function flagValue(args, name) {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1] || args[index + 1].startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return args[index + 1];
}

function printableValidation(result) {
  return {
    status: "VALID",
    taskId: result.manifest.taskId,
    manifestVersion: result.manifest.manifestVersion,
    manifestDigest: result.digest,
    applicationRoot: result.applicationRoot,
    cases: result.manifest.cases.map((item) => item.id),
  };
}

export async function runReferenceUiCli(options = {}) {
  const args = options.args ?? process.argv.slice(2);
  const stdout = options.stdout ?? process.stdout;
  const cwd = options.cwd ?? process.cwd();
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    stdout.write(`${usage()}\n`);
    return 0;
  }

  const repositoryRoot = options.repositoryRoot ?? (await findGitRoot(cwd));
  const command = args[0];
  const json = args.includes("--json");
  if (command === "validate-manifest") {
    const manifestArg = args[1];
    if (!manifestArg || manifestArg.startsWith("--")) throw new Error("validate-manifest requires a manifest path");
    const result = await validateReferenceManifestFile({
      repositoryRoot,
      manifestPath: path.resolve(cwd, manifestArg),
    });
    const output = printableValidation(result);
    stdout.write(`${json ? JSON.stringify(output) : `VALID ${output.taskId} manifest v${output.manifestVersion} ${output.manifestDigest}`}\n`);
    return 0;
  }

  if (command === "finalize-validation") {
    const result = await finalizeReferenceValidation({
      repositoryRoot,
      manifestPath: path.resolve(cwd, flagValue(args, "--manifest")),
      draftPath: path.resolve(cwd, flagValue(args, "--draft")),
      keepStaging: args.includes("--keep-staging"),
    });
    const output = {
      status: result.evidence.verdict.status,
      evidencePath: result.evidencePath,
      iteration: result.evidence.iteration,
      changes: result.evidence.changes,
      cleanupWarning: result.cleanupWarning,
    };
    const humanOutput = output.cleanupWarning
      ? `${output.status} ${output.evidencePath}\nWARNING ${output.cleanupWarning.message}`
      : `${output.status} ${output.evidencePath}`;
    stdout.write(`${json ? JSON.stringify(output) : humanOutput}\n`);
    return 0;
  }

  throw new Error(`Unknown reference-ui command: ${command}\n${usage()}`);
}

async function main() {
  try {
    process.exitCode = await runReferenceUiCli();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

const invokedAsScript = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedAsScript) await main();
