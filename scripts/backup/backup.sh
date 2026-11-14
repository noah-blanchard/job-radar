#!/bin/sh
# JobRadar backup service: one pg_dump (custom format, compressed) per day at BACKUP_HOUR
# (Toronto time), BACKUP_KEEP_DAYS days kept in /backups (dedicated volume).
# A backup also runs at startup when none is younger than 24 h (first deploy, restarts).
# Each outcome is written to kv.backup_status: the worker alerts on a failed or stale backup.
#
#   backup.sh            scheduler loop (container command)
#   backup.sh --once     one backup now
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
HOUR="${BACKUP_HOUR:-3}"
export PGHOST="${PGHOST:-db}"
export PGDATABASE="${PGDATABASE:-jobradar}"

log() { printf '{"level":"%s","time":"%s","service":"backup","msg":"%s"}\n' "$1" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$2"; }

# Records the outcome in kv (best effort: the database may be the thing that is down).
status() {
  psql -q -v ON_ERROR_STOP=1 -v ok="$1" -v file="$2" -v bytes="$3" -v err="$4" >/dev/null 2>&1 <<'SQL' || true
insert into kv (key, value, updated_at)
values ('backup_status', jsonb_build_object(
  'ok', :'ok'::boolean, 'at', now(), 'file', :'file', 'bytes', :'bytes'::bigint, 'error', nullif(:'err', '')
), now())
on conflict (key) do update set value = excluded.value, updated_at = now();
SQL
}

backup_once() {
  mkdir -p "$BACKUP_DIR"
  stamp="$(date +%Y-%m-%d_%H%M)"
  final="$BACKUP_DIR/jobradar_$stamp.dump"
  tmp="$BACKUP_DIR/.jobradar_$stamp.dump.partial"
  log info "backup started: $final"
  if err="$(pg_dump --format=custom --compress=6 --no-owner --file="$tmp" 2>&1)"; then
    mv "$tmp" "$final"
    bytes="$(wc -c < "$final" | tr -d ' ')"
    # Rotation: dumps older than KEEP_DAYS days, and partial files left by a crash.
    find "$BACKUP_DIR" -maxdepth 1 -name 'jobradar_*.dump' -mtime +"$((KEEP_DAYS - 1))" -delete
    find "$BACKUP_DIR" -maxdepth 1 -name '.jobradar_*.partial' -mmin +60 -delete
    log info "backup ok: $final ($bytes bytes), $(find "$BACKUP_DIR" -maxdepth 1 -name 'jobradar_*.dump' | wc -l | tr -d ' ') kept"
    status true "$(basename "$final")" "$bytes" ""
  else
    rm -f "$tmp"
    clean="$(printf '%s' "$err" | tr '\n"' "  " | cut -c1-300)"
    log error "backup failed: $clean"
    status false "" 0 "$clean"
    return 1
  fi
}

recent_backup() {
  [ -n "$(find "$BACKUP_DIR" -maxdepth 1 -name 'jobradar_*.dump' -mmin -1440 2>/dev/null | head -n1)" ]
}

seconds_until_next() {
  now=$(( $(date +%H | sed 's/^0//;s/^$/0/') * 3600 + $(date +%M | sed 's/^0//;s/^$/0/') * 60 + $(date +%S | sed 's/^0//;s/^$/0/') ))
  wait=$(( (HOUR * 3600 - now + 86400) % 86400 ))
  [ "$wait" -eq 0 ] && wait=86400
  echo "$wait"
}

if [ "${1:-}" = "--once" ]; then
  backup_once
  exit $?
fi

until pg_isready -q; do sleep 5; done
recent_backup || backup_once || true
while true; do
  wait="$(seconds_until_next)"
  log info "next backup in ${wait}s (${HOUR}:00 $TZ)"
  sleep "$wait"
  backup_once || true
done
