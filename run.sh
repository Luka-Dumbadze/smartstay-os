#!/usr/bin/env bash
# SmartStay OS - one-command local launcher (macOS / Linux).
#   ./run.sh         install deps, start a project-local PostgreSQL 16, init + seed, start API (:8000) and console (:3000)
#   ./run.sh stop    stop everything started by this script
#   ./run.sh reset   re-create the demo schemas and seed data (cluster must be running)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE="$ROOT/.smartstay"; PGDATA="$STATE/pgdata"; SOCK="$STATE/run"; LOGS="$STATE/logs"
PGPORT="${SMARTSTAY_PG_PORT:-5433}"; API_PORT=8000; WEB_PORT=3000
BACKEND="$ROOT/apps/backend"; FRONTEND="$ROOT/apps/frontend"; VENV="$BACKEND/.venv"
export SMARTSTAY_APP_DSN="host=localhost port=$PGPORT dbname=smartstay user=smartstay_app"
export SMARTSTAY_ADMIN_DSN="host=localhost port=$PGPORT dbname=smartstay user=smartstay_admin"

c_gold=$'\033[38;5;179m'; c_dim=$'\033[2m'; c_red=$'\033[31m'; c_off=$'\033[0m'
say() { printf '%s▸%s %s\n' "$c_gold" "$c_off" "$*"; }
die() { printf '%s✖ %s%s\n' "$c_red" "$*" "$c_off" >&2; exit 1; }

find_pg_bin() {
  local c
  for c in "${PG_BIN:-}" "$(command -v pg_config >/dev/null 2>&1 && pg_config --bindir || true)" \
           /usr/lib/postgresql/16/bin /usr/pgsql-16/bin /opt/homebrew/opt/postgresql@16/bin /usr/local/opt/postgresql@16/bin \
           /Applications/Postgres.app/Contents/Versions/16/bin "$(dirname "$(command -v initdb 2>/dev/null || echo /x/x)")"; do
    [[ -n "$c" && -x "$c/initdb" && -x "$c/pg_ctl" ]] && { echo "$c"; return; }
  done
  return 1
}

stop_all() {
  for f in "$STATE/api.pid" "$STATE/web.pid"; do
    [[ -f "$f" ]] && { kill "$(cat "$f")" 2>/dev/null || true; rm -f "$f"; }
  done
  if PGB="$(find_pg_bin)" && [[ -f "$PGDATA/postmaster.pid" ]]; then "$PGB/pg_ctl" -D "$PGDATA" -m fast -w stop >/dev/null 2>&1 || true; fi
}

free_port() {  # stop a previous instance of *our* servers still holding the port
  local pids; pids="$(lsof -ti tcp:"$1" -sTCP:LISTEN 2>/dev/null || true)"
  [[ -z "$pids" ]] && return 0
  for p in $pids; do
    if ps -o command= -p "$p" 2>/dev/null | grep -Eq "uvicorn main:app|vite|npm run dev"; then kill "$p" 2>/dev/null || true; sleep 1
    else die "port $1 is in use by another program (pid $p) - free it and re-run"; fi
  done
}

case "${1:-start}" in
  stop) stop_all; say "SmartStay OS stopped"; exit 0 ;;
  start|reset) ;;
  *) echo "usage: ./run.sh [start|stop|reset]"; exit 1 ;;
esac

# ---------------------------------------------------------------- prerequisites
PGB="$(find_pg_bin)" || die "PostgreSQL 16 binaries not found. Linux: sudo apt install postgresql-16  |  macOS: brew install postgresql@16  (or set PG_BIN)"
"$PGB/postgres" --version | grep -q ' 16\.' || say "${c_dim}note: $("$PGB/postgres" --version) (built for 16)${c_off}"
command -v python3 >/dev/null || die "python3 (3.10+) is required"
command -v node >/dev/null && command -v npm >/dev/null || die "Node.js 20+ and npm are required"
mkdir -p "$STATE" "$SOCK" "$LOGS"

# ---------------------------------------------------------------- project-local PostgreSQL 16 cluster
if [[ ! -f "$PGDATA/PG_VERSION" ]]; then
  say "Initializing local PostgreSQL cluster in .smartstay/pgdata"
  "$PGB/initdb" -D "$PGDATA" -U smartstay_admin -A trust -E UTF8 --locale=C >"$LOGS/initdb.log" 2>&1 || { cat "$LOGS/initdb.log"; die "initdb failed"; }
fi
if ! "$PGB/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
  rm -f "$PGDATA/postmaster.pid"
  say "Starting PostgreSQL on localhost:$PGPORT"
  "$PGB/pg_ctl" -D "$PGDATA" -w -t 30 -l "$LOGS/postgres.log" \
    -o "-p $PGPORT -k '$SOCK' -c listen_addresses=localhost -c timezone=UTC" start >/dev/null || { tail -20 "$LOGS/postgres.log"; die "PostgreSQL failed to start"; }
fi
PSQL=("$PGB/psql" -X -q -h localhost -p "$PGPORT" -U smartstay_admin)
"${PSQL[@]}" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='smartstay'" | grep -q 1 || "${PSQL[@]}" -d postgres -c "CREATE DATABASE smartstay"

# ---------------------------------------------------------------- backend deps + schema/seed
if [[ ! -x "$VENV/bin/python" ]]; then say "Creating Python virtualenv"; python3 -m venv "$VENV"; fi
if [[ ! -f "$VENV/.deps" || "$BACKEND/requirements.txt" -nt "$VENV/.deps" ]]; then
  say "Installing backend dependencies"
  "$VENV/bin/pip" install -q --upgrade pip >/dev/null && "$VENV/bin/pip" install -q -r "$BACKEND/requirements.txt" && touch "$VENV/.deps"
fi
say "Creating schemas, forced RLS and demo seed (Chateau Telavi Wine Resort)"
free_port "$API_PORT"
(cd "$BACKEND" && "$VENV/bin/python" db.py init)
[[ "${1:-start}" == reset ]] && { say "Demo data reset"; exit 0; }

# ---------------------------------------------------------------- API
say "Starting API on http://localhost:$API_PORT"
(cd "$BACKEND" || exit 1; nohup "$VENV/bin/uvicorn" main:app --host 127.0.0.1 --port "$API_PORT" </dev/null >"$LOGS/api.log" 2>&1 & echo $! >"$STATE/api.pid")
for _ in $(seq 1 60); do curl -fs "http://127.0.0.1:$API_PORT/api/health" >/dev/null 2>&1 && break; sleep 0.5; done
curl -fs "http://127.0.0.1:$API_PORT/api/health" >/dev/null || { tail -30 "$LOGS/api.log"; die "API failed to start"; }

# ---------------------------------------------------------------- console
if [[ ! -d "$FRONTEND/node_modules" || "$FRONTEND/package.json" -nt "$FRONTEND/node_modules/.installed" ]]; then
  say "Installing frontend dependencies"
  (cd "$FRONTEND" && npm install --no-audit --no-fund --loglevel=error && touch node_modules/.installed)
fi
free_port "$WEB_PORT"
say "Starting console on http://localhost:$WEB_PORT"
(cd "$FRONTEND" || exit 1; nohup ./node_modules/.bin/vite --port "$WEB_PORT" --strictPort --host 127.0.0.1 </dev/null >"$LOGS/web.log" 2>&1 & echo $! >"$STATE/web.pid")
for _ in $(seq 1 60); do curl -fs "http://127.0.0.1:$WEB_PORT/" >/dev/null 2>&1 && break; sleep 0.5; done
curl -fs "http://127.0.0.1:$WEB_PORT/" >/dev/null || { tail -30 "$LOGS/web.log"; die "console failed to start"; }

cat <<EOF

${c_gold}  ╭──────────────────────────────────────────────────────────╮
  │     SmartStay OS running at http://localhost:$WEB_PORT          │
  ╰──────────────────────────────────────────────────────────╯${c_off}
  API       http://localhost:$API_PORT   (docs: /docs, stream: /api/stream)
  Database  PostgreSQL on localhost:$PGPORT  (project-local cluster in .smartstay/)
  Logs      .smartstay/logs/{api,web,postgres}.log
  Stop      Ctrl-C  or  ./run.sh stop

EOF
if [[ -t 0 && "${SMARTSTAY_DETACH:-0}" != 1 ]]; then
  trap 'echo; stop_all; say "SmartStay OS stopped"; exit 0' INT TERM
  tail -n0 -f "$LOGS/api.log" "$LOGS/web.log"
fi
