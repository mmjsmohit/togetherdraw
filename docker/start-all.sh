#!/bin/sh
set -eu

pids=""

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

start_service "http-backend" "/prod/http-backend" pnpm start
start_service "ws-backend" "/prod/ws-backend" pnpm start
start_service "web" "/prod/web" env HOSTNAME=0.0.0.0 PORT=3000 pnpm start

set +e
wait -n
status="$?"
stop_services
wait
exit "${status}"
