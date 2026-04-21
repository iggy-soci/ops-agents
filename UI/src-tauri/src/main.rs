#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde_json::json;
use std::env;
use std::path::PathBuf;
use std::process::Stdio;
use tauri::{AppHandle, Emitter};
use tokio::process::Command;

fn agent_dir(agent_name: &str) -> PathBuf {
    let home = env::var("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("/tmp"));
    home.join(".ops-agents").join(agent_name)
}

fn claude_bin() -> String {
    let home = env::var("HOME").unwrap_or_default();
    let candidates = vec![
        "/usr/local/bin/claude".to_string(),
        "/opt/homebrew/bin/claude".to_string(),
        format!("{}/.npm-global/bin/claude", home),
        "claude".to_string(),
    ];
    for c in &candidates {
        if std::path::Path::new(c).exists() {
            return c.clone();
        }
    }
    "claude".to_string()
}

#[tauri::command]
async fn check_claude_auth() -> Result<bool, String> {
    let output = Command::new(claude_bin())
        .arg("--version")
        .output()
        .await
        .map_err(|e| format!("claude not found: {e}"))?;
    if !output.status.success() {
        return Ok(false);
    }
    let status_out = Command::new(claude_bin())
        .arg("status")
        .output()
        .await
        .map_err(|e| format!("claude status failed: {e}"))?;
    let stdout = String::from_utf8_lossy(&status_out.stdout).to_lowercase();
    let ok = status_out.status.success()
        || stdout.contains("logged in")
        || stdout.contains("authenticated")
        || stdout.contains("pro")
        || stdout.contains("max")
        || stdout.contains("team")
        || stdout.contains("welcome");
    Ok(ok)
}

#[tauri::command]
async fn run_agent(
    app: AppHandle,
    agent_name: String,
    prompt: String,
    session_id: String,
) -> Result<(), String> {
    let dir = agent_dir(&agent_name);
    let mcp_config = dir.join(".mcp.json");
    let claude_md = dir.join("CLAUDE.md");

    let system_prompt = if claude_md.exists() {
        std::fs::read_to_string(&claude_md).unwrap_or_default()
    } else {
        String::new()
    };

    let mut cmd = Command::new(claude_bin());
    cmd.arg("-p")
        .arg(&prompt)
        .arg("--dangerously-skip-permissions")
        .env("HOME", env::var("HOME").unwrap_or_default())
        .env("PATH", env::var("PATH").unwrap_or_default())
        .env("PENDO_API_KEY", env::var("PENDO_API_KEY").unwrap_or_default())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    if mcp_config.exists() {
        cmd.arg("--mcp-config").arg(&mcp_config);
    }

    if !system_prompt.is_empty() {
        cmd.arg("--system-prompt").arg(&system_prompt);
    }

    let child = cmd.spawn()
        .map_err(|e| format!("Failed to spawn claude: {e}"))?;

    let output = child.wait_with_output()
        .await
        .map_err(|e| format!("Wait failed: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !stdout.is_empty() {
        let _ = app.emit("agent-stream", json!({
            "session_id": session_id,
            "chunk": stdout,
            "done": false,
        }));
    } else if !output.status.success() && !stderr.is_empty() {
        let _ = app.emit("agent-stream", json!({
            "session_id": session_id,
            "chunk": stderr.trim(),
            "done": false,
            "is_error": true,
        }));
    }

    let _ = app.emit("agent-stream", json!({
        "session_id": session_id,
        "chunk": "",
        "done": true,
    }));

    Ok(())
}

#[tauri::command]
async fn open_auth_terminal() -> Result<(), String> {
    Command::new("osascript")
        .args(["-e", r#"tell application "Terminal"
                do script "claude auth login"
                activate
            end tell"#])
        .spawn()
        .map_err(|e| format!("Failed to open terminal: {e}"))?;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            check_claude_auth,
            run_agent,
            open_auth_terminal,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
