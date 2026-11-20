#!/bin/sh
# Runs on every container start: applies pending database migrations (safe to run
# repeatedly — it only applies what's new), then starts the Next.js server.
set -e

echo "==> Running database migrations..."
node_modules/.bin/tsx scripts/migrate-deploy.ts

echo "==> Starting server on port ${PORT:-3000}..."
exec node_modules/.bin/next start -p "${PORT:-3000}"
