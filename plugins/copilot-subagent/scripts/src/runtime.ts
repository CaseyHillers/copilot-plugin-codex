import { spawn } from "node:child_process";
import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import type { ChildProcess } from "node:child_process";
import { CopilotAdapter } from "./copilotAdapter.js";
import { collectReviewContext } from "./gitContext.js";
import { JobStore } from "./jobStore.js";
import { buildPrompt } from "./prompts.js";
import { diffSnapshots, snapshotDirectory } from "./snapshot.js";
import type {
  DoctorResult,
  ExecutionCapture,
  JobRecord,
  RunOptions,
  StableResult,
} from "./types.js";
import { uniqueSorted } from "./utils.js";

function currentByokSettings(env: NodeJS.ProcessEnv): DoctorResult["byok"] {
  const active = Boolean(env.COPILOT_PROVIDER_BASE_URL);
  return {
    active,
    providerType: env.COPILOT_PROVIDER_TYPE,
    baseUrl: env.COPILOT_PROVIDER_BASE_URL,
    model: env.COPILOT_MODEL,
    wireApi: env.COPILOT_PROVIDER_WIRE_API,
  };
}

async function readPromptInput(options: RunOptions): Promise<string> {
  if (options.promptFile) {
    return readFile(path.resolve(options.promptFile), "utf8");
  }

  if (process.stdin.isTTY) {
    return "";
  }

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function spawnAndCapture(
  command: string,
  args: string[],
  cwd: string,
  stdoutPath: string,
  stderrPath: string,
): { child: ChildProcess; completion: Promise<ExecutionCapture> } {
  const child = spawn(command, args, {
    cwd,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];

  child.stdout?.on("data", (chunk) => {
    const buffer = Buffer.from(chunk);
    stdoutChunks.push(buffer);
    void appendFile(stdoutPath, buffer);
  });

  child.stderr?.on("data", (chunk) => {
    const buffer = Buffer.from(chunk);
    stderrChunks.push(buffer);
    void appendFile(stderrPath, buffer);
  });

  const completion = new Promise<ExecutionCapture>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (exitCode, signal) => {
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        exitCode,
        signal,
      });
    });
  });

  return { child, completion };
}

export async function doctor(): Promise<DoctorResult> {
  const adapter = new CopilotAdapter();
  const diagnosis = await adapter.diagnose();
  return {
    provider: diagnosis.provider,
    available: diagnosis.available,
    command: diagnosis.command,
    version: diagnosis.version,
    message: diagnosis.message,
    byok: currentByokSettings(process.env),
  };
}

function stableResultFromJob(job: JobRecord): StableResult {
  return {
    status:
      job.status === "queued" || job.status === "running" ? "running" : job.status,
    summary: job.summary ?? "",
    touchedFiles: job.touchedFiles,
    sessionId: job.sessionId ?? null,
    error: job.error ?? null,
  };
}

export async function runForeground(
  runtimeRoot: string,
  options: RunOptions,
): Promise<StableResult> {
  const prompt = await readPromptInput(options);
  const store = new JobStore(runtimeRoot);
  const job = await store.createJob({
    provider: "copilot",
    mode: options.mode,
    cwd: path.resolve(options.cwd),
    model: options.model,
    reasoningEffort: options.reasoningEffort,
    prompt,
  });

  const completed = await executeJob(runtimeRoot, job.jobId);
  return stableResultFromJob(completed);
}

export async function runBackground(
  runtimeRoot: string,
  cliEntryPath: string,
  options: RunOptions,
): Promise<JobRecord> {
  const prompt = await readPromptInput(options);
  const store = new JobStore(runtimeRoot);
  const job = await store.createJob({
    provider: "copilot",
    mode: options.mode,
    cwd: path.resolve(options.cwd),
    model: options.model,
    reasoningEffort: options.reasoningEffort,
    prompt,
  });

  const resolvedCliEntryPath = path.resolve(cliEntryPath);
  const child = spawn(
    process.execPath,
    [resolvedCliEntryPath, "_worker", "--job-id", job.jobId],
    {
    cwd: path.dirname(resolvedCliEntryPath),
    env: {
      ...process.env,
      COPILOT_SUBAGENT_RUNTIME_ROOT: runtimeRoot,
    },
    detached: true,
    stdio: "ignore",
    },
  );
  child.unref();

  return store.updateJob(job.jobId, {
    pid: child.pid,
  });
}

export async function executeJob(runtimeRoot: string, jobId: string): Promise<JobRecord> {
  const store = new JobStore(runtimeRoot);
  const adapter = new CopilotAdapter();
  const initialJob = await store.readJob(jobId);
  const promptInput = await store.readPrompt(jobId);
  const reviewContext =
    initialJob.mode === "delegate"
      ? undefined
      : await collectReviewContext(initialJob.cwd);
  const prompt = buildPrompt({
    mode: initialJob.mode,
    cwd: initialJob.cwd,
    userPrompt: promptInput,
    reviewContext,
  });

  const beforeSnapshot =
    initialJob.mode === "delegate" ? await snapshotDirectory(initialJob.cwd) : null;

  const job = await store.updateJob(jobId, {
    status: "running",
    pid: process.pid,
  });

  let activeChild: ChildProcess | undefined;
  let cancellationRequested = false;

  const markCancelled = async (): Promise<void> => {
    cancellationRequested = true;
    if (activeChild?.pid) {
      activeChild.kill("SIGTERM");
    }
    await store.updateJob(job.jobId, (current) => ({
      ...current,
      status: "cancelled",
      finishedAt: new Date().toISOString(),
      summary: current.summary || "Cancelled.",
      error: null,
      pid: undefined,
    }));
  };

  const handleSignal = (): void => {
    void markCancelled().then(() => {
      process.exitCode = 0;
    });
  };

  process.once("SIGTERM", handleSignal);
  process.once("SIGINT", handleSignal);

  try {
    const command = adapter.buildCommand({
      mode: job.mode,
      cwd: job.cwd,
      prompt,
      model: job.model,
      reasoningEffort: job.reasoningEffort,
    });

    const execution = spawnAndCapture(
      command.command,
      command.args,
      command.cwd,
      job.stdoutPath,
      job.stderrPath,
    );
    activeChild = execution.child;
    const capture = await execution.completion;
    const afterSnapshot =
      job.mode === "delegate" ? await snapshotDirectory(job.cwd) : null;
    const parsed = adapter.parseExecution(capture);
    const changedFiles =
      beforeSnapshot && afterSnapshot ? diffSnapshots(beforeSnapshot, afterSnapshot) : [];
    const touchedFiles = uniqueSorted([
      ...parsed.stableResult.touchedFiles,
      ...changedFiles,
    ]);
    const latestJob = await store.readJob(job.jobId);

    const status =
      latestJob.status === "cancelled" ||
      cancellationRequested ||
      parsed.stableResult.status === "cancelled"
        ? "cancelled"
        : capture.exitCode === 0 && parsed.stableResult.status !== "failed"
          ? "completed"
          : "failed";

    return await store.updateJob(job.jobId, (current) => ({
      ...current,
      status,
      finishedAt: new Date().toISOString(),
      summary: parsed.stableResult.summary,
      sessionId: parsed.sessionId,
      touchedFiles,
      error:
        status === "failed"
          ? parsed.stableResult.error ||
            capture.stderr.trim() ||
            "Copilot exited with a non-zero status."
          : null,
      pid: undefined,
    }));
  } catch (error) {
    return store.updateJob(job.jobId, (current) => ({
      ...current,
      status: cancellationRequested ? "cancelled" : "failed",
      finishedAt: new Date().toISOString(),
      summary: current.summary || "",
      error: error instanceof Error ? error.message : String(error),
      pid: undefined,
    }));
  } finally {
    process.removeListener("SIGTERM", handleSignal);
    process.removeListener("SIGINT", handleSignal);
  }
}

export async function readStatus(runtimeRoot: string, jobId: string): Promise<JobRecord> {
  const store = new JobStore(runtimeRoot);
  return store.readJob(jobId);
}

export async function readResult(runtimeRoot: string, jobId: string): Promise<StableResult> {
  const store = new JobStore(runtimeRoot);
  return stableResultFromJob(await store.readJob(jobId));
}

export async function cancelJob(runtimeRoot: string, jobId: string): Promise<JobRecord> {
  const store = new JobStore(runtimeRoot);
  const job = await store.readJob(jobId);
  if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
    return job;
  }

  if (job.pid) {
    try {
      process.kill(job.pid, "SIGTERM");
    } catch {
      // The process may have already exited.
    }
  }

  return store.updateJob(jobId, {
    status: "cancelled",
    finishedAt: new Date().toISOString(),
    summary: job.summary || "Cancelled.",
    error: null,
    pid: undefined,
  });
}
