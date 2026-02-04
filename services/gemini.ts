/**
 * Gemini 에이전트 진입점: LangGraph 기반 runAgentGraph 호출.
 * SRP: 옵션 검증 및 그래프 실행 위임.
 */

import { geminiConfig, SYSTEM_INSTRUCTION } from "../config/gemini.js";
import { buildProjectContext } from "./context.js";
import { runAgentGraph } from "./agentGraph.js";

/** UI/저장소용 대화 턴 (텍스트만). */
export interface HistoryMessage {
  role: "user" | "assistant";
  text: string;
}

export interface RunAgentOptions {
  workspaceRoot: string;
  userMessage: string;
  /** API 키(GUI/저장소). 없으면 env의 geminiConfig.apiKey 사용. */
  apiKey?: string;
  /** 과거 대화 턴. 있으면 contents 앞에 넣어 컨텍스트로 사용. */
  historyMessages?: HistoryMessage[];
  onToolCall?: (name: string, args: Record<string, unknown>) => void;
  /** 그래프 노드 진입 시 (시각화용). */
  onNodeEnter?: (node: string) => void;
  /** 그래프 노드 이탈 시 (시각화용). */
  onNodeExit?: (node: string) => void;
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

export function getSystemInstruction(workspaceRoot: string): string {
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
  return runAgentGraph(options);
}
