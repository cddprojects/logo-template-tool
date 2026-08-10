#!/bin/sh
set -eu

mkdir -p "${DATA_DIR:-/data}/templates" /run/nginx /var/log/nginx

echo "[start] DATA_DIR=${DATA_DIR:-/data}"

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
