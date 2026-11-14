#!/bin/sh
# Restores a dump made by backup.sh.
#
#   restore.sh                         list the available dumps
#   restore.sh <file> [target_db]      restore (default target: $PGDATABASE, i.e. production)
#
# Into the production database: stop worker and web first (docker compose stop worker web),
# then restart them. The restore runs in a single transaction: on error nothing is changed.
# A target_db other than $PGDATABASE is created if missing (restore test without touching prod).
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
export PGHOST="${PGHOST:-db}"
DB="${PGDATABASE:-jobradar}"

if [ $# -eq 0 ]; then
  ls -lh "$BACKUP_DIR"/jobradar_*.dump 2>/dev/null || echo "no dump in $BACKUP_DIR"
  exit 0
fi

file="$1"
[ -f "$file" ] || file="$BACKUP_DIR/$1"
[ -f "$file" ] || { echo "dump not found: $1" >&2; exit 1; }
target="${2:-$DB}"

pg_restore --list "$file" >/dev/null || { echo "not a valid pg_dump archive: $file" >&2; exit 1; }

if [ "$target" != "$DB" ]; then
  if ! psql -d "$DB" -Atc "select 1 from pg_database where datname = '$target'" | grep -q 1; then
    createdb --maintenance-db="$DB" "$target"
  fi
fi

echo "restoring $file into database \"$target\"..."
pg_restore --dbname="$target" --clean --if-exists --no-owner --single-transaction --exit-on-error "$file"
echo "restore done. Rows in $target:"
psql -d "$target" -Atc "select 'jobs=' || count(*) from jobs union all select 'companies=' || count(*) from companies union all select 'job_status=' || count(*) from job_status"
