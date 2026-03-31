import { lstat, readdir } from "node:fs/promises";
import path from "node:path";
import { toPosixPath, uniqueSorted } from "./utils.js";

interface FileFingerprint {
  size: number;
  mtimeMs: number;
  mode: number;
}

const IGNORED_DIRECTORY_NAMES = new Set([
  ".git",
  ".runtime",
  "node_modules",
  ".pnpm-store",
  ".yarn",
]);

export async function snapshotDirectory(root: string): Promise<Map<string, FileFingerprint>> {
  const results = new Map<string, FileFingerprint>();

  async function walk(currentDirectory: string): Promise<void> {
    const entries = await readdir(currentDirectory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && IGNORED_DIRECTORY_NAMES.has(entry.name)) {
        continue;
      }

      const absolutePath = path.join(currentDirectory, entry.name);
      const relativePath = toPosixPath(path.relative(root, absolutePath));
      if (!relativePath) {
        continue;
      }

      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const stats = await lstat(absolutePath);
      results.set(relativePath, {
        size: stats.size,
        mtimeMs: stats.mtimeMs,
        mode: stats.mode,
      });
    }
  }

  await walk(root);
  return results;
}

export function diffSnapshots(
  before: Map<string, FileFingerprint>,
  after: Map<string, FileFingerprint>,
): string[] {
  const touched = new Set<string>();
  const allPaths = new Set<string>([...before.keys(), ...after.keys()]);

  for (const entry of allPaths) {
    const beforeValue = before.get(entry);
    const afterValue = after.get(entry);
    if (!beforeValue || !afterValue) {
      touched.add(entry);
      continue;
    }

    if (
      beforeValue.size !== afterValue.size ||
      beforeValue.mtimeMs !== afterValue.mtimeMs ||
      beforeValue.mode !== afterValue.mode
    ) {
      touched.add(entry);
    }
  }

  return uniqueSorted([...touched]);
}

