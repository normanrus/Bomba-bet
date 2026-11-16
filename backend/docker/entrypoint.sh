#!/bin/sh
# Applies migrations, ensures the bootstrap admin exists, then starts the API.
set -e

echo "[entrypoint] waiting for database..."
attempt=0
until node -e "
const { Client } = require('pg');
const c = new Client({ connectionString: process.env.DATABASE_URL });
c.connect().then(() => c.end()).then(() => process.exit(0)).catch(() => process.exit(1));
" 2>/dev/null; do
  attempt=$((attempt + 1))
  if [ "$attempt" -gt 60 ]; then
    echo "[entrypoint] database not reachable after 60 attempts" >&2
    exit 1
  fi
  sleep 2
done

echo "[entrypoint] running migrations..."
node dist/db/migrate.js

echo "[entrypoint] seeding bootstrap admin and settings..."
node dist/db/seed.js

if [ "${SEED_DEMO_DATA}" = "true" ]; then
  echo "[entrypoint] seeding demo data..."
  node dist/db/seed.js --demo
fi

echo "[entrypoint] starting API on port ${PORT:-4000}"
exec "$@"
