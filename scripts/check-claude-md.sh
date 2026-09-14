#!/usr/bin/env bash
# Fails when CLAUDE.md exceeds 200 lines (constitution, Governance → Runtime guidance).
set -euo pipefail

limit=200
lines=$(wc -l < CLAUDE.md | tr -d ' ')
if [ "$lines" -gt "$limit" ]; then
  echo "check-claude-md: CLAUDE.md has $lines lines; the ceiling is $limit." >&2
  exit 1
fi

echo "check-claude-md: CLAUDE.md has $lines lines (ceiling $limit)."
