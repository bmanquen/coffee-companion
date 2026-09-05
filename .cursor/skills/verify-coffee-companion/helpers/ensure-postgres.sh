#!/usr/bin/env bash
# Verification scaffolding: bring up a disposable local Postgres named
# coffee_companion_test. Never point this at a development or production
# database — seed and migrate delete and rewrite the e2e users.
#
# No password is committed. Use VERIFY_DATABASE_URL or VERIFY_DB_PASSWORD, or
# this script generates an ephemeral password at runtime.
set -euo pipefail

DB_NAME="${VERIFY_DB_NAME:-coffee_companion_test}"
DB_USER="${VERIFY_DB_USER:-postgres}"
DB_HOST="${VERIFY_DB_HOST:-127.0.0.1}"
DB_PORT="${VERIFY_DB_PORT:-5432}"

log() { printf 'ensure-postgres: %s\n' "$*" >&2; }

# Same boundary as packages/api/test/database.ts isLocalTestDatabase:
# loopback host and a database name ending in _test. Seed/migrate delete rows.
is_loopback_host() {
  case "$1" in
    localhost|127.0.0.1|::1|'[::1]') return 0 ;;
    *) return 1 ;;
  esac
}

refuse_unless_local_test() {
  local host="$1" name="$2"
  if ! is_loopback_host "$host" || [[ "$name" != *_test ]]; then
    log "refusing ${host}/${name}: host must be loopback (127.0.0.1, localhost, ::1) and the database name must end with _test."
    log "This script migrates and reseeds; a development or production URL would lose data."
    exit 1
  fi
}

# Parse a postgresql:// URI without printing userinfo. Node's URL.hostname
# for IPv6 is unbracketed (::1); accept that plus the bracketed form.
refuse_unless_local_test_url() {
  local url="$1"
  local parsed
  parsed="$(
    node --input-type=module -e '
      const url = new URL(process.argv[1])
      const host = url.hostname
      const db = decodeURIComponent((url.pathname.replace(/^\//, "").split("/")[0]) ?? "")
      process.stdout.write(`${host}\n${db}\n`)
    ' "$url"
  )" || {
    log "VERIFY_DATABASE_URL is not a usable URL"
    exit 1
  }
  local host name
  host="$(printf '%s\n' "$parsed" | sed -n '1p')"
  name="$(printf '%s\n' "$parsed" | sed -n '2p')"
  refuse_unless_local_test "$host" "$name"
}

# $1 is a postgresql:// URI. psql accepts the URI as its first argument.
can_connect() {
  local url="$1"
  [ -n "$url" ] || return 1
  psql "$url" -Atqc 'select 1' >/dev/null 2>&1
}

ephemeral_password() {
  if [ -n "${VERIFY_DB_PASSWORD:-}" ]; then
    printf '%s' "$VERIFY_DB_PASSWORD"
    return
  fi
  openssl rand -hex 24
}

cluster_version() {
  if command -v pg_lsclusters >/dev/null 2>&1; then
    pg_lsclusters -h | awk '{print $1; exit}'
  fi
}

emit_ok() {
  local url="$1"
  if [ -n "${VERIFY_DB_URL_FILE:-}" ]; then
    mkdir -p "$(dirname "$VERIFY_DB_URL_FILE")"
    printf '%s\n' "$url" >"$VERIFY_DB_URL_FILE"
    chmod 600 "$VERIFY_DB_URL_FILE"
  fi
  log "ready ${DB_HOST}:${DB_PORT}/${DB_NAME}"
  printf 'ok %s:%s/%s\n' "$DB_HOST" "$DB_PORT" "$DB_NAME"
}

if [ -n "${VERIFY_DATABASE_URL:-}" ]; then
  refuse_unless_local_test_url "$VERIFY_DATABASE_URL"
  if can_connect "$VERIFY_DATABASE_URL"; then
    log "already reachable via VERIFY_DATABASE_URL"
    emit_ok "$VERIFY_DATABASE_URL"
    exit 0
  fi
  log "VERIFY_DATABASE_URL passed the test-database boundary but is not reachable"
  exit 1
fi

refuse_unless_local_test "$DB_HOST" "$DB_NAME"

DB_PASSWORD="$(ephemeral_password)"
TARGET_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

if can_connect "$TARGET_URL"; then
  log "already reachable at ${DB_HOST}:${DB_PORT}/${DB_NAME}"
  emit_ok "$TARGET_URL"
  exit 0
fi

if ! command -v psql >/dev/null 2>&1 && ! command -v postgres >/dev/null 2>&1; then
  if command -v apt-get >/dev/null 2>&1; then
    log "installing postgresql (verification scaffolding — not a product dependency)"
    sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql postgresql-contrib >/dev/null
  else
    log "Postgres is not installed and apt-get is unavailable."
    log "Install PostgreSQL locally, create database ${DB_NAME}, set VERIFY_DATABASE_URL, then rerun launch."
    exit 1
  fi
fi

if command -v pg_isready >/dev/null 2>&1; then
  if ! pg_isready -h "$DB_HOST" -p "$DB_PORT" >/dev/null 2>&1; then
    version="$(cluster_version)"
    if [ -n "$version" ] && command -v pg_ctlcluster >/dev/null 2>&1; then
      sudo pg_ctlcluster "$version" main start
    elif command -v service >/dev/null 2>&1; then
      sudo service postgresql start
    elif command -v systemctl >/dev/null 2>&1; then
      sudo systemctl start postgresql
    else
      log "could not start postgresql: no pg_ctlcluster/service/systemctl"
      exit 1
    fi
    for _ in $(seq 1 30); do
      pg_isready -h "$DB_HOST" -p "$DB_PORT" >/dev/null 2>&1 && break
      sleep 1
    done
  fi
fi

# Peer-auth as the cluster OS user to create the login role and database.
# The password is the runtime value only — never a default baked into this file.
sudo -u postgres psql -v ON_ERROR_STOP=1 >/dev/null <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$DB_USER') THEN
    CREATE ROLE $DB_USER LOGIN PASSWORD '$DB_PASSWORD' SUPERUSER;
  ELSE
    ALTER ROLE $DB_USER WITH LOGIN PASSWORD '$DB_PASSWORD';
  END IF;
END
\$\$;
SQL

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1; then
  sudo -u postgres createdb -O "$DB_USER" "$DB_NAME"
fi

if ! can_connect "$TARGET_URL"; then
  log "database exists but TCP auth failed for ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
  exit 1
fi

emit_ok "$TARGET_URL"
