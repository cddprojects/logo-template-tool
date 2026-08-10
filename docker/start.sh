#!/bin/sh
set -eu

DATA_ROOT="${DATA_DIR:-/data}"
mkdir -p "${DATA_ROOT}/templates" /run/nginx /var/log/nginx

echo "[start] DATA_DIR=${DATA_ROOT}"
if [ -f "${DATA_ROOT}/app.sqlite" ]; then
  echo "[start] existing database found — data should persist across redeploys if /data is a mounted volume"
else
  echo "[start] no database yet — will create on first API start"
  echo "[start] IMPORTANT: mount persistent storage to /data in Coolify or data will reset each deploy"
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
