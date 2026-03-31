---
name: copilot-setup
description: Verify the repo-local copilot-subagent runtime, confirm that GitHub Copilot CLI is installed, and report authentication or model prerequisites before using delegate or review flows.
---

# Copilot Setup

Use this skill before the first delegate or review run, or whenever the Copilot runtime looks unhealthy.

## Preconditions

- The repo-local plugin should exist at `plugins/copilot-subagent`.
- If `plugins/copilot-subagent/scripts/dist/cli.js` is missing, run `npm install` and `npm run build` from the repo root first.

## Invocation

Run:

```bash
repo_root="$(git rev-parse --show-toplevel)"
node "$repo_root/plugins/copilot-subagent/scripts/dist/cli.js" doctor
```

## What To Report

- Whether `copilot` was detected and which version was found.
- Whether BYOK is active through `COPILOT_PROVIDER_BASE_URL`.
- If the binary is missing or authentication is not configured, stop and tell the user exactly what is missing.
- Do not make a live model call from this skill. `doctor` must stay local and non-invasive.
