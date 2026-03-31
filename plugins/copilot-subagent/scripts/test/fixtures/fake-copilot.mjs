#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import path from "node:path";

function getFlagValue(name, argv) {
  const index = argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }

  return argv[index + 1];
}

function getPrompt(argv) {
  return getFlagValue("-p", argv) ?? "";
}

function printJson(text, sessionId = "fake-session") {
  console.log(
    JSON.stringify({
      type: "assistant",
      sessionId,
      message: {
        content: [
          {
            type: "output_text",
            text,
          },
        ],
      },
    }),
  );
}

async function main() {
  const argv = process.argv.slice(2);

  if (argv.includes("--version")) {
    process.stdout.write("GitHub Copilot CLI fake 0.0.0\n");
    return;
  }

  const prompt = getPrompt(argv);

  if (prompt.includes("AUTH_FAILURE")) {
    process.stderr.write("Authentication failed. Run copilot login.\n");
    process.exit(1);
    return;
  }

  if (prompt.includes("PERMISSION_FAILURE")) {
    process.stderr.write("Permission denied by policy.\n");
    process.exit(1);
    return;
  }

  if (prompt.includes("LONG_RUNNING")) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  if (prompt.includes("DELEGATE_WRITE_FILE")) {
    await writeFile(
      path.join(process.cwd(), "delegate-output.txt"),
      "delegated change\n",
      "utf8",
    );
  }

  if (prompt.includes("NO_SENTINEL")) {
    printJson("Completed without sentinel output.");
    return;
  }

  if (prompt.includes("MALFORMED_SENTINEL")) {
    printJson("Malformed sentinel.\nCOPILOT_SUBAGENT_RESULT: {not-valid-json");
    return;
  }

  if (prompt.includes("adversarial code review")) {
    printJson(
      [
        "P1 Missing regression test for the changed behavior.",
        'COPILOT_SUBAGENT_RESULT: {"status":"completed","summary":"Found one high-severity regression risk.","touchedFiles":[],"sessionId":null,"error":null}',
      ].join("\n"),
      "fake-adversarial-session",
    );
    return;
  }

  if (prompt.includes("read-only code review")) {
    printJson(
      [
        "No findings.",
        'COPILOT_SUBAGENT_RESULT: {"status":"completed","summary":"No findings.","touchedFiles":[],"sessionId":null,"error":null}',
      ].join("\n"),
      "fake-review-session",
    );
    return;
  }

  printJson(
    [
      "Implemented the delegated task.",
      'COPILOT_SUBAGENT_RESULT: {"status":"completed","summary":"Implemented the delegated task.","touchedFiles":["delegate-output.txt"],"sessionId":null,"error":null}',
    ].join("\n"),
    "fake-delegate-session",
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});

