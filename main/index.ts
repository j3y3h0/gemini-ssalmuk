/**
 * Electron 메인 프로세스: 창 생성, 에이전트/작업 디렉터리 IPC, 저장소 연동.
 */

import { app, BrowserWindow, ipcMain, dialog } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Store from "electron-store";
import { runAgent } from "../services/gemini.js";
import {
  getHistory,
  appendTurn,
  clearHistory,
} from "../services/conversationStore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const store = new Store<{ workspaceRoot: string; geminiApiKey: string }>({
  name: "gemini-ssalmuk",
});

/** Preload는 CommonJS여야 함. 개발: cwd 기준; 패키징: 앱 루트는 __dirname/../.. (dist/main -> app). */
function getPreloadPath(): string {
  if (app.isPackaged) {
    return path.join(__dirname, "..", "..", "preload", "preload.cjs");
  }
  return path.join(process.cwd(), "preload", "preload.cjs");
}

function getWindowUrl(): string {
  return path.join(__dirname, "..", "renderer", "index.html");
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(getWindowUrl());
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("apiKey:get", () => store.get("geminiApiKey", ""));
ipcMain.handle("apiKey:set", (_event, key: string) => {
  store.set("geminiApiKey", typeof key === "string" ? key : "");
  return store.get("geminiApiKey", "");
});

ipcMain.handle("history:get", (_event, workspaceRoot: string) =>
  getHistory(workspaceRoot ?? "")
);
ipcMain.handle("history:clear", (_event, workspaceRoot: string) => {
  clearHistory(workspaceRoot ?? "");
});

ipcMain.handle("workspace:get", () => store.get("workspaceRoot", ""));

ipcMain.handle("workspace:set", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"],
  });
  if (result.canceled || result.filePaths.length === 0)
    return store.get("workspaceRoot", "");
  const dir = result.filePaths[0];
  store.set("workspaceRoot", dir);
  return dir;
});

ipcMain.handle(
  "agent:send",
  async (
    _event,
    payload: { message: string; workspaceRoot: string }
  ): Promise<
    { success: true; text: string } | { success: false; error: string }
  > => {
    try {
      const apiKey = store.get("geminiApiKey", "");
      const workspaceRoot = payload.workspaceRoot || "";
      const historyMessages = getHistory(workspaceRoot);
      const win = BrowserWindow.getAllWindows()[0];
      const text = await runAgent({
        workspaceRoot,
        userMessage: payload.message,
        apiKey: apiKey || undefined,
        historyMessages:
          historyMessages.length > 0 ? historyMessages : undefined,
        onToolCall: (name, args) => {
          if (win && !win.isDestroyed()) {
            win.webContents.send("agent:toolCall", {
              name,
              args: JSON.stringify(args),
            });
          }
        },
        onNodeEnter: (node) => {
          if (win && !win.isDestroyed()) {
            win.webContents.send("agent:graphEvent", { node, phase: "enter" });
          }
        },
        onNodeExit: (node) => {
          if (win && !win.isDestroyed()) {
            win.webContents.send("agent:graphEvent", { node, phase: "exit" });
          }
        },
      });
      appendTurn(workspaceRoot, payload.message, text);
      return { success: true, text };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error };
    }
  }
);
