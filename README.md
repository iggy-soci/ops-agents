# ops-agents

Internal ops agent hub — a macOS app with multiple AI agents in a single tabbed interface.
Each agent runs on the team member own Claude subscription — no shared API keys.

## Prerequisites (each team member)

1. Claude Code CLI installed and authenticated
   npm install -g @anthropic-ai/claude-code
   claude auth login

2. Pendo API key in shell environment
   export PENDO_API_KEY="your-key-here"

## Development

cd product-analytics-agent/mcp/pendo && npm install
cd UI && npm install
npm run tauri:dev

## Build DMG

cd UI && npm run tauri:build
