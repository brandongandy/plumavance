#!/bin/sh
set -eu

destination=${1:-"pluma-backup-$(date +%Y%m%d-%H%M%S).sqlite"}
container_backup=/data/.pluma-backup.sqlite

docker compose exec -T pluma sqlite3 /data/pluma.sqlite ".backup '$container_backup'"
docker compose cp "pluma:$container_backup" "$destination"
docker compose exec -T pluma rm -f "$container_backup"
printf 'Backup written to %s\n' "$destination"
