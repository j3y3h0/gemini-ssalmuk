import { useState, useEffect, useRef, useCallback } from "react";

type Message = { role: "user" | "assistant"; text: string };

function maskApiKey(key: string): string {
  if (!key || key.length < 8) return key ? "••••••••" : "";
  return key.slice(0, 4) + "••••••••" + key.slice(-4);
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [workspacePath, setWorkspacePath] = useState("(미설정)");
  const [apiKeyPlaceholder, setApiKeyPlaceholder] = useState(
    "Gemini API 키 입력 후 저장"
  );
  const [apiKeyStatus, setApiKeyStatus] = useState("");
  const [apiKeyValue, setApiKeyValue] = useState("");
  const [toolStatus, setToolStatus] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const api = window.api;
  if (!api) {
    return (
      <div style={{ padding: 16, color: "red" }}>
        Electron API가 로드되지 않았습니다. (preload 확인)
      </div>
    );
  }

  const loadWorkspace = useCallback(async () => {
    const root = await api.getWorkspace();
    setWorkspacePath(root || "(미설정)");
  }, [api]);

  const loadApiKey = useCallback(async () => {
    const key = await api.getApiKey();
    if (key) {
      setApiKeyPlaceholder(maskApiKey(key));
      setApiKeyValue("");
      setApiKeyStatus("등록됨");
    } else {
      setApiKeyPlaceholder("Gemini API 키 입력 후 저장");
      setApiKeyStatus("");
    }
  }, [api]);

  useEffect(() => {
    loadWorkspace();
    loadApiKey();
  }, [loadWorkspace, loadApiKey]);

  useEffect(() => {
    const unsubscribe = api.onToolCall(({ name, args }) => {
      setToolStatus(`도구 호출: ${name}(${args})`);
    });
    return () => unsubscribe();
  }, [api]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSaveApiKey = async () => {
    const key = apiKeyValue.trim();
    await api.setApiKey(key);
    setApiKeyValue("");
    await loadApiKey();
  };

  const handleDeleteApiKey = async () => {
    await api.setApiKey("");
    await loadApiKey();
  };

  const hasApiKey = apiKeyStatus === "등록됨";

  const handleSelectWorkspace = async () => {
    await api.setWorkspace();
    await loadWorkspace();
  };

  const handleSend = async () => {
    const message = input.trim();
    if (!message || sending) return;
    const workspaceRoot = await api.getWorkspace();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: message }]);
    setSending(true);
    setToolStatus("응답 대기 중...");

    try {
      const result = await api.sendMessage(message, workspaceRoot || "");
      setToolStatus("");
      if (result.success) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: result.text },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: `오류: ${result.error}` },
        ]);
      }
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      <header className="header">
        <h1>Gemini 코딩 에이전트</h1>
        <div className="api-key-row">
          <label htmlFor="api-key-input" className="api-key-label">
            API Key:
          </label>
          <input
            id="api-key-input"
            type="password"
            className="api-key-input"
            placeholder={apiKeyPlaceholder}
            value={apiKeyValue}
            onChange={(e) => setApiKeyValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                hasApiKey ? handleDeleteApiKey() : handleSaveApiKey();
              }
            }}
            autoComplete="off"
          />
          <button
            type="button"
            className="btn"
            onClick={hasApiKey ? handleDeleteApiKey : handleSaveApiKey}
          >
            {hasApiKey ? "삭제" : "저장"}
          </button>
          <span className="api-key-status-text">{apiKeyStatus}</span>
        </div>
        <div className="workspace-row">
          <span className="workspace-label">작업 디렉터리:</span>
          <span className="workspace-path" title={workspacePath}>
            {workspacePath}
          </span>
          <button type="button" className="btn" onClick={handleSelectWorkspace}>
            폴더 선택
          </button>
        </div>
      </header>
      <main className="main">
        <div className="messages">
          {messages.map((m, i) => (
            <div key={i} className={`message ${m.role}`}>
              {m.text}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
        <div className="tool-status" aria-live="polite">
          {toolStatus}
        </div>
        <div className="input-row">
          <textarea
            className="input"
            rows={2}
            placeholder="요청을 입력하세요..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sending}
          />
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSend}
            disabled={sending || !input.trim()}
          >
            전송
          </button>
        </div>
      </main>
    </>
  );
}
