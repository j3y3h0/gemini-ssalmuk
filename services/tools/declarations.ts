/**
 * Gemini function declarations for the coding agent.
 * SRP: Define tool schemas only; execution is in executor.ts.
 */

export interface FunctionDeclarationSchema {
  name: string;
  description: string;
  parametersJsonSchema: {
    type: "object";
    properties: Record<string, { type: string; description?: string }>;
    required: string[];
  };
}

export const readFileDeclaration: FunctionDeclarationSchema = {
  name: "read_file",
  description:
    "Read the contents of a file. Path is relative to the workspace root (cwd).",
  parametersJsonSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Relative path to the file from the workspace root.",
      },
      encoding: {
        type: "string",
        description: "Optional encoding, e.g. utf-8. Default is utf-8.",
      },
    },
    required: ["path"],
  },
};

export const writeFileDeclaration: FunctionDeclarationSchema = {
  name: "write_file",
  description:
    "Create or overwrite a file. Optionally replace only a substring (oldString -> newString) instead of full content.",
  parametersJsonSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Relative path to the file from the workspace root.",
      },
      content: {
        type: "string",
        description:
          "Full file content when not using oldString/newString. Required if oldString is not provided.",
      },
      oldString: {
        type: "string",
        description:
          "Exact substring to replace. When provided, newString must also be provided.",
      },
      newString: {
        type: "string",
        description: "Replacement string when using oldString.",
      },
    },
    required: ["path"],
  },
};

export const runCommandDeclaration: FunctionDeclarationSchema = {
  name: "run_command",
  description:
    "Execute a shell command in the workspace (or optional cwd). Returns stdout and stderr.",
  parametersJsonSchema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "Shell command to run, e.g. npm test, ls, npx tsc.",
      },
      cwd: {
        type: "string",
        description:
          "Optional working directory (relative to workspace). Default is workspace root.",
      },
      timeoutMs: {
        type: "number",
        description: "Optional timeout in milliseconds. Default 60000.",
      },
    },
    required: ["command"],
  },
};

export const toolDeclarations: FunctionDeclarationSchema[] = [
  readFileDeclaration,
  writeFileDeclaration,
  runCommandDeclaration,
];
