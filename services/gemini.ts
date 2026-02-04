/**
 * Gemini SDK agent loop: send user message, handle function calls in a loop, return final text.
 * SRP: orchestrate model + tools; tools and context are injected.
 */

import { GoogleGenAI } from "@google/genai";
import { geminiConfig, SYSTEM_INSTRUCTION } from "../config/gemini.js";
import { toolDeclarations } from "./tools/declarations.js";
import { toolExecutors, type ToolName } from "./tools/executor.js";
import { buildProjectContext } from "./context.js";

const MAX_TURNS = 20;

export interface RunAgentOptions {
  workspaceRoot: string;
  userMessage: string;
  /** API key (GUI/store). If not set, falls back to geminiConfig.apiKey from env. */
  apiKey?: string;
  onToolCall?: (name: string, args: Record<string, unknown>) => void;
}

export interface ContentPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}

export interface ContentTurn {
  role: "user" | "model";
  parts: ContentPart[];
}

function getSystemInstruction(workspaceRoot: string): string {
  const base = SYSTEM_INSTRUCTION;
  if (!workspaceRoot.trim()) {
    return (
      base +
      "\n\n작업 디렉터리가 아직 설정되지 않았다. 파일/명령 도구는 작업 디렉터리가 지정된 후에 사용 가능하다."
    );
  }
  const projectContext = buildProjectContext(workspaceRoot);
  return base + "\n\n작업 디렉터리: " + workspaceRoot + "\n\n" + projectContext;
}

export async function runAgent(options: RunAgentOptions): Promise<string> {
  const { workspaceRoot, userMessage, apiKey: optionKey, onToolCall } = options;
  const apiKey = (optionKey?.trim() || geminiConfig.apiKey)?.trim();
  if (!apiKey) {
    throw new Error(
      "Gemini API 키를 등록해 주세요. (설정 또는 .env GEMINI_API_KEY)"
    );
  }

  const ai = new GoogleGenAI({ apiKey });
  const systemInstruction = getSystemInstruction(workspaceRoot);

  const tools = [
    {
      functionDeclarations: toolDeclarations.map((d) => ({
        name: d.name,
        description: d.description,
        parametersJsonSchema: d.parametersJsonSchema,
      })),
    },
  ];

  const contents: ContentTurn[] = [
    { role: "user", parts: [{ text: userMessage }] },
  ];

  let turns = 0;
  let lastText = "";

  while (turns < MAX_TURNS) {
    turns++;

    const config: {
      tools: typeof tools;
      systemInstruction?: string;
    } = { tools };
    if (systemInstruction) config.systemInstruction = systemInstruction;

    const response = await ai.models.generateContent({
      model: geminiConfig.model,
      contents: contents.map((c) => ({
        role: c.role,
        parts: c.parts.map((p) => {
          if (p.text !== undefined) return { text: p.text };
          if (p.functionCall) return { functionCall: p.functionCall };
          if (p.functionResponse)
            return { functionResponse: p.functionResponse };
          return { text: "" };
        }),
      })),
      config,
    });

    const candidate = response.candidates?.[0];
    if (!candidate?.content?.parts?.length) {
      lastText =
        (response as { text?: string }).text ?? lastText ?? "No response.";
      break;
    }

    const parts = candidate.content.parts;
    const functionCalls = (
      response as {
        functionCalls?: Array<{ name: string; args: Record<string, unknown> }>;
      }
    ).functionCalls;

    if (functionCalls && functionCalls.length > 0) {
      contents.push({
        role: "model",
        parts: candidate.content.parts as ContentPart[],
      });

      const functionResponseParts: ContentPart[] = [];
      const root = workspaceRoot.trim() || null;
      for (const fc of functionCalls) {
        onToolCall?.(fc.name, fc.args);
        const result = root
          ? toolExecutors[fc.name as ToolName]
            ? await toolExecutors[fc.name as ToolName](root, fc.args)
            : { error: `Unknown tool: ${fc.name}` }
          : { error: "작업 디렉터리를 먼저 설정하세요." };
        functionResponseParts.push({
          functionResponse: { name: fc.name, response: { result } },
        });
      }
      contents.push({ role: "user", parts: functionResponseParts });
      continue;
    }

    lastText = (response as { text?: string }).text ?? "";
    break;
  }

  return lastText || "(No final response.)";
}
