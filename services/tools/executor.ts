/**
 * 모델의 도구 호출 실행. 단일 책임: 도구 실행 및 결과 반환.
 * 모든 경로는 workspaceRoot 기준; 오류 시 { error: string } 반환해 모델이 재시도하도록 함.
 */

import path from "node:path";
import fs from "fs-extra";
import { execa } from "execa";

const DEFAULT_ENCODING = "utf-8";
const DEFAULT_TIMEOUT_MS = 60_000;

function resolvePath(workspaceRoot: string, rawPath: string): string {
  const p = path.isAbsolute(rawPath)
    ? rawPath
    : path.join(workspaceRoot, rawPath);
  const normalized = path.normalize(p);
  if (!normalized.startsWith(path.normalize(workspaceRoot))) {
    throw new Error(`Path outside workspace: ${rawPath}`);
  }
  return normalized;
}

export async function executeReadFile(
  workspaceRoot: string,
  args: { path: string; encoding?: string }
): Promise<{ content?: string; error?: string }> {
  try {
    const filePath = resolvePath(workspaceRoot, args.path);
    const encoding = (args.encoding as BufferEncoding) || DEFAULT_ENCODING;
    const content = await fs.readFile(filePath, encoding);
    const text = typeof content === "string" ? content : String(content);
    return { content: text };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: message };
  }
}

export async function executeWriteFile(
  workspaceRoot: string,
  args: {
    path: string;
    content?: string;
    oldString?: string;
    newString?: string;
  }
): Promise<{ written?: boolean; error?: string }> {
  try {
    const filePath = resolvePath(workspaceRoot, args.path);
    if (args.oldString != null && args.newString != null) {
      const existing = await fs.readFile(filePath, DEFAULT_ENCODING);
      const updated = (existing as string).replace(
        args.oldString,
        args.newString
      );
      await fs.writeFile(filePath, updated, DEFAULT_ENCODING);
    } else if (args.content != null) {
      await fs.ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, args.content, DEFAULT_ENCODING);
    } else {
      return {
        error: "Either content or both oldString and newString are required.",
      };
    }
    return { written: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: message };
  }
}

export async function executeRunCommand(
  workspaceRoot: string,
  args: { command: string; cwd?: string; timeoutMs?: number }
): Promise<{
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  error?: string;
}> {
  try {
    const cwd = args.cwd ? resolvePath(workspaceRoot, args.cwd) : workspaceRoot;
    const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const { stdout, stderr, exitCode } = await execa(args.command, {
      shell: true,
      cwd,
      timeout: timeoutMs,
      reject: false,
    });
    return {
      stdout: stdout ?? "",
      stderr: stderr ?? "",
      exitCode: exitCode ?? 0,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: message };
  }
}

export type ToolName = "read_file" | "write_file" | "run_command";

export const toolExecutors: Record<
  ToolName,
  (
    workspaceRoot: string,
    args: Record<string, unknown>
  ) => Promise<Record<string, unknown>>
> = {
  read_file: (root, args) =>
    executeReadFile(root, args as { path: string; encoding?: string }),
  write_file: (root, args) =>
    executeWriteFile(
      root,
      args as {
        path: string;
        content?: string;
        oldString?: string;
        newString?: string;
      }
    ),
  run_command: (root, args) =>
    executeRunCommand(
      root,
      args as { command: string; cwd?: string; timeoutMs?: number }
    ),
};
