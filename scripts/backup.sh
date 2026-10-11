#!/bin/sh
set -eu

destination=${1:-"scr-backup-$(date +%Y%m%d-%H%M%S).sqlite"}
container_backup=/data/.scr-backup.sqlite

docker compose exec -T scr sqlite3 /data/scr.sqlite ".backup '$container_backup'"
docker compose cp "scr:$container_backup" "$destination"
docker compose exec -T scr rm -f "$container_backup"
printf 'Backup written to %s\n' "$destination"
