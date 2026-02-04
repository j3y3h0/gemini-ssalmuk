/**
 * Electron main process: window, IPC for agent and workspace, store for persistence.
 */

import { app, BrowserWindow, ipcMain, dialog } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Store from "electron-store";
import { runAgent } from "../services/gemini.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const store = new Store<{ workspaceRoot: string; geminiApiKey: string }>({
  name: "gemini-ssalmuk",
});

/** Preload must be CommonJS; load from app path so source preload.cjs is used. */
function getPreloadPath(): string {
  const appPath = process.env.ELECTRON_APP_PATH ?? process.cwd();
  return path.join(appPath, "preload", "preload.cjs");
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
      const text = await runAgent({
        workspaceRoot: payload.workspaceRoot || "",
        userMessage: payload.message,
        apiKey: apiKey || undefined,
        onToolCall: (name, args) => {
          const win = BrowserWindow.getAllWindows()[0];
          if (win && !win.isDestroyed()) {
            win.webContents.send("agent:toolCall", {
              name,
              args: JSON.stringify(args),
            });
          }
        },
      });
      return { success: true, text };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error };
    }
  }
);
