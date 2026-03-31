export type RunMode = "delegate" | "review" | "adversarial-review";

export type JobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type ReasoningEffort = "low" | "medium" | "high" | "xhigh";

export interface RunOptions {
  mode: RunMode;
  cwd: string;
  model?: string;
  reasoningEffort?: ReasoningEffort;
  background: boolean;
  promptFile?: string;
}

export interface WorkerOptions {
  jobId: string;
}

export interface JobRecord {
  jobId: string;
  provider: string;
  mode: RunMode;
  cwd: string;
  pid?: number;
  status: JobStatus;
  startedAt: string;
  finishedAt?: string;
  model?: string;
  reasoningEffort?: ReasoningEffort;
  sessionId?: string | null;
  summary?: string;
  touchedFiles: string[];
  stdoutPath: string;
  stderrPath: string;
  error?: string | null;
}

export interface StableResult {
  status: Extract<JobStatus, "completed" | "failed" | "cancelled"> | "running";
  summary: string;
  touchedFiles: string[];
  sessionId: string | null;
  error: string | null;
}

export interface CommandSpec {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
}

export interface BinaryCheckResult {
  provider: string;
  available: boolean;
  command: string;
  version?: string;
  message: string;
}

export interface ExecutionCapture {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
}

export interface ParsedExecutionResult {
  stableResult: StableResult;
  rawText: string;
  sessionId: string | null;
}

export interface AdapterBuildInput {
  mode: RunMode;
  cwd: string;
  prompt: string;
  model?: string;
  reasoningEffort?: ReasoningEffort;
}

export interface ExternalAgentAdapter {
  readonly provider: string;
  diagnose(): Promise<BinaryCheckResult>;
  buildCommand(input: AdapterBuildInput): CommandSpec;
  parseExecution(output: ExecutionCapture): ParsedExecutionResult;
}

export interface DoctorResult {
  provider: string;
  available: boolean;
  command: string;
  version?: string;
  message: string;
  byok: {
    active: boolean;
    providerType?: string;
    baseUrl?: string;
    model?: string;
    wireApi?: string;
  };
}

