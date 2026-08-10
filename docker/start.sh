#!/bin/sh
set -eu

DATA_ROOT="${DATA_DIR:-/data}"
mkdir -p "${DATA_ROOT}/templates" /run/nginx /var/log/nginx

echo "[start] DATA_DIR=${DATA_ROOT}"
if [ -f "${DATA_ROOT}/app.sqlite" ]; then
  echo "[start] existing database found at ${DATA_ROOT}/app.sqlite"
  echo "[start] if user counts drop after redeploy, add Coolify Persistent Storage mounted at /data"
else
  echo "[start] WARNING: no database at ${DATA_ROOT}/app.sqlite — a new empty database will be created"
  echo "[start] mount persistent storage at /data BEFORE creating users, or accounts are lost each redeploy"
fi
if [ "${ADMIN_PASSWORD_RESET:-}" = "true" ]; then
  echo "[start] ADMIN_PASSWORD_RESET=true — admin password will be updated from ADMIN_PASSWORD on startup"
fi

cd /app/server
node src/index.js &
API_PID=$!

if ! nginx -t 2>&1; then
  echo "[start] nginx config test failed"
  exit 1
fi

nginx -g 'daemon off;' &
NGINX_PID=$!

term() {
  kill -TERM "$API_PID" "$NGINX_PID" 2>/dev/null || true
  wait "$API_PID" "$NGINX_PID" 2>/dev/null || true
}
trap term INT TERM

sleep 1
if ! kill -0 "$API_PID" 2>/dev/null; then
  echo "[start] node API exited during startup"
  exit 1
fi
if ! kill -0 "$NGINX_PID" 2>/dev/null; then
  echo "[start] nginx exited during startup"
  exit 1
fi

echo "[start] node pid=$API_PID nginx pid=$NGINX_PID"

while kill -0 "$API_PID" 2>/dev/null && kill -0 "$NGINX_PID" 2>/dev/null; do
  sleep 2
done

echo "[start] process exited — shutting down"
term
exit 1
