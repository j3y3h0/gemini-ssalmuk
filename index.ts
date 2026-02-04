/**
 * Electron 진입점. 개발 시 npm run dev (빌드 후 Electron 실행).
 * Electron이 dist/main/index.js를 로드할 때는 사용되지 않음; CLI 테스트용으로 사용 가능.
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
