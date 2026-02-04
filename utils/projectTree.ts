/**
 * Build a directory tree string for a workspace. SRP: tree representation only.
 */

import path from "node:path";
import fs from "fs-extra";

const DEFAULT_IGNORE = [
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".nuxt",
  "coverage",
  ".cache",
];

export interface ProjectTreeOptions {
  maxDepth?: number;
  ignoreDirs?: string[];
}

export function buildProjectTree(
  workspaceRoot: string,
  options: ProjectTreeOptions = {}
): string {
  const maxDepth = options.maxDepth ?? 6;
  const ignoreDirs = new Set(options.ignoreDirs ?? DEFAULT_IGNORE);

  function walk(dir: string, prefix: string, depth: number): string[] {
    if (depth > maxDepth) return [];
    const lines: string[] = [];
    let entries: { name: string; isDirectory: () => boolean }[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    entries = entries.filter(
      (e) => !e.name.startsWith(".") || e.name === ".env" || e.name === ".env.example"
    );
    entries = entries.filter((e) => !e.isDirectory() || !ignoreDirs.has(e.name));
    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory())
        return a.isDirectory() ? 1 : -1;
      return a.name.localeCompare(b.name);
    });

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const isLast = i === entries.length - 1;
      const connector = isLast ? "└── " : "├── ";
      const name = entry.isDirectory() ? `${entry.name}/` : entry.name;
      lines.push(prefix + connector + name);
      if (entry.isDirectory()) {
        const nextPrefix = prefix + (isLast ? "    " : "│   ");
        lines.push(...walk(path.join(dir, entry.name), nextPrefix, depth + 1));
      }
    }
    return lines;
  }

  const rootName = path.basename(workspaceRoot) || ".";
  const lines = [rootName + "/", ...walk(workspaceRoot, "", 1)];
  return lines.join("\n");
}
