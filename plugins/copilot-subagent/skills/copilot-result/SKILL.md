---
name: copilot-result
description: Fetch the stable JSON result for a completed, failed, or cancelled copilot-subagent job.
---

# Copilot Result

Use this skill to fetch the stable result payload for a background job.

## Invocation

```bash
repo_root="$(git rev-parse --show-toplevel)"
node "$repo_root/plugins/copilot-subagent/scripts/dist/cli.js" result --job-id <job-id>
```

## Output

- Return the stable JSON object with `status`, `summary`, `touchedFiles`, `sessionId`, and `error`.
- If the job is still running, report that status instead of inventing a final answer.
