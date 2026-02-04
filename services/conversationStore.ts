/**
 * workspace별 대화 이력 저장·로드. electron-store 사용, 키는 workspace 경로 해시.
 */

import { createHash } from "node:crypto";
import Store from "electron-store";

const MAX_TURNS = 50;

export interface HistoryTurn {
  role: "user" | "assistant";
  text: string;
}

const store = new Store<Record<string, HistoryTurn[]>>({
  name: "gemini-ssalmuk",
});

function historyKey(workspaceRoot: string): string {
  if (!workspaceRoot.trim()) return "conversationHistory_default";
  const hash = createHash("sha256")
    .update(workspaceRoot)
    .digest("hex")
    .slice(0, 24);
  return `conversationHistory_${hash}`;
}

/** 해당 workspace의 대화 이력 반환 (최근 N턴 유지됨). */
export function getHistory(workspaceRoot: string): HistoryTurn[] {
  const key = historyKey(workspaceRoot);
  const list = store.get(key);
  return Array.isArray(list) ? list : [];
}

/** 한 턴(user + assistant) 추가. 최대 턴 수 초과 시 앞쪽 잘라냄. */
export function appendTurn(
  workspaceRoot: string,
  userText: string,
  assistantText: string
): void {
  const key = historyKey(workspaceRoot);
  const list = getHistory(workspaceRoot);
  list.push(
    { role: "user", text: userText },
    { role: "assistant", text: assistantText }
  );
  const trimmed = list.slice(-MAX_TURNS);
  store.set(key, trimmed);
}

/** 해당 workspace 대화 이력 삭제. */
export function clearHistory(workspaceRoot: string): void {
  store.delete(historyKey(workspaceRoot));
}
