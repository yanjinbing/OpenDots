#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  printf 'Environment file not found: %s\n' "$ENV_FILE" >&2
  exit 1
fi

DOWN_ARGS=(down --remove-orphans)
if [[ "${REMOVE_VOLUMES:-0}" == "1" ]]; then
  DOWN_ARGS+=(--volumes)
fi

exec docker compose \
  --env-file "$ENV_FILE" \
  --profile browser \
  -f "$ROOT_DIR/compose.yml" \
  "${DOWN_ARGS[@]}"
