# copilot-plugin-codex

`copilot-subagent` is a repo-local Codex plugin that wraps the GitHub Copilot CLI as a companion agent for delegated coding work and independent review passes.

## What It Ships

- A plugin manifest at `plugins/copilot-subagent/.codex-plugin/plugin.json`
- A TypeScript runtime at `plugins/copilot-subagent/scripts/`
- User-facing skills for setup, delegate, review, adversarial review, status, result, and cancel

## Build

From the repo root:

```bash
npm install
npm run build
```

The compiled runtime lands at `plugins/copilot-subagent/scripts/dist/cli.js`.

The compiled runtime is generated locally and not checked in. Re-run the build whenever you change anything under `plugins/copilot-subagent/scripts/src/`.

## Runtime Commands

Doctor:

```bash
repo_root="$(git rev-parse --show-toplevel)"
node "$repo_root/plugins/copilot-subagent/scripts/dist/cli.js" doctor
```

Foreground delegate:

```bash
repo_root="$(git rev-parse --show-toplevel)"
cat <<'EOF' | node "$repo_root/plugins/copilot-subagent/scripts/dist/cli.js" run --mode delegate --cwd "$PWD"
Implement the requested change.
EOF
```

Background delegate:

```bash
repo_root="$(git rev-parse --show-toplevel)"
cat <<'EOF' | node "$repo_root/plugins/copilot-subagent/scripts/dist/cli.js" run --mode delegate --cwd "$PWD" --background
Implement the requested change.
EOF
```

Read-only review:

```bash
repo_root="$(git rev-parse --show-toplevel)"
cat <<'EOF' | node "$repo_root/plugins/copilot-subagent/scripts/dist/cli.js" run --mode review --cwd "$PWD"
Review the current changes for bugs and missing tests.
EOF
```

Adversarial review:

```bash
repo_root="$(git rev-parse --show-toplevel)"
cat <<'EOF' | node "$repo_root/plugins/copilot-subagent/scripts/dist/cli.js" run --mode adversarial-review --cwd "$PWD"
Assume the current changes are wrong and try to break them.
EOF
```

Job management:

```bash
repo_root="$(git rev-parse --show-toplevel)"
node "$repo_root/plugins/copilot-subagent/scripts/dist/cli.js" status --job-id <job-id>
node "$repo_root/plugins/copilot-subagent/scripts/dist/cli.js" result --job-id <job-id>
node "$repo_root/plugins/copilot-subagent/scripts/dist/cli.js" cancel --job-id <job-id>
```

## Model Selection

Pass `--model <model-id>` through `run` when you want a specific Copilot model family, for example:

- `claude-sonnet-4.6`
- `claude-opus-4.6`
- `gpt-5.4`

If you use BYOK, Copilot CLI will also honor `COPILOT_PROVIDER_BASE_URL`, `COPILOT_PROVIDER_TYPE`, `COPILOT_PROVIDER_API_KEY` or `COPILOT_PROVIDER_BEARER_TOKEN`, and `COPILOT_MODEL`.

## Write Scope

- `delegate` may modify files in the target `--cwd`.
- `review` and `adversarial-review` are configured as read-only runs with file-read tools only.
- None of the flows commit, push, create branches, or open pull requests.

## Runtime Data

The plugin stores job state under `plugins/copilot-subagent/.runtime/`:

- `jobs/` for persisted job metadata
- `logs/` for stdout and stderr
- `prompts/` for the captured prompt payload for each job

That directory is intentionally gitignored.
