---
name: copilot-delegate
description: Delegate a coding task to GitHub Copilot CLI through the repo-local copilot-subagent plugin, return a background job handle, and collect the final result when it completes.
---

# Copilot Delegate

Use this skill when the user wants GitHub Copilot CLI to perform implementation work in the current checkout.

## Preconditions

- Run `$copilot-setup` if Copilot availability is uncertain.
- The compiled runtime should exist at `plugins/copilot-subagent/scripts/dist/cli.js`.

## Invocation

Launch the delegated task in the current working directory and return the job handle immediately:

```bash
repo_root="$(git rev-parse --show-toplevel)"
cat <<'EOF' | node "$repo_root/plugins/copilot-subagent/scripts/dist/cli.js" run --mode delegate --cwd "$PWD" --background
<user task>
EOF
```

Poll the job:

```bash
repo_root="$(git rev-parse --show-toplevel)"
node "$repo_root/plugins/copilot-subagent/scripts/dist/cli.js" status --job-id <job-id>
node "$repo_root/plugins/copilot-subagent/scripts/dist/cli.js" result --job-id <job-id>
```

## Rules

- Delegate mode may edit files in the current working directory.
- Do not commit, push, create branches, or open pull requests through this skill.
- When the job completes, report the stable JSON result and the touched files.
