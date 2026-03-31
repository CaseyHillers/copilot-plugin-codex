import {
  DEFAULT_ADVERSARIAL_PROMPT,
  DEFAULT_REVIEW_MODEL_PROMPT,
  MAX_DIFF_CONTEXT_CHARS,
} from "./constants.js";
import { truncate, tryExecFileText } from "./utils.js";

async function gitOutput(cwd: string, args: string[]): Promise<string> {
  const result = await tryExecFileText("git", ["-C", cwd, ...args], { cwd });
  return result.ok ? result.stdout : "";
}

async function resolveFallbackRange(cwd: string): Promise<string | null> {
  for (const range of ["origin/main...HEAD", "main...HEAD", "master...HEAD"]) {
    const probe = await tryExecFileText(
      "git",
      ["-C", cwd, "diff", "--no-ext-diff", "--stat", range],
      { cwd },
    );
    if (probe.ok) {
      return range;
    }
  }

  return null;
}

export async function collectReviewContext(cwd: string): Promise<string> {
  const insideRepo = await tryExecFileText(
    "git",
    ["-C", cwd, "rev-parse", "--show-toplevel"],
    { cwd },
  );

  if (!insideRepo.ok) {
    return "No git repository detected. Review the current working directory with read-only file tools only.";
  }

  const sections: string[] = [];
  const status = (await gitOutput(cwd, ["status", "--short"])).trim();
  if (status) {
    sections.push(`## Git Status\n${status}`);
  }

  const staged = (await gitOutput(cwd, ["diff", "--staged", "--no-ext-diff", "--binary"])).trim();
  if (staged) {
    sections.push(`## Staged Diff\n${staged}`);
  }

  const unstaged = (await gitOutput(cwd, ["diff", "--no-ext-diff", "--binary"])).trim();
  if (unstaged) {
    sections.push(`## Unstaged Diff\n${unstaged}`);
  }

  if (!staged && !unstaged) {
    const fallbackRange = await resolveFallbackRange(cwd);
    if (fallbackRange) {
      const branchDiff = (
        await gitOutput(cwd, ["diff", "--no-ext-diff", "--binary", fallbackRange])
      ).trim();
      if (branchDiff) {
        sections.push(`## Branch Diff (${fallbackRange})\n${branchDiff}`);
      }
    }
  }

  if (sections.length === 0) {
    return "No git diff was found. Inspect the repository read-only and review the current state.";
  }

  return truncate(sections.join("\n\n"), MAX_DIFF_CONTEXT_CHARS);
}

export function defaultPromptForMode(mode: "review" | "adversarial-review"): string {
  return mode === "review"
    ? DEFAULT_REVIEW_MODEL_PROMPT
    : DEFAULT_ADVERSARIAL_PROMPT;
}

