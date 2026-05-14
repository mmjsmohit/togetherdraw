#!/bin/sh
set -eu

pids=""
public_port="${PORT:-3000}"

start_service() {
  name="$1"
  directory="$2"
  shift 2

  echo "Starting ${name}..."
  (
    cd "${directory}"
    "$@"
  ) &

  pid="$!"
  pids="${pids} ${pid}"
}

stop_services() {
  for pid in ${pids}; do
    kill "${pid}" 2>/dev/null || true
  done
}

trap 'stop_services; exit 143' INT TERM

start_service "http-backend" "/prod/http-backend" env PORT=4000 node --import tsx dist/index.js
start_service "ws-backend" "/prod/ws-backend" env PORT=4001 node --import tsx dist/index.js
start_service "web" "/prod/web" env NODE_ENV=production HOSTNAME=0.0.0.0 PORT="${public_port}" node server.mjs

set +e
wait -n
status="$?"
stop_services
wait
exit "${status}"
