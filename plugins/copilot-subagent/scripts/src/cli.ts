#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { cancelJob, doctor, executeJob, readResult, readStatus, runBackground, runForeground } from "./runtime.js";
import { resolveRuntimeRoot } from "./paths.js";
import type { ReasoningEffort, RunMode, RunOptions } from "./types.js";

interface ParsedCommand {
  name: "run" | "status" | "result" | "cancel" | "doctor" | "_worker";
  flags: Map<string, string | boolean>;
}

function usage(): string {
  return [
    "Usage:",
    "  cli.js run --mode <delegate|review|adversarial-review> --cwd <path> [--model <name>] [--reasoning-effort <level>] [--background] [--prompt-file <path>]",
    "  cli.js status --job-id <id>",
    "  cli.js result --job-id <id>",
    "  cli.js cancel --job-id <id>",
    "  cli.js doctor",
  ].join("\n");
}

function parseCommand(argv: string[]): ParsedCommand {
  const [name, ...rest] = argv;
  if (!name) {
    throw new Error(usage());
  }

  if (!["run", "status", "result", "cancel", "doctor", "_worker"].includes(name)) {
    throw new Error(`Unknown command: ${name}\n\n${usage()}`);
  }

  const flags = new Map<string, string | boolean>();
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (!argument.startsWith("--")) {
      throw new Error(`Unexpected positional argument: ${argument}`);
    }

    const key = argument.slice(2);
    const next = rest[index + 1];
    if (!next || next.startsWith("--")) {
      flags.set(key, true);
      continue;
    }

    flags.set(key, next);
    index += 1;
  }

  return {
    name: name as ParsedCommand["name"],
    flags,
  };
}

function requireStringFlag(
  flags: Map<string, string | boolean>,
  name: string,
): string {
  const value = flags.get(name);
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing required --${name} flag.`);
  }
  return value;
}

function optionalStringFlag(
  flags: Map<string, string | boolean>,
  name: string,
): string | undefined {
  const value = flags.get(name);
  return typeof value === "string" ? value : undefined;
}

function parseRunOptions(flags: Map<string, string | boolean>): RunOptions {
  const mode = requireStringFlag(flags, "mode");
  if (!["delegate", "review", "adversarial-review"].includes(mode)) {
    throw new Error(`Invalid mode: ${mode}`);
  }

  const reasoningEffort = optionalStringFlag(flags, "reasoning-effort");
  if (
    reasoningEffort &&
    !["low", "medium", "high", "xhigh"].includes(reasoningEffort)
  ) {
    throw new Error(`Invalid reasoning effort: ${reasoningEffort}`);
  }

  return {
    mode: mode as RunMode,
    cwd: path.resolve(requireStringFlag(flags, "cwd")),
    model: optionalStringFlag(flags, "model"),
    reasoningEffort: reasoningEffort as ReasoningEffort | undefined,
    background: flags.has("background"),
    promptFile: optionalStringFlag(flags, "prompt-file"),
  };
}

async function main(): Promise<void> {
  const parsed = parseCommand(process.argv.slice(2));
  const runtimeRoot = resolveRuntimeRoot(import.meta.url);

  switch (parsed.name) {
    case "run": {
      const options = parseRunOptions(parsed.flags);
      if (options.background) {
        const job = await runBackground(runtimeRoot, process.argv[1], options);
        process.stdout.write(`${JSON.stringify(job, null, 2)}\n`);
        return;
      }

      const result = await runForeground(runtimeRoot, options);
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }
    case "status": {
      const jobId = requireStringFlag(parsed.flags, "job-id");
      const status = await readStatus(runtimeRoot, jobId);
      process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
      return;
    }
    case "result": {
      const jobId = requireStringFlag(parsed.flags, "job-id");
      const result = await readResult(runtimeRoot, jobId);
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }
    case "cancel": {
      const jobId = requireStringFlag(parsed.flags, "job-id");
      const result = await cancelJob(runtimeRoot, jobId);
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }
    case "_worker": {
      const jobId = requireStringFlag(parsed.flags, "job-id");
      const result = await executeJob(runtimeRoot, jobId);
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }
    case "doctor": {
      const result = await doctor();
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }
    default: {
      throw new Error(usage());
    }
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
