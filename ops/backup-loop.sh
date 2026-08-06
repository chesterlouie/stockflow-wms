#!/bin/sh
set -eu
mkdir -p /backups
while true; do
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  target="/backups/stockflow-${stamp}.dump"
  pg_dump --format=custom --compress=9 --file="$target"
  pg_restore --list "$target" >/dev/null
  sha256sum "$target" >"${target}.sha256"
  find /backups -type f -name 'stockflow-*.dump' -mtime "+${BACKUP_RETENTION_DAYS}" -delete
  find /backups -type f -name 'stockflow-*.dump.sha256' -mtime "+${BACKUP_RETENTION_DAYS}" -delete
  sleep 86400
done
