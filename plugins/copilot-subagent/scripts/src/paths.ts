import path from "node:path";
import { fileURLToPath } from "node:url";
import { RUNTIME_ENV_VAR } from "./constants.js";

export interface RuntimeLayout {
  runtimeRoot: string;
  jobsDir: string;
  logsDir: string;
  promptsDir: string;
}

export function resolvePluginRoot(fromImportMetaUrl: string): string {
  const currentFile = fileURLToPath(fromImportMetaUrl);
  return path.resolve(path.dirname(currentFile), "..", "..");
}

export function buildRuntimeLayout(runtimeRoot: string): RuntimeLayout {
  return {
    runtimeRoot,
    jobsDir: path.join(runtimeRoot, "jobs"),
    logsDir: path.join(runtimeRoot, "logs"),
    promptsDir: path.join(runtimeRoot, "prompts"),
  };
}

export function resolveRuntimeRoot(
  fromImportMetaUrl: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (env[RUNTIME_ENV_VAR]) {
    return path.resolve(env[RUNTIME_ENV_VAR]);
  }

  return path.join(resolvePluginRoot(fromImportMetaUrl), ".runtime");
}

