/**
 * Preload: expose only agent and workspace APIs to renderer via contextBridge.
 */

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  getWorkspace: () => ipcRenderer.invoke("workspace:get"),
  setWorkspace: () => ipcRenderer.invoke("workspace:set"),
  sendMessage: (message: string, workspaceRoot: string) =>
    ipcRenderer.invoke("agent:send", { message, workspaceRoot }),
  onToolCall: (cb: (data: { name: string; args: string }) => void) => {
    const handler = (_: unknown, data: { name: string; args: string }) => cb(data);
    ipcRenderer.on("agent:toolCall", handler);
    return () => ipcRenderer.removeListener("agent:toolCall", handler);
  },
});
