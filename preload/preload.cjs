const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  getApiKey: () => ipcRenderer.invoke("apiKey:get"),
  setApiKey: (key) => ipcRenderer.invoke("apiKey:set", key),
  getWorkspace: () => ipcRenderer.invoke("workspace:get"),
  setWorkspace: () => ipcRenderer.invoke("workspace:set"),
  sendMessage: (message, workspaceRoot) =>
    ipcRenderer.invoke("agent:send", { message, workspaceRoot }),
  onToolCall: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on("agent:toolCall", handler);
    return () => ipcRenderer.removeListener("agent:toolCall", handler);
  },
});
