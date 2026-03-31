---
name: copilot-adversarial-review
description: Run a skeptical, adversarial read-only review of the current repository state using GitHub Copilot CLI through the repo-local copilot-subagent plugin.
---

# Copilot Adversarial Review

Use this skill when you want a harsher review pass that assumes the changes are wrong until proven safe.

## Preconditions

- Run `$copilot-setup` if needed.
- The runtime should exist at `plugins/copilot-subagent/scripts/dist/cli.js`.

## Invocation

```bash
repo_root="$(git rev-parse --show-toplevel)"
cat <<'EOF' | node "$repo_root/plugins/copilot-subagent/scripts/dist/cli.js" run --mode adversarial-review --cwd "$PWD"
Adversarially review the current changes for hidden regressions, trust-boundary problems, and missing tests.
EOF
```

## Rules

- Keep the run read-only.
- Focus on exploitability, rollout mistakes, hidden coupling, and test gaps.
- Findings still come first, followed by the stable JSON result.
