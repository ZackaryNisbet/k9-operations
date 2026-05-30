#!/usr/bin/env bash
# Superset workspace setup for k9-operations.
# Runs every time a new workspace (git worktree) is created.
set -euo pipefail

echo "==> Installing npm dependencies"
npm install

# This app talks to a hosted Supabase project (and optional third-party APIs)
# via Vite env vars. Those secrets live in a git-ignored .env, so copy the
# root repo's .env into the workspace if it exists; otherwise seed from the
# committed template so the dev server can at least boot.
if [ -n "${SUPERSET_ROOT_PATH:-}" ] && [ -f "$SUPERSET_ROOT_PATH/.env" ]; then
  echo "==> Copying .env from root repo"
  cp "$SUPERSET_ROOT_PATH/.env" .env
elif [ ! -f .env ]; then
  echo "==> No root .env found; seeding .env from .env.example (fill in real values)"
  cp .env.example .env
fi

# Local MCP config is git-ignored too; carry it over from the root repo when present.
if [ -n "${SUPERSET_ROOT_PATH:-}" ] && [ -f "$SUPERSET_ROOT_PATH/.mcp.json" ] && [ ! -f .mcp.json ]; then
  echo "==> Copying .mcp.json from root repo"
  cp "$SUPERSET_ROOT_PATH/.mcp.json" .mcp.json
fi

echo "==> Setup complete"
