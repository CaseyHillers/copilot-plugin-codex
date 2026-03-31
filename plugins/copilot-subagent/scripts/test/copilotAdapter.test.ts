import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { CopilotAdapter } from "../src/copilotAdapter.js";
import { fakeCopilotPath, repoRoot } from "./helpers/testUtils.js";

const fixtureDirectory = path.join(
  repoRoot,
  "plugins",
  "copilot-subagent",
  "scripts",
  "test",
  "fixtures",
);

test("buildCommand configures delegate mode with full permissions", () => {
  const adapter = new CopilotAdapter();
  const command = adapter.buildCommand({
    mode: "delegate",
    cwd: repoRoot,
    prompt: "Delegate this task.",
    model: "claude-sonnet-4.6",
    reasoningEffort: "high",
  });

  assert.equal(command.command, "copilot");
  assert.ok(command.args.includes("--allow-all-tools"));
  assert.ok(command.args.includes("--allow-all-urls"));
  assert.ok(command.args.includes("--model"));
  assert.ok(command.args.includes("claude-sonnet-4.6"));
});

test("buildCommand configures review mode with write denied", () => {
  const adapter = new CopilotAdapter();
  const command = adapter.buildCommand({
    mode: "review",
    cwd: repoRoot,
    prompt: "Review this change.",
  });

  assert.ok(command.args.includes("--available-tools"));
  assert.ok(command.args.includes("read,grep,glob,ls"));
  assert.ok(command.args.includes("--deny-tool"));
  assert.ok(command.args.includes("write"));
  assert.ok(!command.args.includes("--allow-all-urls"));
});

test("parseExecution extracts the structured result from success fixture", async () => {
  const adapter = new CopilotAdapter();
  const stdout = await readFile(path.join(fixtureDirectory, "parser-success.jsonl"), "utf8");
  const parsed = adapter.parseExecution({
    stdout,
    stderr: "",
    exitCode: 0,
    signal: null,
  });

  assert.equal(parsed.stableResult.status, "completed");
  assert.equal(parsed.stableResult.summary, "Implemented the requested change.");
  assert.deepEqual(parsed.stableResult.touchedFiles, ["src/example.ts"]);
  assert.equal(parsed.stableResult.sessionId, "session-success");
});

test("parseExecution falls back to stderr on auth failure", async () => {
  const adapter = new CopilotAdapter();
  const stdout = await readFile(
    path.join(fixtureDirectory, "parser-auth-failure.jsonl"),
    "utf8",
  );
  const parsed = adapter.parseExecution({
    stdout,
    stderr: "Authentication failed. Run copilot login.",
    exitCode: 1,
    signal: null,
  });

  assert.equal(parsed.stableResult.status, "failed");
  assert.match(parsed.stableResult.error ?? "", /Authentication failed/u);
});

test("parseExecution falls back to stderr on permission failure", async () => {
  const adapter = new CopilotAdapter();
  const stdout = await readFile(
    path.join(fixtureDirectory, "parser-permission-failure.jsonl"),
    "utf8",
  );
  const parsed = adapter.parseExecution({
    stdout,
    stderr: "Permission denied by policy.",
    exitCode: 1,
    signal: null,
  });

  assert.equal(parsed.stableResult.status, "failed");
  assert.match(parsed.stableResult.error ?? "", /Permission denied/u);
});

test("parseExecution tolerates malformed sentinel JSON", async () => {
  const adapter = new CopilotAdapter();
  const stdout = await readFile(
    path.join(fixtureDirectory, "parser-malformed.jsonl"),
    "utf8",
  );
  const parsed = adapter.parseExecution({
    stdout,
    stderr: "",
    exitCode: 0,
    signal: null,
  });

  assert.equal(parsed.stableResult.status, "completed");
  assert.match(parsed.stableResult.summary, /Review finished/u);
});

test("diagnose uses the fake copilot binary override", async () => {
  const previousBinary = process.env.COPILOT_SUBAGENT_COPILOT_BINARY;
  const previousArgs = process.env.COPILOT_SUBAGENT_COPILOT_BINARY_ARGS;
  process.env.COPILOT_SUBAGENT_COPILOT_BINARY = process.execPath;
  process.env.COPILOT_SUBAGENT_COPILOT_BINARY_ARGS = JSON.stringify([fakeCopilotPath]);

  try {
    const adapter = new CopilotAdapter();
    const diagnosis = await adapter.diagnose();
    assert.equal(diagnosis.available, true);
    assert.match(diagnosis.version ?? "", /fake 0.0.0/u);
  } finally {
    if (previousBinary === undefined) {
      delete process.env.COPILOT_SUBAGENT_COPILOT_BINARY;
    } else {
      process.env.COPILOT_SUBAGENT_COPILOT_BINARY = previousBinary;
    }

    if (previousArgs === undefined) {
      delete process.env.COPILOT_SUBAGENT_COPILOT_BINARY_ARGS;
    } else {
      process.env.COPILOT_SUBAGENT_COPILOT_BINARY_ARGS = previousArgs;
    }
  }
});

