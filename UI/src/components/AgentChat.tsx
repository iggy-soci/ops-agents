import { useState, useRef, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Agent } from "../App";
import MessageBubble from "./MessageBubble";

export interface Message {
  id: string;
  role: "user" | "agent";
  content: string;
  streaming?: boolean;
}

interface StreamPayload {
  session_id: string;
  chunk: string;
  done: boolean;
  is_error?: boolean;
}

function buildPromptWithHistory(messages: Message[], newPrompt: string): string {
  if (messages.length === 0) return newPrompt;
  const history = messages
    .filter((m) => !m.streaming)
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n");
  return `Previous conversation:\n\n${history}\n\nUser: ${newPrompt}\n\nContinue the conversation, answering the latest user message. Do not repeat the conversation history.`;
}

function ThinkingIndicator({ elapsed, emoji }: { elapsed: number; emoji: string }) {
  return (
    <div className="message message--agent">
      <div className="message__avatar message__avatar--agent">{emoji}</div>
      <div className="message__body">
        <div className="message__role">Agent</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", gap: 4 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{
                width: 6, height: 6, borderRadius: "50%",
                background: "var(--accent)",
                animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
              }} />
            ))}
          </div>
          <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
            {elapsed < 5 ? "Thinking..." : elapsed < 15 ? `Working on it... ${Math.floor(elapsed)}s` : `Still processing... ${Math.floor(elapsed)}s`}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function AgentChat({ agent }: { agent: Agent }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [sessionId] = useState(() => `${agent.id}-${Date.now()}`);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const unlistenRef = useRef<(() => void) | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isStreaming]);

  useEffect(() => {
    if (isStreaming) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((e) => e + 0.1), 100);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setElapsed(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isStreaming]);

  useEffect(() => {
    let mounted = true;
    listen<StreamPayload>("agent-stream", (event) => {
      if (!mounted) return;
      const { chunk, done, is_error } = event.payload;
      if (done) {
        setIsStreaming(false);
        setMessages((prev) => prev.map((m) => m.id === "streaming" ? { ...m, id: `msg-${Date.now()}`, streaming: false } : m));
        return;
      }
      if (is_error) {
        setIsStreaming(false);
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== "streaming"),
          { id: `err-${Date.now()}`, role: "agent", content: `⚠️ ${chunk}`, streaming: false },
        ]);
        return;
      }
      setMessages((prev) => {
        const existing = prev.find((m) => m.id === "streaming");
        if (existing) return prev.map((m) => m.id === "streaming" ? { ...m, content: m.content + chunk } : m);
        return [...prev, { id: "streaming", role: "agent", content: chunk, streaming: true }];
      });
    }).then((unlisten) => { unlistenRef.current = unlisten; });
    return () => { mounted = false; unlistenRef.current?.(); };
  }, [sessionId]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [input]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");
    setIsStreaming(true);
    const userMsg: Message = { id: `user-${Date.now()}`, role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    const promptWithHistory = buildPromptWithHistory(messagesRef.current, text);
    try {
      await invoke("run_agent", { agentName: agent.configDir, prompt: promptWithHistory, sessionId });
    } catch (err) {
      setIsStreaming(false);
      setMessages((prev) => [
        ...prev,
        { id: `err-${Date.now()}`, role: "agent", content: `⚠️ Failed to reach agent: ${err}` },
      ]);
    }
  }, [input, isStreaming, agent.configDir, sessionId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const sendSuggestion = (s: string) => { setInput(s); setTimeout(() => send(), 50); };

  return (
    <div className="agent-container">
      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-6px); }
        }
      `}</style>
      <div className="messages">
        {messages.length === 0 && !isStreaming && (
          <div className="welcome">
            <div className="welcome__agent">{agent.emoji}</div>
            <div className="welcome__title">{agent.label}</div>
            <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>{agent.description}</p>
            <div className="welcome__chips">
              {agent.suggestions.map((s) => (
                <button key={s} className="welcome__chip" onClick={() => sendSuggestion(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} agentEmoji={agent.emoji} />
        ))}
        {isStreaming && <ThinkingIndicator elapsed={elapsed} emoji={agent.emoji} />}
        <div ref={messagesEndRef} />
      </div>
      <div className="input-bar">
        <div className="input-wrap">
          <textarea
            ref={textareaRef}
            className="input-field"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isStreaming ? "Agent is thinking..." : `Ask ${agent.label}...`}
            rows={1}
            disabled={isStreaming}
          />
          <button className="input-send" onClick={send} disabled={!input.trim() || isStreaming} title="Send">
            {isStreaming ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <rect x="3" y="3" width="8" height="8" rx="1" fill="currentColor" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 2L12 7L7 12M2 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        </div>
        <div className="input-hint">
          {isStreaming ? `Processing... ${Math.floor(elapsed)}s` : "Enter to send · Shift+Enter for new line"}
        </div>
      </div>
    </div>
  );
}
