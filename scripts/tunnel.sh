#!/usr/bin/env bash
#
# One-command launcher for BOMBA BET: brings up the Docker stack and exposes it
# to the internet through a free Cloudflare quick tunnel.
#
#   bash scripts/tunnel.sh              # stack + public URL
#   bash scripts/tunnel.sh --no-tunnel  # stack only (localhost)
#   bash scripts/tunnel.sh --down       # stop everything
#
# The printed https://<name>.trycloudflare.com URL serves BOTH the admin panel
# and the API (nginx proxies /api/), so it is also the address to bake into the APK.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

LOG="$ROOT/.tunnel.log"
ENV_FILE="$ROOT/.env"

die() { echo "ОШИБКА: $*" >&2; exit 1; }
info() { echo "» $*"; }

# ---------------------------------------------------------------- prerequisites
command -v docker >/dev/null 2>&1 || die "не найден docker. Установите Docker Desktop / docker.io."

if docker compose version >/dev/null 2>&1; then
  DC=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  DC=(docker-compose)
else
  die "не найден 'docker compose'. Обновите Docker."
fi

# ---------------------------------------------------------------- stop
if [ "${1:-}" = "--down" ]; then
  info "останавливаю стек..."
  "${DC[@]}" down
  pkill -f "cloudflared tunnel --url" 2>/dev/null || true
  info "готово."
  exit 0
fi

# ---------------------------------------------------------------- .env
if [ ! -f "$ENV_FILE" ]; then
  info ".env не найден — создаю из .env.example со случайными секретами"
  cp .env.example "$ENV_FILE"
  DB_PASS="$(openssl rand -hex 16)"
  JWT="$(openssl rand -hex 32)"
  python3 - "$ENV_FILE" "$DB_PASS" "$JWT" <<'PY'
import sys
path, db_pass, jwt = sys.argv[1], sys.argv[2], sys.argv[3]
lines = []
for line in open(path, encoding='utf-8'):
    if line.startswith('POSTGRES_PASSWORD='):
        line = f'POSTGRES_PASSWORD={db_pass}\n'
    elif line.startswith('JWT_SECRET='):
        line = f'JWT_SECRET={jwt}\n'
    lines.append(line)
open(path, 'w', encoding='utf-8').writelines(lines)
PY
  chmod 600 "$ENV_FILE"
  info "секреты записаны в .env (не коммитится в git)"
fi

# ---------------------------------------------------------------- stack up
info "поднимаю контейнеры (db, api, admin, backup)..."
"${DC[@]}" up -d --build

info "жду готовности API..."
API_PORT="$(grep -E '^API_PORT=' "$ENV_FILE" | cut -d= -f2 | tr -d '[:space:]')"
API_PORT="${API_PORT:-4000}"
for i in $(seq 1 60); do
  if curl -fsS --max-time 3 "http://127.0.0.1:${API_PORT}/api/health" >/dev/null 2>&1; then
    info "API отвечает на http://127.0.0.1:${API_PORT}/api/health"
    break
  fi
  [ "$i" -eq 60 ] && die "API не поднялся за 60 секунд. Смотрите: ${DC[*]} logs api"
  sleep 1
done

# Показать сгенерированный пароль администратора, если он был создан впервые.
if grep -qE '^ADMIN_PASSWORD=$' "$ENV_FILE"; then
  echo
  info "ADMIN_PASSWORD пуст — пароль админа печатается один раз в логах:"
  "${DC[@]}" logs api 2>&1 | grep -A4 'начальный администратор создан' || \
    echo "   (уже создавался ранее — пароль в логах не появится; смените через админку)"
  echo
fi

ADMIN_PORT="$(grep -E '^ADMIN_PORT=' "$ENV_FILE" | cut -d= -f2 | tr -d '[:space:]')"
ADMIN_PORT="${ADMIN_PORT:-8080}"

if [ "${1:-}" = "--no-tunnel" ]; then
  echo
  info "стек запущен локально:"
  echo "   Админка: http://localhost:${ADMIN_PORT}"
  echo "   API:     http://localhost:${API_PORT}/api/health"
  exit 0
fi

# ---------------------------------------------------------------- cloudflared
if ! command -v cloudflared >/dev/null 2>&1; then
  cat >&2 <<'EOF'

cloudflared не установлен. Поставьте одним из способов:

  macOS (Homebrew):   brew install cloudflared
  Debian/Ubuntu:      curl -fsSL -o /tmp/cloudflared \
                        https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
                      && sudo install -m755 /tmp/cloudflared /usr/local/bin/cloudflared
  Windows (winget):   winget install --id Cloudflare.cloudflared
  Другие способы:     https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

Затем запустите этот скрипт снова.
EOF
  exit 1
fi

info "открываю публичный туннель на админку (она же проксирует API)..."
: > "$LOG"
# Туннель пишет в лог; сам скрипт остаётся на переднем плане, чтобы Ctrl+C закрыл всё.
cloudflared tunnel --url "http://127.0.0.1:${ADMIN_PORT}" --no-autoupdate >"$LOG" 2>&1 &
TUNNEL_PID=$!
trap 'info "закрываю туннель..."; kill "$TUNNEL_PID" 2>/dev/null || true' INT TERM EXIT

URL=""
for i in $(seq 1 40); do
  URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" | head -1 || true)"
  [ -n "$URL" ] && break
  sleep 1
done
[ -n "$URL" ] || die "не удалось получить адрес туннеля. Лог: $LOG"

# Проверим, что публичный адрес реально отвечает, прежде чем радовать пользователя.
info "проверяю публичный адрес..."
for i in $(seq 1 15); do
  curl -fsS --max-time 5 "$URL/api/health" >/dev/null 2>&1 && break
  sleep 2
done

cat <<EOF

================================================================
  БОМБА БЕТ запущена и доступна в интернете

  Публичный адрес:  $URL
  Админка:          $URL
  API health:       $URL/api/health
  Локально:         http://localhost:${ADMIN_PORT}

  Этот же адрес вшивается в APK:
    cd android && gradle :app:assembleRelease -PapiBaseUrl=$URL

  ВАЖНО: адрес временный. При перезапуске скрипта он сменится —
  тогда пересоберите APK. Для постоянного адреса см.
  docs/DEPLOY_TUNNEL.md (именованный туннель + свой домен).

  Ctrl+C — остановить туннель (контейнеры продолжат работать;
  полностью остановить: bash scripts/tunnel.sh --down).
================================================================

EOF

wait "$TUNNEL_PID"
