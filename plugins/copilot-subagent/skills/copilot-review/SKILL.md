---
name: copilot-review
description: Run a read-only code review against the current repository state using GitHub Copilot CLI through the repo-local copilot-subagent plugin.
---

# Copilot Review

Use this skill when you want an independent read-only review of the current repository state or diff.

## Preconditions

- Run `$copilot-setup` if needed.
- The runtime should exist at `plugins/copilot-subagent/scripts/dist/cli.js`.

## Invocation

```bash
repo_root="$(git rev-parse --show-toplevel)"
cat <<'EOF' | node "$repo_root/plugins/copilot-subagent/scripts/dist/cli.js" run --mode review --cwd "$PWD"
Review the current changes for correctness, regressions, rollout risk, and missing tests.
EOF
```

## Rules

- Review mode is read-only. It should not modify files.
- Findings come first. If nothing material is wrong, report `No findings.`.
- Summarize the stable JSON result after the review text.
