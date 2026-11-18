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
if [ ! -f .env ]; then
  info "создаю .env со случайными секретами"
  cp .env.example .env
  python3 - .env "$(openssl rand -hex 16)" "$(openssl rand -hex 32)" <<'PY'
import sys
path, db_pass, jwt = sys.argv[1], sys.argv[2], sys.argv[3]
out = []
for line in open(path, encoding='utf-8'):
    if line.startswith('POSTGRES_PASSWORD='):
        line = f'POSTGRES_PASSWORD={db_pass}\n'
    elif line.startswith('JWT_SECRET='):
        line = f'JWT_SECRET={jwt}\n'
    out.append(line)
open(path, 'w', encoding='utf-8').writelines(out)
PY
  chmod 600 .env
fi
# Codespaces forwards 8080 publicly; keep the admin on that port.
if grep -qE '^ADMIN_PORT=' .env; then
  sed -i "s/^ADMIN_PORT=.*/ADMIN_PORT=${ADMIN_PORT}/" .env
else
  echo "ADMIN_PORT=${ADMIN_PORT}" >> .env
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
