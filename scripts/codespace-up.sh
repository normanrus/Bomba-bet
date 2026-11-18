#!/usr/bin/env bash
#
# БОМБА БЕТ in GitHub Codespaces: no local computer needed.
#
# Brings up the whole stack inside the codespace and prints the public URL that
# GitHub forwards to the internet. Works from a phone browser.
#
#   bash scripts/codespace-up.sh
#
# The same URL serves the admin panel AND the API (nginx proxies /api/), so it
# is also what gets baked into the APK.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

info() { echo "» $*"; }
die()  { echo "ОШИБКА: $*" >&2; exit 1; }

ADMIN_PORT="${ADMIN_PORT:-8080}"

# ---------------------------------------------------------------- docker
if ! docker info >/dev/null 2>&1; then
  info "жду Docker (в Codespaces он поднимается не сразу)..."
  for i in $(seq 1 60); do
    docker info >/dev/null 2>&1 && break
    [ "$i" -eq 60 ] && die "Docker так и не поднялся. Пересоздайте codespace."
    sleep 2
  done
fi
info "Docker готов"

# ---------------------------------------------------------------- .env
# Generate secrets with openssl, falling back to /dev/urandom, so we do not
# depend on python3 being present in the base image.
rand_hex() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$1"
  else
    od -An -tx1 -N "$1" /dev/urandom | tr -d ' \n'
  fi
}

if [ ! -f .env ]; then
  info "создаю .env со случайными секретами"
  cp .env.example .env
  DB_PASS="$(rand_hex 16)"
  JWT_SEC="$(rand_hex 32)"
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${DB_PASS}|" .env
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${JWT_SEC}|" .env
  chmod 600 .env
fi
# Codespaces forwards 8080 publicly; keep the admin on that port. API_PORT is
# only used inside the codespace, but persist it too so an override actually
# takes effect (docker compose reads .env for the port mapping).
set_env() {
  if grep -qE "^$1=" .env; then
    sed -i "s|^$1=.*|$1=$2|" .env
  else
    echo "$1=$2" >> .env
  fi
}
set_env ADMIN_PORT "$ADMIN_PORT"
if [ -n "${API_PORT:-}" ]; then
  set_env API_PORT "$API_PORT"
fi

# ---------------------------------------------------------------- stack
info "поднимаю контейнеры (db, api, admin, backup)..."
docker compose up -d --build

info "жду готовности API..."
API_PORT="$(grep -E '^API_PORT=' .env | cut -d= -f2 | tr -d '[:space:]')"
API_PORT="${API_PORT:-4000}"
for i in $(seq 1 90); do
  curl -fsS --max-time 3 "http://127.0.0.1:${API_PORT}/api/health" >/dev/null 2>&1 && break
  [ "$i" -eq 90 ] && die "API не поднялся. Смотрите: docker compose logs api"
  sleep 1
done
info "API отвечает"

# ---------------------------------------------------------------- demo data
if [ "${SEED_DEMO_DATA:-false}" = "true" ]; then
  info "загружаю демо-данные..."
  docker compose exec -T -e SEED_DEMO_DATA=true api node dist/db/seed.js --demo >/dev/null 2>&1 || true
fi

# ---------------------------------------------------------------- admin password
PW=""
if grep -qE '^ADMIN_PASSWORD=$' .env; then
  PW="$(docker compose logs api 2>&1 | grep -oE 'Пароль: +[A-Za-z0-9._!-]+' | tail -1 | awk '{print $2}')" || true
fi

# ---------------------------------------------------------------- public URL
if [ -n "${CODESPACE_NAME:-}" ]; then
  DOMAIN="${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
  URL="https://${CODESPACE_NAME}-${ADMIN_PORT}.${DOMAIN}"
else
  URL="http://localhost:${ADMIN_PORT}"
fi

cat <<EOF

================================================================
  БОМБА БЕТ запущена

  Админка и API:  $URL
  Health:         $URL/api/health
  Логин:          owner
EOF
if [ -n "$PW" ]; then
  echo "  Пароль админа:  $PW"
else
  echo "  Пароль админа:  задайте в .env (ADMIN_PASSWORD) или смените через админку"
fi
cat <<EOF

  Собрать APK под этот адрес:
    bash scripts/build-apk.sh "$URL"

  ВАЖНО: порт 8080 должен быть Public. Codespaces обычно делает это сам
  (см. .devcontainer/devcontainer.json). Если адрес не открывается —
  вкладка PORTS → правый клик на 8080 → Port Visibility → Public.

  Остановить:  bash scripts/tunnel.sh --down
================================================================

EOF
