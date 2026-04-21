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
    .map((m) => {
      const role = m.role === "user" ? "User" : "Assistant";
      return `${role}: ${m.content}`;
    })
    .join("\n\n");

  return `Previous conversation:\n\n${history}\n\nUser: ${newPrompt}\n\nContinue the conversation, answering the latest user message. Do not repeat the conversation history.`;
}

export default function AgentChat({ agent }: { agent: Agent }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId] = useState(() => `${agent.id}-${Date.now()}`);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const unlistenRef = useRef<(() => void) | null>(null);
  const messagesRef = useRef<Message[]>([]);

  // Keep ref in sync with state for use in callbacks
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    let mounted = true;
    listen<StreamPayload>("agent-stream", (event) => {
      if (!mounted) return;
      const { chunk, done, is_error } = event.payload;

      if (done) {
        setIsStreaming(false);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === "streaming" ? { ...m, id: `msg-${Date.now()}`, streaming: false } : m
          )
        );
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
        if (existing) {
          return prev.map((m) =>
            m.id === "streaming" ? { ...m, content: m.content + chunk } : m
          );
        }
        return [...prev, { id: "streaming", role: "agent", content: chunk, streaming: true }];
      });
    }).then((unlisten) => { unlistenRef.current = unlisten; });

    return () => {
      mounted = false;
      unlistenRef.current?.();
    };
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

    // Add user message to UI
    const userMsg: Message = { id: `user-${Date.now()}`, role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);

    // Build prompt with conversation history
    const promptWithHistory = buildPromptWithHistory(messagesRef.current, text);

    try {
      await invoke("run_agent", {
        agentName: agent.configDir,
        prompt: promptWithHistory,
        sessionId,
      });
    } catch (err) {
      setIsStreaming(false);
      setMessages((prev) => [
        ...prev,
        { id: `err-${Date.now()}`, role: "agent", content: `⚠️ Failed to reach agent: ${err}` },
      ]);
    }
  }, [input, isStreaming, agent.configDir, sessionId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const sendSuggestion = (s: string) => {
    setInput(s);
    setTimeout(() => send(), 50);
  };

  return (
    <div className="agent-container">
      <div className="messages">
        {messages.length === 0 && (
          <div className="welcome">
            <div className="welcome__agent">{agent.emoji}</div>
            <div className="welcome__title">{agent.label}</div>
            <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>{agent.description}</p>
            <div className="welcome__chips">
              {agent.suggestions.map((s) => (
                <button key={s} className="welcome__chip" onClick={() => sendSuggestion(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} agentEmoji={agent.emoji} />
        ))}
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
            placeholder={`Ask ${agent.label}...`}
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
                <path d="M7 2L12 7L7 12M2 7H12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        </div>
        <div className="input-hint">Enter to send · Shift+Enter for new line</div>
      </div>
    </div>
  );
}
