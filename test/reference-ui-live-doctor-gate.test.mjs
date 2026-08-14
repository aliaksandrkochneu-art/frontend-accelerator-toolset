import assert from "node:assert/strict";
import test from "node:test";
import { evaluateReferenceUiDoctorGate } from "./live/reference-ui-doctor-gate.mjs";

function doctorReport(status, browserStatus = "PASS") {
  return {
    status,
    checks: [
      {
        id: "capability:browser",
        status: browserStatus,
        message: `managed browser is ${browserStatus}`,
      },
    ],
  };
}

test("Doctor gate allows READY and DEGRADED reports with exit 0 and browser PASS", () => {
  for (const status of ["READY", "DEGRADED"]) {
    assert.deepEqual(
      evaluateReferenceUiDoctorGate({ exitCode: 0, report: doctorReport(status) }),
      { allowed: true, overallStatus: status, browserStatus: "PASS" },
    );
  }
});

test("Doctor gate rejects BLOCKED reports and nonzero process exits", () => {
  const blocked = evaluateReferenceUiDoctorGate({ exitCode: 0, report: doctorReport("BLOCKED") });
  assert.equal(blocked.allowed, false);
  assert.match(blocked.reason, /Doctor status BLOCKED/);

  const nonzero = evaluateReferenceUiDoctorGate({ exitCode: 1, report: doctorReport("READY") });
  assert.equal(nonzero.allowed, false);
  assert.match(nonzero.reason, /exited with 1/);
});

test("Doctor gate rejects a non-PASS managed browser capability", () => {
  const result = evaluateReferenceUiDoctorGate({ exitCode: 0, report: doctorReport("READY", "BLOCKED") });
  assert.equal(result.allowed, false);
  assert.match(result.reason, /capability:browser status BLOCKED/);
});

test("Doctor gate rejects an unknown overall status", () => {
  const result = evaluateReferenceUiDoctorGate({ exitCode: 0, report: doctorReport("PASS") });
  assert.equal(result.allowed, false);
  assert.match(result.reason, /unknown Doctor status PASS/);
});
