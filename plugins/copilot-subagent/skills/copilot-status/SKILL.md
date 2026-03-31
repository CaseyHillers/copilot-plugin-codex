---
name: copilot-status
description: Check the status of a background copilot-subagent job and report whether it is queued, running, completed, failed, or cancelled.
---

# Copilot Status

Use this skill to inspect a background job started by `$copilot-delegate`.

## Invocation

```bash
repo_root="$(git rev-parse --show-toplevel)"
node "$repo_root/plugins/copilot-subagent/scripts/dist/cli.js" status --job-id <job-id>
```

## Output

- Report the current job status.
- Include `startedAt`, `finishedAt`, `mode`, and any error message when present.
