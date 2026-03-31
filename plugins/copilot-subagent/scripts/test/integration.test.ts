import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createWorkspace,
  readWorkspaceFile,
  runCli,
  waitForCompletion,
} from "./helpers/testUtils.js";

test("review mode returns a completed read-only result", async () => {
  const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), "copilot-subagent-runtime-"));
  const workspace = await createWorkspace();
  const initialFile = await readWorkspaceFile(workspace, "src/example.ts");

  const result = await runCli(
    ["run", "--mode", "review", "--cwd", workspace],
    {
      runtimeRoot,
      stdin: "Review the current changes.\n",
    },
  );

  assert.equal(result.exitCode, 0, result.stderr);
  const payload = JSON.parse(result.stdout) as Record<string, unknown>;
  assert.equal(payload.status, "completed");
  assert.equal(payload.summary, "No findings.");
  assert.deepEqual(payload.touchedFiles, []);
  assert.equal(await readWorkspaceFile(workspace, "src/example.ts"), initialFile);
});

test("delegate mode can edit the target workspace", async () => {
  const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), "copilot-subagent-runtime-"));
  const workspace = await createWorkspace();

  const result = await runCli(
    ["run", "--mode", "delegate", "--cwd", workspace],
    {
      runtimeRoot,
      stdin: "DELEGATE_WRITE_FILE\n",
    },
  );

  assert.equal(result.exitCode, 0, result.stderr);
  const payload = JSON.parse(result.stdout) as Record<string, unknown>;
  assert.equal(payload.status, "completed");
  assert.match(await readWorkspaceFile(workspace, "delegate-output.txt"), /delegated/u);
  assert.deepEqual(payload.touchedFiles, ["delegate-output.txt"]);
});

test("background jobs can be polled to completion", async () => {
  const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), "copilot-subagent-runtime-"));
  const workspace = await createWorkspace();

  const started = await runCli(
    ["run", "--mode", "delegate", "--cwd", workspace, "--background"],
    {
      runtimeRoot,
      stdin: "LONG_RUNNING\nDELEGATE_WRITE_FILE\n",
    },
  );

  assert.equal(started.exitCode, 0, started.stderr);
  const startedPayload = JSON.parse(started.stdout) as Record<string, unknown>;
  const jobId = String(startedPayload.jobId);
  const statusPayload = await waitForCompletion(runtimeRoot, jobId);
  assert.equal(statusPayload.status, "completed");

  const finalResult = await runCli(["result", "--job-id", jobId], {
    runtimeRoot,
  });
  assert.equal(finalResult.exitCode, 0, finalResult.stderr);
  const resultPayload = JSON.parse(finalResult.stdout) as Record<string, unknown>;
  assert.equal(resultPayload.status, "completed");
  assert.match(await readWorkspaceFile(workspace, "delegate-output.txt"), /delegated/u);
});

test("failed Copilot runs return stderr in the stable result", async () => {
  const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), "copilot-subagent-runtime-"));
  const workspace = await createWorkspace();

  const result = await runCli(
    ["run", "--mode", "delegate", "--cwd", workspace],
    {
      runtimeRoot,
      stdin: "AUTH_FAILURE\n",
    },
  );

  assert.equal(result.exitCode, 0, result.stderr);
  const payload = JSON.parse(result.stdout) as Record<string, unknown>;
  assert.equal(payload.status, "failed");
  assert.match(String(payload.error), /Authentication failed/u);
});

test("cancel transitions a detached job to cancelled", async () => {
  const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), "copilot-subagent-runtime-"));
  const workspace = await createWorkspace();

  const started = await runCli(
    ["run", "--mode", "delegate", "--cwd", workspace, "--background"],
    {
      runtimeRoot,
      stdin: "LONG_RUNNING\nDELEGATE_WRITE_FILE\n",
    },
  );

  assert.equal(started.exitCode, 0, started.stderr);
  const startedPayload = JSON.parse(started.stdout) as Record<string, unknown>;
  const jobId = String(startedPayload.jobId);

  const cancelled = await runCli(["cancel", "--job-id", jobId], {
    runtimeRoot,
  });
  assert.equal(cancelled.exitCode, 0, cancelled.stderr);

  const result = await runCli(["result", "--job-id", jobId], {
    runtimeRoot,
  });
  const payload = JSON.parse(result.stdout) as Record<string, unknown>;
  assert.equal(payload.status, "cancelled");
});

