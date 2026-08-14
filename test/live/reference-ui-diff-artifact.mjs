import { readFile, writeFile } from "node:fs/promises";

function diagnosticContext(options) {
  return [
    `iteration=${options.iteration}`,
    `case=${options.caseId}`,
    `region=${options.regionId ?? "<whole-surface>"}`,
    `output=${options.requestedOutputRelativePath}`,
    `measurement=${JSON.stringify(options.measurement)}`,
  ].join(", ");
}

function isExactMatch(measurement) {
  return measurement.match === true
    && measurement.differentPixels === 0
    && !measurement.dimensionMismatch;
}

export async function materializeReferenceUiDiffArtifact(options) {
  try {
    await readFile(options.requestedOutputPath);
    return {
      kind: options.artifactKind,
      path: options.requestedOutputRelativePath,
    };
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw new Error(
        `Reference UI diff output is not readable (${diagnosticContext(options)}): ${error.message}`,
        { cause: error },
      );
    }
  }

  if (!isExactMatch(options.measurement)) {
    throw new Error(`Reference UI diff output is missing (${diagnosticContext(options)})`);
  }

  const reportPath = options.requestedOutputPath.replace(/\.png$/i, ".json");
  const reportRelativePath = options.requestedOutputRelativePath.replace(/\.png$/i, ".json");
  if (reportPath === options.requestedOutputPath || reportRelativePath === options.requestedOutputRelativePath) {
    throw new Error(`Reference UI zero-diff report requires a .png output path (${diagnosticContext(options)})`);
  }
  const report = {
    schemaVersion: 1,
    type: "reference-ui-zero-diff",
    adapter: { name: "agent-browser", version: "0.32.3" },
    context: {
      iteration: options.iteration,
      caseId: options.caseId,
      regionId: options.regionId ?? null,
    },
    requestedOutput: options.requestedOutputRelativePath,
    measurement: options.measurement,
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return {
    kind: options.artifactKind,
    path: reportRelativePath,
  };
}
