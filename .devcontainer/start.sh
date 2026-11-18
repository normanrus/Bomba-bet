#!/usr/bin/env bash
# Runs each time the codespace starts: bring the stack up and build the APK.
# Designed so a phone-only user never has to type anything: the devcontainer
# calls this automatically and prints the public links.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

bash scripts/codespace-up.sh || true

# Build the APK once, with the public URL baked in, so the download link works
# immediately. Skipped on later starts if the APK is already there.
if [ -n "${CODESPACE_NAME:-}" ] && [ ! -f android/app/build/outputs/apk/release/app-release.apk ]; then
  DOMAIN="${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
  URL="https://${CODESPACE_NAME}-8080.${DOMAIN}"
  echo "» собираю APK под $URL (один раз, ~3 минуты)..."
  bash scripts/build-apk.sh "$URL" || echo "! APK не собрался — запустите вручную: bash scripts/build-apk.sh $URL"
fi
