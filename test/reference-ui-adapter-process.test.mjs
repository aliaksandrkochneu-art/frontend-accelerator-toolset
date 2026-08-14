import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import test from "node:test";
import { runReferenceUiAdapterProcess } from "./live/reference-ui-adapter-process.mjs";

function settleDeadline(milliseconds) {
  return new Promise((resolve) => setTimeout(() => resolve({ kind: "deadline" }), milliseconds));
}

function childWithDaemonOwnedStdio() {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.killCalls = 0;
  child.kill = () => {
    child.killCalls += 1;
    return true;
  };
  queueMicrotask(() => {
    child.stdout.write("adapter stdout alpha\nadapter stdout omega\n");
    child.stderr.write("adapter stderr alpha\nadapter stderr omega\n");
    child.emit("exit", 7, null);
  });
  child.releaseDaemonStdio = () => {
    child.stdout.end();
    child.stderr.end();
    child.emit("close", 7, null);
  };
  return child;
}

test("live adapter invocation completes after adapter exit when its daemon keeps stdio open", async (context) => {
  const child = childWithDaemonOwnedStdio();
  const execution = runReferenceUiAdapterProcess("project browser adapter", ["open"], {
    spawnProcess: () => child,
  });
  context.after(async () => {
    child.releaseDaemonStdio();
    await execution.catch(() => {});
  });

  const outcome = await Promise.race([
    execution.then((result) => ({ kind: "result", result })),
    settleDeadline(50),
  ]);

  assert.notEqual(outcome.kind, "deadline", "adapter invocation waited for daemon-owned stdio handles");
  assert.deepEqual(outcome.result, {
    code: 7,
    signal: null,
    stdout: "adapter stdout alpha\nadapter stdout omega\n",
    stderr: "adapter stderr alpha\nadapter stderr omega\n",
  });
  assert.equal(child.killCalls, 0);
});

test("live adapter invocation times out with captured output instead of waiting forever", async () => {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  let adapterKilled = false;
  child.kill = () => {
    adapterKilled = true;
    child.emit("exit", null, "SIGTERM");
    return true;
  };
  queueMicrotask(() => {
    child.stdout.write("stdout before timeout\n");
    child.stderr.write("stderr before timeout\n");
  });

  await assert.rejects(
    runReferenceUiAdapterProcess("project browser adapter", ["open"], {
      spawnProcess: () => child,
      timeoutMs: 20,
    }),
    (error) => {
      assert.equal(error.code, "REFERENCE_UI_ADAPTER_TIMEOUT");
      assert.match(error.message, /timed out after 20ms/);
      assert.equal(error.stdout, "stdout before timeout\n");
      assert.equal(error.stderr, "stderr before timeout\n");
      return true;
    },
  );
  assert.equal(adapterKilled, true);
});
