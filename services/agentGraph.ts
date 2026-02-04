/**
 * LangGraph 기반 에이전트 그래프: model ↔ tools 사이클, 노드 진입/이탈 이벤트 지원.
 * SRP: 그래프 정의·실행만; Gemini·도구 호출은 gemini/tools 모듈에 위임.
 */

import { Annotation, StateGraph, END } from "@langchain/langgraph";
import { GoogleGenAI } from "@google/genai";
import { geminiConfig } from "../config/gemini.js";
import { toolDeclarations } from "./tools/declarations.js";
import { toolExecutors, type ToolName } from "./tools/executor.js";
import { getSystemInstruction } from "./gemini.js";
import type {
  ContentTurn,
  ContentPart,
  HistoryMessage,
  RunAgentOptions,
} from "./gemini.js";

const MAX_TURNS = 20;

/** 그래프 State: contents 누적, 나머지 LastValue. */
const AgentStateAnnotation = Annotation.Root({
  contents: Annotation<ContentTurn[]>({
    reducer: (left: ContentTurn[], right: ContentTurn | ContentTurn[]) =>
      left.concat(Array.isArray(right) ? right : [right]),
    default: () => [],
  }),
  workspaceRoot: Annotation<string>(),
  currentToolCalls:
    Annotation<Array<{ name: string; args: Record<string, unknown> }>>(),
  lastModelResponse: Annotation<string>(),
  turnCount: Annotation<number>(),
});

type AgentState = typeof AgentStateAnnotation.State;

/** config.configurable에 주입되는 그래프 이벤트 콜백. */
export interface GraphEventCallbacks {
  onNodeEnter?: (node: string) => void;
  onNodeExit?: (node: string) => void;
}

function getConfigCallbacks(config: {
  configurable?: Record<string, unknown>;
}): GraphEventCallbacks {
  const c = config?.configurable ?? {};
  return {
    onNodeEnter:
      typeof c.onNodeEnter === "function"
        ? (c.onNodeEnter as (node: string) => void)
        : undefined,
    onNodeExit:
      typeof c.onNodeExit === "function"
        ? (c.onNodeExit as (node: string) => void)
        : undefined,
  };
}

/** model 노드: Gemini 호출, functionCall 있으면 currentToolCalls 설정, 없으면 lastModelResponse 설정. */
async function modelNode(
  state: AgentState,
  config: { configurable?: Record<string, unknown> }
): Promise<Partial<AgentState>> {
  const { onNodeEnter, onNodeExit } = getConfigCallbacks(config);
  onNodeEnter?.("model");

  try {
    const apiKey =
      (config.configurable?.apiKey as string)?.trim() ||
      geminiConfig.apiKey?.trim();
    if (!apiKey) throw new Error("Gemini API 키를 등록해 주세요.");

    const ai = new GoogleGenAI({ apiKey });
    const systemInstruction = getSystemInstruction(state.workspaceRoot);
    const tools = [
      {
        functionDeclarations: toolDeclarations.map((d) => ({
          name: d.name,
          description: d.description,
          parametersJsonSchema: d.parametersJsonSchema,
        })),
      },
    ];

    const response = await ai.models.generateContent({
      model: geminiConfig.model,
      contents: state.contents.map((c) => ({
        role: c.role,
        parts: c.parts.map((p: ContentPart) => {
          if (p.text !== undefined) return { text: p.text };
          if (p.functionCall) return { functionCall: p.functionCall };
          if (p.functionResponse)
            return { functionResponse: p.functionResponse };
          return { text: "" };
        }),
      })),
      config: { tools, systemInstruction },
    });

    const candidate = response.candidates?.[0];
    const parts = candidate?.content?.parts;
    const functionCalls = (
      response as {
        functionCalls?: Array<{ name: string; args: Record<string, unknown> }>;
      }
    ).functionCalls;
    const turnCount = (state.turnCount ?? 0) + 1;

    if (functionCalls && functionCalls.length > 0 && turnCount <= MAX_TURNS) {
      const modelTurn: ContentTurn = {
        role: "model",
        parts: (parts ?? []) as ContentPart[],
      };
      return {
        contents: [modelTurn],
        currentToolCalls: functionCalls,
        lastModelResponse: "",
        turnCount,
      };
    }

    const lastText =
      ((response as { text?: string }).text ?? state.lastModelResponse ?? "") ||
      "(No final response.)";
    return {
      lastModelResponse: lastText,
      currentToolCalls: [],
      turnCount,
    };
  } finally {
    onNodeExit?.("model");
  }
}

/** tools 노드: currentToolCalls 실행 후 contents에 functionResponse 턴 추가. */
async function toolsNode(
  state: AgentState,
  config: { configurable?: Record<string, unknown> }
): Promise<Partial<AgentState>> {
  const { onNodeEnter, onNodeExit } = getConfigCallbacks(config);
  onNodeEnter?.("tools");

  try {
    const calls = state.currentToolCalls ?? [];
    const workspaceRoot = state.workspaceRoot?.trim() || null;
    const onToolCall = config.configurable?.onToolCall as
      | ((name: string, args: Record<string, unknown>) => void)
      | undefined;

    const functionResponseParts: ContentPart[] = [];
    for (const fc of calls) {
      onToolCall?.(fc.name, fc.args);
      const result = workspaceRoot
        ? toolExecutors[fc.name as ToolName]
          ? await toolExecutors[fc.name as ToolName](workspaceRoot, fc.args)
          : { error: `Unknown tool: ${fc.name}` }
        : { error: "작업 디렉터리를 먼저 설정하세요." };
      functionResponseParts.push({
        functionResponse: { name: fc.name, response: { result } },
      });
    }

    const userTurn: ContentTurn = {
      role: "user",
      parts: functionResponseParts,
    };
    return {
      contents: [userTurn],
      currentToolCalls: [],
    };
  } finally {
    onNodeExit?.("tools");
  }
}

/** model → tools 또는 __end__ 조건부 라우팅. */
function routeAfterModel(state: AgentState): "tools" | typeof END {
  const hasCalls = (state.currentToolCalls?.length ?? 0) > 0;
  const underLimit = (state.turnCount ?? 0) <= MAX_TURNS;
  return hasCalls && underLimit ? "tools" : END;
}

/** 컴파일된 그래프 실행기 (캐시용 타입). */
interface GraphRunner {
  invoke(input: AgentState, config?: object): Promise<AgentState>;
}

let compiledGraph: GraphRunner | null = null;

function getGraph(): GraphRunner {
  if (!compiledGraph) {
    const builder = new StateGraph(AgentStateAnnotation)
      .addNode("model", modelNode)
      .addNode("tools", toolsNode)
      .addEdge("__start__", "model")
      .addConditionalEdges("model", routeAfterModel, ["tools", END])
      .addEdge("tools", "model");
    compiledGraph = builder.compile() as unknown as GraphRunner;
  }
  return compiledGraph;
}

export interface RunAgentGraphOptions
  extends RunAgentOptions,
    GraphEventCallbacks {}

/**
 * 그래프 실행: 초기 state 구성 후 invoke, 최종 lastModelResponse 반환.
 */
export async function runAgentGraph(
  options: RunAgentGraphOptions
): Promise<string> {
  const {
    workspaceRoot,
    userMessage,
    apiKey: optionKey,
    historyMessages,
    onToolCall,
    onNodeEnter,
    onNodeExit,
  } = options;
  const apiKey = (optionKey?.trim() || geminiConfig.apiKey)?.trim();
  if (!apiKey) throw new Error("Gemini API 키를 등록해 주세요.");

  const contents: ContentTurn[] = (historyMessages ?? []).map(
    (t: HistoryMessage) =>
      t.role === "user"
        ? { role: "user" as const, parts: [{ text: t.text }] }
        : { role: "model" as const, parts: [{ text: t.text }] }
  );
  contents.push({ role: "user", parts: [{ text: userMessage }] });

  const initialState: AgentState = {
    contents,
    workspaceRoot: workspaceRoot ?? "",
    currentToolCalls: [],
    lastModelResponse: "",
    turnCount: 0,
  };

  const config = {
    configurable: {
      apiKey,
      onToolCall,
      onNodeEnter,
      onNodeExit,
    },
  };

  const graph = getGraph();
  const final = await graph.invoke(initialState, config);
  return (final?.lastModelResponse as string) || "(No final response.)";
}
