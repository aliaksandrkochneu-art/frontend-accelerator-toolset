const allowedOverallStatuses = new Set(["READY", "DEGRADED"]);

function blockingCheckSummary(report) {
  const blockers = Array.isArray(report?.checks)
    ? report.checks.filter((check) => check?.status === "BLOCKED")
    : [];
  if (blockers.length === 0) return "";
  return `: ${blockers.map((check) => `${check.id}: ${check.message}`).join("; ")}`;
}

export function evaluateReferenceUiDoctorGate({ exitCode, report }) {
  const overallStatus = report?.status;
  const browser = Array.isArray(report?.checks)
    ? report.checks.find((check) => check?.id === "capability:browser")
    : undefined;
  const browserStatus = browser?.status;

  if (exitCode !== 0) {
    return {
      allowed: false,
      reason: `project Doctor exited with ${exitCode}${blockingCheckSummary(report)}`,
    };
  }
  if (overallStatus === "BLOCKED") {
    return {
      allowed: false,
      reason: `Doctor status BLOCKED${blockingCheckSummary(report)}`,
    };
  }
  if (!allowedOverallStatuses.has(overallStatus)) {
    return {
      allowed: false,
      reason: `unknown Doctor status ${overallStatus ?? "<missing>"}`,
    };
  }
  if (browserStatus !== "PASS") {
    return {
      allowed: false,
      reason: `capability:browser status ${browserStatus ?? "<missing>"}`,
    };
  }
  return { allowed: true, overallStatus, browserStatus };
}
