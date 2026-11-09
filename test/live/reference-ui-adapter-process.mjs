import { spawn } from "node:child_process";

const defaultTimeoutMs = 30_000;
const defaultExitDrainMs = 25;

function collectedOutput(chunks) {
  return Buffer.concat(chunks).toString("utf8");
}

export function runReferenceUiAdapterProcess(command, args, options = {}) {
  const spawnProcess = options.spawnProcess ?? spawn;
  return new Promise((resolve, reject) => {
    const child = spawnProcess(command, [...args], {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: false,
      stdio: "pipe",
      windowsHide: true,
    });
    const stdout = [];
    const stderr = [];
    let settled = false;
    let exitDrainTimer;
    child.stdout?.on("data", (chunk) => stdout.push(chunk));
    child.stderr?.on("data", (chunk) => stderr.push(chunk));

    const finish = (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(commandTimer);
      clearTimeout(exitDrainTimer);
      child.stdout?.destroy();
      child.stderr?.destroy();
      resolve({
        code: code ?? 1,
        signal,
        stdout: collectedOutput(stdout),
        stderr: collectedOutput(stderr),
      });
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(commandTimer);
      clearTimeout(exitDrainTimer);
      child.stdout?.destroy();
      child.stderr?.destroy();
      reject(error);
    };
    const commandTimer = setTimeout(() => {
      const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
      const capturedStdout = collectedOutput(stdout);
      const capturedStderr = collectedOutput(stderr);
      child.kill?.();
      const error = new Error(
        `project browser adapter timed out after ${timeoutMs}ms`
          + `${capturedStdout ? `; stdout: ${capturedStdout.trim()}` : ""}`
          + `${capturedStderr ? `; stderr: ${capturedStderr.trim()}` : ""}`,
      );
      error.code = "REFERENCE_UI_ADAPTER_TIMEOUT";
      error.stdout = capturedStdout;
      error.stderr = capturedStderr;
      error.timeoutMs = timeoutMs;
      fail(error);
    }, options.timeoutMs ?? defaultTimeoutMs);

    child.once("error", fail);
    child.once("close", finish);
    child.once("exit", (code, signal) => {
      exitDrainTimer = setTimeout(
        () => finish(code, signal),
        options.exitDrainMs ?? defaultExitDrainMs,
      );
    });
  });
}
