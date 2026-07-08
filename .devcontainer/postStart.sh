#!/usr/bin/env bash
set -euo pipefail

# ~/.claude.json is a single file, so it can't be volume-mounted directly
# (Docker volumes only attach to directories). Instead, park its real
# content inside the already-persisted ~/.claude volume and symlink to it,
# so it survives container rebuilds too.
STATE_FILE="$HOME/.claude/.claude.json.state"
if [ -f "$HOME/.claude.json" ] && [ ! -L "$HOME/.claude.json" ]; then
  if [ -f "$STATE_FILE" ]; then
    rm -f "$HOME/.claude.json"
  else
    mv "$HOME/.claude.json" "$STATE_FILE"
  fi
fi
touch "$STATE_FILE"
ln -sf "$STATE_FILE" "$HOME/.claude.json"

# Copy SSH keys/config from the read-only WSL mount so permissions can be
# fixed without touching the host files. Refreshed on every start.
if [ -d "$HOME/.ssh-host" ]; then
  mkdir -p "$HOME/.ssh"
  cp -rL "$HOME/.ssh-host/." "$HOME/.ssh/"
  chmod 700 "$HOME/.ssh"
  find "$HOME/.ssh" -type f -exec chmod 600 {} \;
  chmod 644 "$HOME/.ssh/config" 2>/dev/null || true
  chmod 644 "$HOME/.ssh"/*.pub 2>/dev/null || true
  chmod 644 "$HOME/.ssh/known_hosts" 2>/dev/null || true
fi
