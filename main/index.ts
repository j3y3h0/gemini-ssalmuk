/**
 * Electron main process: window, IPC for agent and workspace, store for persistence.
 */

import { app, BrowserWindow, ipcMain, dialog } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Store from "electron-store";
import { runAgent } from "../services/gemini.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const store = new Store<{ workspaceRoot: string }>({ name: "gemini-ssalmuk" });

function getWindowUrl(): string {
  const isDev = process.env.NODE_ENV !== "production";
  if (isDev) {
    return path.join(__dirname, "..", "renderer", "index.html");
  }
  return path.join(__dirname, "..", "renderer", "index.html");
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, "preload", "index.js"),
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

ipcMain.handle("workspace:get", () => store.get("workspaceRoot", ""));

ipcMain.handle("workspace:set", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"],
  });
  if (result.canceled || result.filePaths.length === 0) return store.get("workspaceRoot", "");
  const dir = result.filePaths[0];
  store.set("workspaceRoot", dir);
  return dir;
});

ipcMain.handle(
  "agent:send",
  async (
    _event,
    payload: { message: string; workspaceRoot: string }
  ): Promise<{ success: true; text: string } | { success: false; error: string }> => {
    try {
      const text = await runAgent({
        workspaceRoot: payload.workspaceRoot || "",
        userMessage: payload.message,
        onToolCall: (name, args) => {
          const win = BrowserWindow.getAllWindows()[0];
          if (win && !win.isDestroyed()) {
            win.webContents.send("agent:toolCall", { name, args: JSON.stringify(args) });
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
