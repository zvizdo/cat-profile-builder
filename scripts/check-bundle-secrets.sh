#!/usr/bin/env bash
# Fails when a secret name appears in the client bundle (constitution, Deployment Gates).
# Run after `pnpm build`.
set -euo pipefail

static_dir=".next/static"
if [ ! -d "$static_dir" ]; then
  echo "check-bundle-secrets: $static_dir not found. Run pnpm build first." >&2
  exit 1
fi

if grep -rEl "SESSION_SECRET|SHELTER_|GCS_PRIVATE_BUCKET" "$static_dir"; then
  echo "check-bundle-secrets: a secret name reached the client bundle (files above)." >&2
  exit 1
fi

echo "check-bundle-secrets: no secret name in $static_dir."
