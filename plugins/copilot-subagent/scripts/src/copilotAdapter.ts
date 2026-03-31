import { spawn } from "node:child_process";
import {
  COPILOT_BINARY_ARGS_ENV_VAR,
  COPILOT_BINARY_ENV_VAR,
  MAX_SUMMARY_LENGTH,
  PROVIDER_NAME,
  RESULT_SENTINEL,
} from "./constants.js";
import type {
  AdapterBuildInput,
  BinaryCheckResult,
  CommandSpec,
  ExecutionCapture,
  ExternalAgentAdapter,
  ParsedExecutionResult,
  StableResult,
} from "./types.js";
import {
  errorMessage,
  parseOptionalJsonArray,
  pickFirstNonEmptyLine,
  truncate,
  uniqueSorted,
} from "./utils.js";

const TEXT_KEYS = new Set([
  "text",
  "content",
  "message",
  "output",
  "delta",
  "body",
  "summary",
]);

function collectStrings(
  value: unknown,
  accumulator: string[],
  parentKey?: string,
): void {
  if (typeof value === "string") {
    if (!parentKey || TEXT_KEYS.has(parentKey)) {
      accumulator.push(value);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectStrings(entry, accumulator, parentKey);
    }
    return;
  }

  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      collectStrings(nested, accumulator, key);
    }
  }
}

function findFirstStringByKey(
  value: unknown,
  acceptedKeys: Set<string>,
): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const candidate = findFirstStringByKey(entry, acceptedKeys);
      if (candidate) {
        return candidate;
      }
    }
    return null;
  }

  for (const [key, nested] of Object.entries(value)) {
    if (acceptedKeys.has(key) && typeof nested === "string") {
      return nested;
    }
    const candidate = findFirstStringByKey(nested, acceptedKeys);
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function extractText(stdout: string): string {
  const fragments: string[] = [];

  for (const line of stdout.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    try {
      const parsed = JSON.parse(trimmed) as unknown;
      collectStrings(parsed, fragments);
    } catch {
      fragments.push(trimmed);
    }
  }

  return fragments.join("\n").trim();
}

function extractStableResult(rawText: string): StableResult | null {
  const sentinelIndex = rawText.lastIndexOf(RESULT_SENTINEL);
  if (sentinelIndex === -1) {
    return null;
  }

  const jsonText = rawText
    .slice(sentinelIndex + RESULT_SENTINEL.length)
    .trim()
    .split(/\r?\n/u)[0]
    ?.trim();

  if (!jsonText) {
    return null;
  }

  try {
    const parsed = JSON.parse(jsonText) as Partial<StableResult>;
    return {
      status:
        parsed.status === "completed" ||
        parsed.status === "failed" ||
        parsed.status === "cancelled" ||
        parsed.status === "running"
          ? parsed.status
          : "completed",
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      touchedFiles: Array.isArray(parsed.touchedFiles)
        ? parsed.touchedFiles.filter((entry): entry is string => typeof entry === "string")
        : [],
      sessionId: typeof parsed.sessionId === "string" ? parsed.sessionId : null,
      error: typeof parsed.error === "string" ? parsed.error : null,
    };
  } catch {
    return null;
  }
}

function fallbackStableResult(output: ExecutionCapture, rawText: string): StableResult {
  const combined = [rawText, output.stderr].filter(Boolean).join("\n").trim();
  const summary = truncate(pickFirstNonEmptyLine(combined), MAX_SUMMARY_LENGTH);
  return {
    status: output.exitCode === 0 ? "completed" : "failed",
    summary,
    touchedFiles: [],
    sessionId: null,
    error: output.exitCode === 0 ? null : combined || "Copilot exited with a non-zero status.",
  };
}

function mergeTouchedFiles(result: StableResult): StableResult {
  return {
    ...result,
    touchedFiles: uniqueSorted(result.touchedFiles),
    summary: truncate(result.summary, MAX_SUMMARY_LENGTH),
  };
}

export class CopilotAdapter implements ExternalAgentAdapter {
  readonly provider = PROVIDER_NAME;

  private resolveBinary(): { command: string; prefixArgs: string[] } {
    return {
      command: process.env[COPILOT_BINARY_ENV_VAR] || "copilot",
      prefixArgs: parseOptionalJsonArray(process.env[COPILOT_BINARY_ARGS_ENV_VAR]),
    };
  }

  async diagnose(): Promise<BinaryCheckResult> {
    const binary = this.resolveBinary();
    try {
      const child = spawn(binary.command, [...binary.prefixArgs, "--version"], {
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      child.stdout.on("data", (chunk) => stdoutChunks.push(Buffer.from(chunk)));
      child.stderr.on("data", (chunk) => stderrChunks.push(Buffer.from(chunk)));

      const exitCode = await new Promise<number | null>((resolve, reject) => {
        child.once("error", reject);
        child.once("close", (code) => resolve(code));
      });

      const stdout = Buffer.concat(stdoutChunks).toString("utf8").trim();
      const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();

      if (exitCode === 0) {
        return {
          provider: this.provider,
          available: true,
          command: [binary.command, ...binary.prefixArgs].join(" "),
          version: stdout,
          message: "GitHub Copilot CLI detected.",
        };
      }

      return {
        provider: this.provider,
        available: false,
        command: [binary.command, ...binary.prefixArgs].join(" "),
        message: stderr || stdout || "GitHub Copilot CLI was not available.",
      };
    } catch (error) {
      return {
        provider: this.provider,
        available: false,
        command: [binary.command, ...binary.prefixArgs].join(" "),
        message: errorMessage(error),
      };
    }
  }

  buildCommand(input: AdapterBuildInput): CommandSpec {
    const binary = this.resolveBinary();
    const args = [
      ...binary.prefixArgs,
      "-p",
      input.prompt,
      "--output-format",
      "json",
      "--stream",
      "off",
      "--no-ask-user",
      "--no-auto-update",
      "--add-dir",
      input.cwd,
      "--disallow-temp-dir",
    ];

    if (input.model) {
      args.push("--model", input.model);
    }

    if (input.reasoningEffort) {
      args.push("--reasoning-effort", input.reasoningEffort);
    }

    if (input.mode === "delegate") {
      args.push("--allow-all-tools", "--allow-all-urls");
    } else {
      args.push(
        "--allow-all-tools",
        "--available-tools",
        "read,grep,glob,ls",
        "--deny-tool",
        "write",
      );
    }

    return {
      command: binary.command,
      args,
      cwd: input.cwd,
      env: process.env,
    };
  }

  parseExecution(output: ExecutionCapture): ParsedExecutionResult {
    const rawText = extractText(output.stdout);
    const stableResult = mergeTouchedFiles(
      extractStableResult(rawText) ?? fallbackStableResult(output, rawText),
    );

    const sessionId =
      stableResult.sessionId ??
      findFirstStringByKey(
        output.stdout
          .split(/\r?\n/u)
          .map((line) => {
            try {
              return JSON.parse(line) as unknown;
            } catch {
              return null;
            }
          })
          .filter(Boolean),
        new Set(["sessionId", "session_id", "taskId", "task_id", "conversationId"]),
      );

    return {
      stableResult: {
        ...stableResult,
        sessionId,
      },
      rawText,
      sessionId,
    };
  }
}
