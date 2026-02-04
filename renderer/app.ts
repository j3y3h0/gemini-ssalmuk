/**
 * Renderer: chat UI, workspace selection, IPC to main.
 */

declare global {
  interface Window {
    api: {
      getApiKey: () => Promise<string>;
      setApiKey: (key: string) => Promise<string>;
      getWorkspace: () => Promise<string>;
      setWorkspace: () => Promise<string>;
      sendMessage: (
        message: string,
        workspaceRoot: string
      ) => Promise<
        { success: true; text: string } | { success: false; error: string }
      >;
      onToolCall: (
        cb: (data: { name: string; args: string }) => void
      ) => () => void;
    };
  }
}

const messagesEl = document.getElementById("messages")!;
const toolStatusEl = document.getElementById("tool-status")!;
const workspacePathEl = document.getElementById("workspace-path")!;
const apiKeyInputEl = document.getElementById(
  "api-key-input"
)! as HTMLInputElement;
const apiKeyStatusEl = document.getElementById("api-key-status")!;
const btnSaveApiKey = document.getElementById(
  "btn-save-api-key"
)! as HTMLButtonElement;
const inputEl = document.getElementById("input")! as HTMLTextAreaElement;
const btnWorkspace = document.getElementById("btn-workspace")!;
const btnSend = document.getElementById("btn-send")! as HTMLButtonElement;

function appendMessage(role: "user" | "assistant", text: string): void {
  const div = document.createElement("div");
  div.className = `message ${role}`;
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function setToolStatus(text: string): void {
  toolStatusEl.textContent = text;
}

function maskApiKey(key: string): string {
  if (!key || key.length < 8) return key ? "••••••••" : "";
  return key.slice(0, 4) + "••••••••" + key.slice(-4);
}

async function loadApiKey(): Promise<void> {
  const key = await window.api.getApiKey();
  if (key) {
    apiKeyInputEl.placeholder = maskApiKey(key);
    apiKeyInputEl.value = "";
    apiKeyStatusEl.textContent = "등록됨";
  } else {
    apiKeyInputEl.placeholder = "Gemini API 키 입력 후 저장";
    apiKeyStatusEl.textContent = "";
  }
}

async function loadWorkspace(): Promise<void> {
  const root = await window.api.getWorkspace();
  workspacePathEl.textContent = root || "(미설정)";
  return root as unknown as void;
}

loadApiKey();
loadWorkspace();

btnSaveApiKey.addEventListener("click", async () => {
  const key = apiKeyInputEl.value.trim();
  await window.api.setApiKey(key);
  apiKeyInputEl.value = "";
  await loadApiKey();
});

apiKeyInputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    btnSaveApiKey.click();
  }
});

btnWorkspace.addEventListener("click", async () => {
  await window.api.setWorkspace();
  await loadWorkspace();
});

const unsubscribeTool = window.api.onToolCall(({ name, args }) => {
  setToolStatus(`도구 호출: ${name}(${args})`);
});

window.addEventListener("beforeunload", () => {
  unsubscribeTool();
});

btnSend.addEventListener("click", sendMessage);
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

async function sendMessage(): Promise<void> {
  const message = inputEl.value.trim();
  if (!message) return;
  const workspaceRoot = await window.api.getWorkspace();
  inputEl.value = "";
  appendMessage("user", message);
  btnSend.disabled = true;
  setToolStatus("응답 대기 중...");

  try {
    const result = await window.api.sendMessage(message, workspaceRoot || "");
    setToolStatus("");
    if (result.success) {
      appendMessage("assistant", result.text);
    } else {
      appendMessage("assistant", `오류: ${result.error}`);
    }
  } finally {
    btnSend.disabled = false;
  }
}
