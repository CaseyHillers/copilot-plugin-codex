import {
  DEFAULT_DELEGATE_PROMPT,
  RESULT_SENTINEL,
} from "./constants.js";
import type { RunMode } from "./types.js";
import { defaultPromptForMode } from "./gitContext.js";

interface BuildPromptInput {
  mode: RunMode;
  cwd: string;
  userPrompt: string;
  reviewContext?: string;
}

function outputContract(): string {
  return [
    "Return your normal response first.",
    `Finish with exactly one line that starts with ${RESULT_SENTINEL} followed by compact JSON.`,
    'Use this exact JSON shape: {"status":"completed|failed|cancelled","summary":"short summary","touchedFiles":["relative/path"],"sessionId":null,"error":null}.',
    "Keep summary under 280 characters.",
    "If you do not know the touched files, return an empty array.",
  ].join("\n");
}

export function buildPrompt(input: BuildPromptInput): string {
  const basePrompt =
    input.userPrompt.trim() ||
    (input.mode === "delegate" ? DEFAULT_DELEGATE_PROMPT : defaultPromptForMode(input.mode));

  if (input.mode === "delegate") {
    return [
      "You are GitHub Copilot CLI acting as a delegated subagent for Codex.",
      `Working directory: ${input.cwd}`,
      "You may modify files inside the working directory to complete the task.",
      "Do not commit, push, create branches, open pull requests, or perform unrelated cleanup.",
      "Keep the solution scoped to the task and mention any tests you ran.",
      "",
      "Task:",
      basePrompt,
      "",
      outputContract(),
    ].join("\n");
  }

  const reviewLabel =
    input.mode === "review" ? "read-only code review" : "skeptical adversarial code review";

  return [
    `You are GitHub Copilot CLI running a ${reviewLabel} for Codex.`,
    `Working directory: ${input.cwd}`,
    "Stay read-only. Never modify files, stage changes, commit, or run shell commands that write.",
    "Prioritize correctness, regressions, hidden dependencies, trust boundaries, rollout risk, and missing tests.",
    'List findings first. If there are no material issues, say exactly "No findings."',
    "",
    "Review focus:",
    basePrompt,
    "",
    "Repository context:",
    input.reviewContext ?? "No additional git context was available.",
    "",
    outputContract(),
  ].join("\n");
}

