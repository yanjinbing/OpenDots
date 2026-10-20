#!/usr/bin/env bash
set -Eeuo pipefail

: "${APP_ORIGIN:?APP_ORIGIN must be set.}"
container_hostname="$(hostname)"
export APP_ORIGIN="${APP_ORIGIN//\$\{HOSTNAME\}/$container_hostname}"

node /app/dist/server/browser/index.js &
browser_pid=$!

node /app/dist/server/server/index.js &
app_pid=$!

stop_children() {
  kill -TERM "$browser_pid" "$app_pid" 2>/dev/null || true
}

trap stop_children INT TERM EXIT

set +e
wait -n "$browser_pid" "$app_pid"
status=$?
set -e

stop_children
wait "$browser_pid" 2>/dev/null || true
wait "$app_pid" 2>/dev/null || true
trap - EXIT
exit "$status"
