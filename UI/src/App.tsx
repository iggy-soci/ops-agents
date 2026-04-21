import { useState } from "react";
import TabBar from "./components/TabBar";
import AgentChat from "./components/AgentChat";
import AuthGate from "./components/AuthGate";
import { useClaudeAuth } from "./hooks/useClaudeAuth";

export interface Agent {
  id: string;
  label: string;
  emoji: string;
  description: string;
  configDir: string;
  suggestions: string[];
}

export const AGENTS: Agent[] = [
  {
    id: "product-analytics",
    label: "Product Analytics",
    emoji: "📊",
    description: "Feature adoption, page traffic, NPS, retention — powered by Pendo",
    configDir: "product-analytics-agent",
    suggestions: [
      "What features had the highest adoption last month?",
      "Show me NPS trend for this quarter",
      "Which accounts have not used the dashboard in 30 days?",
      "How is the onboarding guide performing?",
    ],
  },
  {
    id: "release-ops",
    label: "Release Ops",
    emoji: "🚀",
    description: "Deployment status, release notes, rollout tracking",
    configDir: "release-ops-agent",
    suggestions: [
      "What is the status of the current release?",
      "Show me all deployments this week",
      "Any rollbacks in the last 30 days?",
    ],
  },
];

export default function App() {
  const [activeAgentId, setActiveAgentId] = useState(AGENTS[0].id);
  const { status, retry } = useClaudeAuth();
  const activeAgent = AGENTS.find((a) => a.id === activeAgentId) ?? AGENTS[0];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <div className="titlebar">
        <div className="titlebar__logo">
          <div className="titlebar__logo-mark">O</div>
          <span className="titlebar__name">Ops Agents</span>
        </div>
      </div>
      <TabBar
        agents={AGENTS}
        activeId={activeAgentId}
        onSelect={setActiveAgentId}
        authStatus={status}
      />
      {status === "unauthenticated" ? (
        <AuthGate onRetry={retry} />
      ) : (
        <AgentChat key={activeAgent.id} agent={activeAgent} />
      )}
    </div>
  );
}
