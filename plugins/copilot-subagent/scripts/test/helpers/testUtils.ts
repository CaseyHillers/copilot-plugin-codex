import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

export const repoRoot = path.resolve(currentDirectory, "../../../../../");
export const cliPath = path.join(
  repoRoot,
  "plugins",
  "copilot-subagent",
  "scripts",
  "dist",
  "cli.js",
);
export const fakeCopilotPath = path.join(
  repoRoot,
  "plugins",
  "copilot-subagent",
  "scripts",
  "test",
  "fixtures",
  "fake-copilot.mjs",
);

export interface CliRunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export async function createWorkspace(): Promise<string> {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "copilot-subagent-workspace-"));
  await mkdir(path.join(workspace, "src"), { recursive: true });
  await writeFile(path.join(workspace, "src", "example.ts"), "export const value = 1;\n", "utf8");
  return workspace;
}

export async function readWorkspaceFile(
  workspace: string,
  relativePath: string,
): Promise<string> {
  return readFile(path.join(workspace, relativePath), "utf8");
}

export async function runCli(
  args: string[],
  options: {
    runtimeRoot: string;
    cwd?: string;
    stdin?: string;
    extraEnv?: NodeJS.ProcessEnv;
  },
): Promise<CliRunResult> {
  const child = spawn(process.execPath, [cliPath, ...args], {
    cwd: options.cwd ?? repoRoot,
    env: {
      ...process.env,
      ...options.extraEnv,
      COPILOT_SUBAGENT_RUNTIME_ROOT: options.runtimeRoot,
      COPILOT_SUBAGENT_COPILOT_BINARY: process.execPath,
      COPILOT_SUBAGENT_COPILOT_BINARY_ARGS: JSON.stringify([fakeCopilotPath]),
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  child.stdout.on("data", (chunk) => stdoutChunks.push(Buffer.from(chunk)));
  child.stderr.on("data", (chunk) => stderrChunks.push(Buffer.from(chunk)));

  if (options.stdin) {
    child.stdin.write(options.stdin);
  }
  child.stdin.end();

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code));
  });

  return {
    stdout: Buffer.concat(stdoutChunks).toString("utf8"),
    stderr: Buffer.concat(stderrChunks).toString("utf8"),
    exitCode,
  };
}

export async function waitForCompletion(
  runtimeRoot: string,
  jobId: string,
  timeoutMs = 8000,
): Promise<Record<string, unknown>> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const statusResult = await runCli(["status", "--job-id", jobId], {
      runtimeRoot,
    });
    assert.equal(statusResult.exitCode, 0, statusResult.stderr);
    const statusPayload = JSON.parse(statusResult.stdout) as Record<string, unknown>;
    const status = statusPayload.status;
    if (status === "completed" || status === "failed" || status === "cancelled") {
      return statusPayload;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`Timed out waiting for job ${jobId} to finish.`);
}

