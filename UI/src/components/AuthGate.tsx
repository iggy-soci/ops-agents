interface Props {
  onRetry: () => void;
}

export default function AuthGate({ onRetry }: Props) {
  return (
    <div className="auth-gate">
      <div className="auth-gate__icon">🔐</div>
      <div className="auth-gate__title">Sign in to Claude</div>
      <p className="auth-gate__desc">
        Ops Agents runs on your Claude account. Open a terminal and sign in,
        then come back and click Retry.
      </p>
      <div className="auth-gate__cmd">claude auth login</div>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <button className="btn btn--primary" onClick={onRetry}>
          Retry
        </button>
        <button
          className="btn btn--ghost"
          onClick={() => {
            import("@tauri-apps/api/core").then(({ invoke }) =>
              invoke("open_auth_terminal").catch(() => {})
            );
          }}
        >
          Open Terminal
        </button>
      </div>
    </div>
  );
}
