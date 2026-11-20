#!/bin/sh
# Runs the scheduled jobs that Vercel's own cron would normally trigger (see vercel.json),
# on the same UTC schedule, against the app container over the internal docker network.
set -eu

APP_INTERNAL_URL="http://app:3000"
last_run_date=""

run_job() {
  path="$1"
  echo "==> $(date -u +%H:%M) calling $path"
  curl -sS -m 60 -o /dev/null -w "    -> %{http_code}\n" \
    -H "Authorization: Bearer ${CRON_SECRET}" \
    "${APP_INTERNAL_URL}${path}" || echo "    -> request failed"
}

echo "vm-cron: waiting for the app to be reachable..."
until curl -sS -m 5 -o /dev/null "${APP_INTERNAL_URL}/api/health"; do
  sleep 5
done
echo "vm-cron: app is up, watching the clock (UTC)."

while true; do
  today=$(date -u +%Y-%m-%d)
  hour=$(date -u +%H)
  minute=$(date -u +%M)

  if [ "$minute" = "00" ]; then
    job_key=""
    case "$hour" in
      02) path="/api/cron/expire-redemptions"; job_key="expire-$today" ;;
      03) path="/api/cron/retention"; job_key="retention-$today" ;;
      04) path="/api/cron/reconcile-balances"; job_key="reconcile-$today" ;;
      05) path="/api/cron/send-outbox"; job_key="outbox-$today" ;;
      06) path="/api/cron/loyalty-daily"; job_key="daily-$today" ;;
      *) path="" ;;
    esac
    if [ -n "$job_key" ] && [ "$job_key" != "$last_run_date" ]; then
      run_job "$path"
      last_run_date="$job_key"
    fi
  fi

  # The outbox (queued emails) benefits from running more than once a day
  if [ "$minute" = "15" ] || [ "$minute" = "45" ]; then
    run_job "/api/cron/send-outbox"
  fi

  sleep 60
done
