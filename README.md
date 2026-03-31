# copilot-plugin-codex

`copilot-subagent` is a repo-local Codex plugin that wraps the GitHub Copilot CLI as a companion agent for delegated coding work and independent review passes.

## What It Ships

- A plugin manifest at `plugins/copilot-subagent/.codex-plugin/plugin.json`
- A TypeScript runtime at `plugins/copilot-subagent/scripts/`
- User-facing skills for setup, delegate, review, adversarial review, status, result, and cancel

## Install

### Prerequisites

- Codex with plugin support
- `git`, `node`, and `npm`
- GitHub Copilot CLI installed and authenticated

### Method 1: Ask Codex

If you want Codex to do the installation work for you, open a normal Codex session and paste this:

```text
Clone https://github.com/CaseyHillers/copilot-plugin-codex into ~/.codex/plugins/copilot-plugin-codex. Then run npm install and npm run build in that repo. After that, create or update ~/.agents/plugins/marketplace.json so it includes a local plugin entry named copilot-subagent that points to ./.codex/plugins/copilot-plugin-codex/plugins/copilot-subagent, while preserving any existing marketplace entries. When you're done, tell me to restart Codex and install "Copilot Subagent" from /plugins.
```

After Codex finishes:

1. Restart Codex.
2. Open `/plugins`.
3. Install `Copilot Subagent` from your personal plugin marketplace.
4. Optionally run `copilot-setup` or the `doctor` command below to verify the runtime.

### Method 2: Bash

```bash
set -euo pipefail

mkdir -p "$HOME/.codex/plugins" "$HOME/.agents/plugins"

if [ ! -d "$HOME/.codex/plugins/copilot-plugin-codex/.git" ]; then
  git clone https://github.com/CaseyHillers/copilot-plugin-codex.git \
    "$HOME/.codex/plugins/copilot-plugin-codex"
fi

git -C "$HOME/.codex/plugins/copilot-plugin-codex" pull --ff-only

cd "$HOME/.codex/plugins/copilot-plugin-codex"
npm install
npm run build

node --input-type=module <<'EOF'
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const marketplacePath = path.join(
  os.homedir(),
  ".agents",
  "plugins",
  "marketplace.json",
);

const pluginEntry = {
  name: "copilot-subagent",
  source: {
    source: "local",
    path: "./.codex/plugins/copilot-plugin-codex/plugins/copilot-subagent",
  },
  policy: {
    installation: "AVAILABLE",
    authentication: "ON_INSTALL",
  },
  category: "Productivity",
};

let marketplace = {
  name: "Personal Plugins",
  interface: {
    displayName: "Personal Plugins",
  },
  plugins: [],
};

if (fs.existsSync(marketplacePath)) {
  marketplace = JSON.parse(fs.readFileSync(marketplacePath, "utf8"));
  marketplace.plugins = Array.isArray(marketplace.plugins)
    ? marketplace.plugins
    : [];
  marketplace.name ||= "Personal Plugins";
  marketplace.interface ||= {};
  marketplace.interface.displayName ||= "Personal Plugins";
}

marketplace.plugins = [
  ...marketplace.plugins.filter((plugin) => plugin.name !== pluginEntry.name),
  pluginEntry,
];

fs.writeFileSync(marketplacePath, `${JSON.stringify(marketplace, null, 2)}\n`);
EOF
```

Then restart Codex, open `/plugins`, and install `Copilot Subagent`.

## Build

From the repo root:

```bash
npm install
npm run build
```

The compiled runtime lands at `plugins/copilot-subagent/scripts/dist/cli.js`.

The compiled runtime is generated locally and is not checked in. Fresh clones should run `npm run build` before using the plugin, and re-run the build whenever you change anything under `plugins/copilot-subagent/scripts/src/`.

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
