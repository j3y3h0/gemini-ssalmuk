/// <reference types="vite/client" />

interface ElectronAPI {
  getApiKey: () => Promise<string>;
  setApiKey: (key: string) => Promise<string>;
  getWorkspace: () => Promise<string>;
  setWorkspace: () => Promise<string>;
  getHistory: (
    workspaceRoot: string
  ) => Promise<{ role: string; text: string }[]>;
  clearHistory: (workspaceRoot: string) => Promise<void>;
  sendMessage: (
    message: string,
    workspaceRoot: string
  ) => Promise<
    { success: true; text: string } | { success: false; error: string }
  >;
  onToolCall: (
    cb: (data: { name: string; args: string }) => void
  ) => () => void;
  onGraphEvent: (
    cb: (data: { node: string; phase: "enter" | "exit" }) => void
  ) => () => void;
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}

export {};
