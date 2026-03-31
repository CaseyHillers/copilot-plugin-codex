import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  JobRecord,
  ReasoningEffort,
  RunMode,
} from "./types.js";
import { buildRuntimeLayout } from "./paths.js";
import { readJsonFile, writeJsonAtomic } from "./utils.js";

interface CreateJobInput {
  provider: string;
  mode: RunMode;
  cwd: string;
  model?: string;
  reasoningEffort?: ReasoningEffort;
  prompt: string;
}

export class JobStore {
  private readonly layout;

  constructor(runtimeRoot: string) {
    this.layout = buildRuntimeLayout(runtimeRoot);
  }

  async ensureDirectories(): Promise<void> {
    await Promise.all([
      mkdir(this.layout.jobsDir, { recursive: true }),
      mkdir(this.layout.logsDir, { recursive: true }),
      mkdir(this.layout.promptsDir, { recursive: true }),
    ]);
  }

  jobPath(jobId: string): string {
    return path.join(this.layout.jobsDir, `${jobId}.json`);
  }

  promptPath(jobId: string): string {
    return path.join(this.layout.promptsDir, `${jobId}.prompt.txt`);
  }

  stdoutPath(jobId: string): string {
    return path.join(this.layout.logsDir, `${jobId}.stdout.log`);
  }

  stderrPath(jobId: string): string {
    return path.join(this.layout.logsDir, `${jobId}.stderr.log`);
  }

  async createJob(input: CreateJobInput): Promise<JobRecord> {
    await this.ensureDirectories();
    const jobId = randomUUID();
    const job: JobRecord = {
      jobId,
      provider: input.provider,
      mode: input.mode,
      cwd: input.cwd,
      status: "queued",
      startedAt: new Date().toISOString(),
      model: input.model,
      reasoningEffort: input.reasoningEffort,
      summary: "",
      touchedFiles: [],
      stdoutPath: this.stdoutPath(jobId),
      stderrPath: this.stderrPath(jobId),
      error: null,
      sessionId: null,
    };

    await Promise.all([
      writeJsonAtomic(this.jobPath(jobId), job),
      writeFile(this.promptPath(jobId), input.prompt, "utf8"),
      writeFile(job.stdoutPath, "", "utf8"),
      writeFile(job.stderrPath, "", "utf8"),
    ]);

    return job;
  }

  async readJob(jobId: string): Promise<JobRecord> {
    return readJsonFile<JobRecord>(this.jobPath(jobId));
  }

  async writeJob(job: JobRecord): Promise<void> {
    await writeJsonAtomic(this.jobPath(job.jobId), job);
  }

  async updateJob(
    jobId: string,
    updater: Partial<JobRecord> | ((job: JobRecord) => JobRecord),
  ): Promise<JobRecord> {
    const current = await this.readJob(jobId);
    const next =
      typeof updater === "function" ? updater(current) : { ...current, ...updater };
    await this.writeJob(next);
    return next;
  }

  async readPrompt(jobId: string): Promise<string> {
    return readFile(this.promptPath(jobId), "utf8");
  }
}

