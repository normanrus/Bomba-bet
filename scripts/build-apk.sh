#!/usr/bin/env bash
#
# Build the release APK and drop it where the admin panel can serve it.
#
#   bash scripts/build-apk.sh https://your-public-url
#
# The URL is baked into the app as API_BASE_URL. Afterwards the APK is available
# for download at <your-public-url>/download/release/app-release.apk — hand that
# link to friends, they install it straight from the phone browser.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

info() { echo "» $*"; }
die()  { echo "ОШИБКА: $*" >&2; exit 1; }

API_URL="${1:-}"
[ -n "$API_URL" ] || die "укажите адрес API: bash scripts/build-apk.sh https://xxxx.app.github.dev"
API_URL="${API_URL%/}"   # без завершающего слэша

case "$API_URL" in
  https://*) : ;;
  http://10.0.2.2*|http://localhost*) : ;;   # локальная отладка
  *) die "адрес должен начинаться с https:// (Android блокирует http:// в интернет)" ;;
esac

# ---------------------------------------------------------------- toolchain
export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-21-openjdk-amd64}"
export ANDROID_HOME="${ANDROID_HOME:-/opt/android-sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"

[ -d "$JAVA_HOME" ] || die "не найден JDK в $JAVA_HOME. Запустите .devcontainer/setup.sh"
[ -d "$ANDROID_HOME/platforms/android-34" ] || die "не найден Android SDK в $ANDROID_HOME. Запустите .devcontainer/setup.sh"

if [ -x /opt/gradle/bin/gradle ]; then
  GRADLE=/opt/gradle/bin/gradle
elif command -v gradle >/dev/null 2>&1; then
  GRADLE=gradle
else
  die "не найден gradle. Запустите .devcontainer/setup.sh"
fi

info "собираю APK с адресом $API_URL ..."
(cd "$ROOT/android" && "$GRADLE" :app:assembleRelease -PapiBaseUrl="$API_URL" --no-daemon)

APK="$ROOT/android/app/build/outputs/apk/release/app-release.apk"
[ -f "$APK" ] || die "сборка завершилась, но APK не найден: $APK"

SIZE="$(du -h "$APK" | cut -f1)"
info "готово: $APK ($SIZE)"

cat <<EOF

  Скачать на телефон:  ${API_URL}/download/release/app-release.apk

  (файл лежит в android/app/build/outputs/apk/release/, а админка уже
   раздаёт эту папку по пути /download/)

EOF
