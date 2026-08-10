#!/bin/sh
set -e

mkdir -p "${DATA_DIR:-/data}/templates"

# API behind nginx
cd /app/server
node src/index.js &
API_PID=$!

nginx -g 'daemon off;' &
NGINX_PID=$!

term() {
  kill -TERM "$API_PID" "$NGINX_PID" 2>/dev/null || true
  wait "$API_PID" "$NGINX_PID" 2>/dev/null || true
}
trap term INT TERM

# Exit if either process dies
while kill -0 "$API_PID" 2>/dev/null && kill -0 "$NGINX_PID" 2>/dev/null; do
  sleep 2
done

echo "[start] process exited — shutting down"
term
exit 1
