/**
 * Preload: contextBridge로 에이전트·작업 디렉터리 API만 렌더러에 노출.
 */

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  getApiKey: () => ipcRenderer.invoke("apiKey:get"),
  setApiKey: (key: string) => ipcRenderer.invoke("apiKey:set", key),
  getWorkspace: () => ipcRenderer.invoke("workspace:get"),
  setWorkspace: () => ipcRenderer.invoke("workspace:set"),
  sendMessage: (message: string, workspaceRoot: string) =>
    ipcRenderer.invoke("agent:send", { message, workspaceRoot }),
  onToolCall: (cb: (data: { name: string; args: string }) => void) => {
    const handler = (_: unknown, data: { name: string; args: string }) =>
      cb(data);
    ipcRenderer.on("agent:toolCall", handler);
    return () => ipcRenderer.removeListener("agent:toolCall", handler);
  },
});
