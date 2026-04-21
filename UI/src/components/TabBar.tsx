import type { Agent } from "../App";

interface Props {
  agents: Agent[];
  activeId: string;
  onSelect: (id: string) => void;
  authStatus: "checking" | "authenticated" | "unauthenticated";
}

export default function TabBar({ agents, activeId, onSelect, authStatus }: Props) {
  return (
    <div className="tabbar">
      {agents.map((agent) => (
        <button
          key={agent.id}
          className={`tab ${agent.id === activeId ? "tab--active" : ""}`}
          onClick={() => onSelect(agent.id)}
          title={agent.description}
        >
          <span className="tab__dot" />
          <span>{agent.emoji}</span>
          <span>{agent.label}</span>
        </button>
      ))}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, paddingBottom: 8 }}>
        <span
          className={`status-dot ${
            authStatus === "authenticated"
              ? "status-dot--ok"
              : authStatus === "unauthenticated"
              ? "status-dot--err"
              : "status-dot--pending"
          }`}
        />
        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
          {authStatus === "authenticated"
            ? "Connected"
            : authStatus === "unauthenticated"
            ? "Not signed in"
            : "Checking..."}
        </span>
      </div>
    </div>
  );
}
