import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { repoRoot } from "./helpers/testUtils.js";

const pluginRoot = path.join(repoRoot, "plugins", "copilot-subagent");

test("plugin manifest keeps the expected local-plugin shape", async () => {
  const manifest = JSON.parse(
    await readFile(path.join(pluginRoot, ".codex-plugin", "plugin.json"), "utf8"),
  ) as Record<string, unknown>;

  assert.equal(manifest.name, "copilot-subagent");
  assert.equal(manifest.skills, "./skills/");
  assert.ok(Array.isArray(manifest.keywords));
});

test("compiled runtime exists after the build step", async () => {
  await access(path.join(pluginRoot, "scripts", "dist", "cli.js"));
});

test("skills reference the built runtime and expected commands", async () => {
  const skills = [
    ["copilot-setup", ["doctor"]],
    ["copilot-delegate", ["run --mode delegate", "status --job-id", "result --job-id"]],
    ["copilot-review", ["run --mode review"]],
    ["copilot-adversarial-review", ["run --mode adversarial-review"]],
    ["copilot-status", ["status --job-id"]],
    ["copilot-result", ["result --job-id"]],
    ["copilot-cancel", ["cancel --job-id"]],
  ] as const;

  for (const [skillName, expectedSnippets] of skills) {
    const content = await readFile(
      path.join(pluginRoot, "skills", skillName, "SKILL.md"),
      "utf8",
    );
    assert.match(content, /plugins\/copilot-subagent\/scripts\/dist\/cli\.js/u);
    for (const snippet of expectedSnippets) {
      assert.match(content, new RegExp(snippet.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
    }
  }
});
