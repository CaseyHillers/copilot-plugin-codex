import { execFile } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function toPosixPath(value: string): string {
  return value.split(path.sep).join(path.posix.sep);
}

export function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}\n[truncated]`;
}

export function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

export function parseOptionalJsonArray(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.every((entry) => typeof entry === "string")) {
      return parsed;
    }
  } catch {
    // Fall back to a whitespace split below.
  }

  return value
    .split(/\s+/u)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export async function writeJsonAtomic(pathname: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(pathname), { recursive: true });
  const temporaryPath = `${pathname}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, pathname);
}

export async function readJsonFile<T>(pathname: string): Promise<T> {
  const raw = await readFile(pathname, "utf8");
  return JSON.parse(raw) as T;
}

export async function execFileText(
  command: string,
  args: string[],
  options: { cwd?: string } = {},
): Promise<string> {
  const result = await execFileAsync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });

  return result.stdout;
}

export async function tryExecFileText(
  command: string,
  args: string[],
  options: { cwd?: string } = {},
): Promise<{ ok: true; stdout: string } | { ok: false; error: string }> {
  try {
    const stdout = await execFileText(command, args, options);
    return { ok: true, stdout };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : `Unknown error while running ${command}`;
    return { ok: false, error: message };
  }
}

export function pickFirstNonEmptyLine(value: string): string {
  return (
    value
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .find(Boolean) ?? ""
  );
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

