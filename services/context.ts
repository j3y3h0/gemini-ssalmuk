/**
 * 시스템 인스트럭션용 전체 프로젝트 컨텍스트(트리 + 핵심 파일 내용) 생성.
 * SRP: 트리와 파일 내용을 토큰/크기 제한으로 집계.
 */

import path from "node:path";
import fs from "fs-extra";
import { buildProjectTree } from "../utils/projectTree.js";

const SOURCE_EXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".json",
  ".md",
  ".mjs",
  ".cjs",
]);
const PRIORITY_FILES = [
  "package.json",
  "tsconfig.json",
  "README.md",
  "PROJECT.md",
];

export interface BuildProjectContextOptions {
  maxFiles?: number;
  maxCharsPerFile?: number;
  maxTotalChars?: number;
}

const DEFAULT_MAX_FILES = 40;
const DEFAULT_MAX_CHARS_PER_FILE = 8000;
const DEFAULT_MAX_TOTAL_CHARS = 120_000;

export function buildProjectContext(
  workspaceRoot: string,
  options: BuildProjectContextOptions = {}
): string {
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  const maxCharsPerFile = options.maxCharsPerFile ?? DEFAULT_MAX_CHARS_PER_FILE;
  const maxTotalChars = options.maxTotalChars ?? DEFAULT_MAX_TOTAL_CHARS;

  const tree = buildProjectTree(workspaceRoot);
  const header = "## 프로젝트 디렉터리 구조\n```\n" + tree + "\n```\n\n";

  const files: { rel: string; content: string }[] = [];
  let totalChars = 0;

  function collect(dir: string, relDir: string): void {
    if (files.length >= maxFiles || totalChars >= maxTotalChars) return;
    let entries: { name: string; isFile: () => boolean }[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const priorityFirst = [...entries].sort((a, b) => {
      const aP = PRIORITY_FILES.indexOf(a.name);
      const bP = PRIORITY_FILES.indexOf(b.name);
      if (aP !== -1 && bP !== -1) return aP - bP;
      if (aP !== -1) return -1;
      if (bP !== -1) return 1;
      if (a.isFile() !== b.isFile()) return a.isFile() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    for (const e of priorityFirst) {
      if (files.length >= maxFiles || totalChars >= maxTotalChars) break;
      const rel = relDir ? `${relDir}/${e.name}` : e.name;
      if (e.isFile()) {
        const ext = path.extname(e.name).toLowerCase();
        if (!SOURCE_EXT.has(ext)) continue;
        const full = path.join(dir, e.name);
        try {
          const raw = fs.readFileSync(full, "utf-8");
          const content =
            raw.length > maxCharsPerFile
              ? raw.slice(0, maxCharsPerFile) + "\n... (truncated)"
              : raw;
          files.push({ rel, content });
          totalChars += content.length;
        } catch {
          // 읽기 불가 시 스킵
        }
      } else if (!["node_modules", ".git", "dist", "build"].includes(e.name)) {
        collect(path.join(dir, e.name), rel);
      }
    }
  }

  collect(workspaceRoot, "");

  const fileSections = files
    .map((f) => `### ${f.rel}\n\`\`\`\n${f.content}\n\`\`\`\n`)
    .join("\n");

  return header + "## 선택된 파일 내용\n\n" + fileSections;
}
