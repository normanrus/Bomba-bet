#!/bin/sh
# Periodically dumps the database to /backups and prunes old archives.
set -e

INTERVAL="${BACKUP_INTERVAL_HOURS:-24}"
KEEP="${BACKUP_KEEP:-14}"
mkdir -p /backups

echo "[backup] loop started: every ${INTERVAL}h, keeping ${KEEP} archives"
while true; do
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  target="/backups/bombabet-${stamp}.sql.gz"

  if pg_dump --no-owner --clean --if-exists > "${target}.partial"; then
    gzip -9 "${target}.partial"
    mv "${target}.partial.gz" "${target}"
    echo "[backup] wrote ${target}"
  else
    rm -f "${target}.partial" "${target}.partial.gz"
    echo "[backup] dump failed" >&2
  fi

  # Keep only the newest N archives.
  ls -1t /backups/bombabet-*.sql.gz 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do
    rm -f "$old"
    echo "[backup] pruned $old"
  done

  sleep $((INTERVAL * 3600))
done
