import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { materializeReferenceUiDiffArtifact } from "./live/reference-ui-diff-artifact.mjs";

const exactMeasurement = {
  differentPixels: 0,
  totalPixels: 480000,
  mismatchPercentage: 0,
  mismatchRatio: 0,
  colorThreshold: 0.1,
  maxMismatchRatio: 0.01,
  match: true,
  dimensionMismatch: null,
};

async function createStaging(t) {
  const stagingRoot = await mkdtemp(path.join(os.tmpdir(), "reference-ui-zero-diff-"));
  t.after(() => rm(stagingRoot, { force: true, recursive: true }));
  await mkdir(path.join(stagingRoot, "cases", "desktop", "regions", "surface"), { recursive: true });
  return stagingRoot;
}

async function assertZeroDiffArtifact(stagingRoot, options) {
  const artifact = await materializeReferenceUiDiffArtifact({
    artifactKind: options.artifactKind,
    caseId: "desktop",
    iteration: 2,
    measurement: exactMeasurement,
    regionId: options.regionId,
    requestedOutputPath: path.join(stagingRoot, ...options.requestedOutputRelativePath.split("/")),
    requestedOutputRelativePath: options.requestedOutputRelativePath,
  });

  assert.equal(artifact.kind, options.artifactKind);
  assert.equal(artifact.path, options.requestedOutputRelativePath.replace(/\.png$/, ".json"));
  const report = JSON.parse(await readFile(path.join(stagingRoot, ...artifact.path.split("/")), "utf8"));
  assert.deepEqual(report, {
    schemaVersion: 1,
    type: "reference-ui-zero-diff",
    adapter: { name: "agent-browser", version: "0.32.3" },
    context: { iteration: 2, caseId: "desktop", regionId: options.regionId ?? null },
    requestedOutput: options.requestedOutputRelativePath,
    measurement: exactMeasurement,
  });
}

test("exact matches without an upstream PNG create truthful readable case and region diff reports", async (t) => {
  const stagingRoot = await createStaging(t);

  await assertZeroDiffArtifact(stagingRoot, {
    artifactKind: "diff",
    requestedOutputRelativePath: "cases/desktop/diff.png",
  });
  await assertZeroDiffArtifact(stagingRoot, {
    artifactKind: "region-diff",
    regionId: "surface",
    requestedOutputRelativePath: "cases/desktop/regions/surface/diff.png",
  });
});

test("an existing upstream diff PNG remains the declared diff artifact", async (t) => {
  const stagingRoot = await createStaging(t);
  const relativePath = "cases/desktop/diff.png";
  const outputPath = path.join(stagingRoot, ...relativePath.split("/"));
  await writeFile(outputPath, Buffer.from("png output"));

  const artifact = await materializeReferenceUiDiffArtifact({
    artifactKind: "diff",
    caseId: "desktop",
    iteration: 1,
    measurement: { ...exactMeasurement, differentPixels: 9, mismatchRatio: 0.00001875, match: false },
    requestedOutputPath: outputPath,
    requestedOutputRelativePath: relativePath,
  });

  assert.deepEqual(artifact, { kind: "diff", path: relativePath });
});

test("missing positive and dimension-mismatch outputs fail with iteration, case, region, path, and measurement", async (t) => {
  const stagingRoot = await createStaging(t);
  const cases = [
    {
      artifactKind: "diff",
      measurement: { ...exactMeasurement, differentPixels: 4, mismatchRatio: 4 / exactMeasurement.totalPixels, match: false },
      regionId: undefined,
      relativePath: "cases/desktop/diff.png",
      expectedRegion: "<whole-surface>",
      expectedMeasurement: /\"differentPixels\":4/,
    },
    {
      artifactKind: "region-diff",
      measurement: { ...exactMeasurement, dimensionMismatch: { baseline: "800x600", current: "390x844" }, match: false },
      regionId: "surface",
      relativePath: "cases/desktop/regions/surface/diff.png",
      expectedRegion: "surface",
      expectedMeasurement: /\"dimensionMismatch\":\{\"baseline\":\"800x600\",\"current\":\"390x844\"\}/,
    },
  ];

  for (const item of cases) {
    await assert.rejects(
      materializeReferenceUiDiffArtifact({
        artifactKind: item.artifactKind,
        caseId: "desktop",
        iteration: 3,
        measurement: item.measurement,
        regionId: item.regionId,
        requestedOutputPath: path.join(stagingRoot, ...item.relativePath.split("/")),
        requestedOutputRelativePath: item.relativePath,
      }),
      (error) => {
        assert.match(error.message, /Reference UI diff output is missing/);
        assert.match(error.message, /iteration=3/);
        assert.match(error.message, /case=desktop/);
        assert.match(error.message, new RegExp(`region=${item.expectedRegion.replace(/[<>-]/g, "\\$&")}`));
        assert.match(error.message, new RegExp(`output=${item.relativePath.replace(/[/.]/g, "\\$&")}`));
        assert.match(error.message, item.expectedMeasurement);
        return true;
      },
    );
  }
});
