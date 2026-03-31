export const PROVIDER_NAME = "copilot";
export const RESULT_SENTINEL = "COPILOT_SUBAGENT_RESULT:";
export const DEFAULT_REVIEW_MODEL_PROMPT = "Review the current changes.";
export const DEFAULT_ADVERSARIAL_PROMPT =
  "Adversarially review the current changes and look for regressions.";
export const DEFAULT_DELEGATE_PROMPT = "Complete the requested coding task.";
export const RUNTIME_ENV_VAR = "COPILOT_SUBAGENT_RUNTIME_ROOT";
export const COPILOT_BINARY_ENV_VAR = "COPILOT_SUBAGENT_COPILOT_BINARY";
export const COPILOT_BINARY_ARGS_ENV_VAR =
  "COPILOT_SUBAGENT_COPILOT_BINARY_ARGS";
export const MAX_DIFF_CONTEXT_CHARS = 40000;
export const MAX_SUMMARY_LENGTH = 280;

