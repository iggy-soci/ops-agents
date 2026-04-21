import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

type AuthStatus = "checking" | "authenticated" | "unauthenticated";

export function useClaudeAuth() {
  const [status, setStatus] = useState<AuthStatus>("checking");

  const check = useCallback(async () => {
    setStatus("checking");
    try {
      const ok = await invoke<boolean>("check_claude_auth");
      setStatus(ok ? "authenticated" : "unauthenticated");
    } catch {
      setStatus("unauthenticated");
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  return { status, retry: check };
}
