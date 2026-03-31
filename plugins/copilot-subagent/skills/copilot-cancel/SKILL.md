---
name: copilot-cancel
description: Cancel a running background copilot-subagent job and report the updated job state.
---

# Copilot Cancel

Use this skill to stop a detached background job started by `$copilot-delegate`.

## Invocation

```bash
repo_root="$(git rev-parse --show-toplevel)"
node "$repo_root/plugins/copilot-subagent/scripts/dist/cli.js" cancel --job-id <job-id>
```

## Output

- Report whether the job transitioned to `cancelled`.
- If the job had already finished, report its existing terminal status instead of forcing cancellation.
