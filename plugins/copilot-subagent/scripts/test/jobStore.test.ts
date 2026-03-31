import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { JobStore } from "../src/jobStore.js";

test("JobStore creates, reads, and updates jobs", async () => {
  const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), "copilot-subagent-runtime-"));
  const store = new JobStore(runtimeRoot);

  const job = await store.createJob({
    provider: "copilot",
    mode: "delegate",
    cwd: runtimeRoot,
    prompt: "Test prompt",
    model: "claude-sonnet-4.6",
    reasoningEffort: "medium",
  });

  const loaded = await store.readJob(job.jobId);
  assert.equal(loaded.jobId, job.jobId);
  assert.equal(await store.readPrompt(job.jobId), "Test prompt");

  const updated = await store.updateJob(job.jobId, {
    status: "completed",
    summary: "Done.",
    touchedFiles: ["file.txt"],
  });

  assert.equal(updated.status, "completed");
  assert.deepEqual(updated.touchedFiles, ["file.txt"]);
});

