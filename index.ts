/**
 * Electron entry point. In dev, run: npm run dev (builds then launches Electron).
 * This file is not used when Electron loads dist/main/index.js; it can be used for CLI tests.
 */

import { runAgent } from "./services/gemini.js";

async function main(): Promise<void> {
  if (process.argv[2] === "cli" && process.argv[3]) {
    const msg = process.argv.slice(3).join(" ");
    const workspace = process.argv[4] ?? process.cwd();
    const text = await runAgent({
      workspaceRoot: workspace,
      userMessage: msg,
      onToolCall: (name, args) => console.log("[tool]", name, args),
    });
    console.log(text);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
