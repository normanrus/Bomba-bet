#!/usr/bin/env bash
# Codespaces setup: install the Android SDK so an APK can be built in the cloud.
# Runs once, when the codespace is created.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SDK=/opt/android-sdk
CMDLINE_VERSION=11076708
GRADLE_VERSION=8.9

info() { echo "» $*"; }

# Tools the scripts rely on. The devcontainer base image usually has curl and
# unzip, but do not assume it.
missing=""
for t in curl unzip openssl; do
  command -v "$t" >/dev/null 2>&1 || missing="$missing $t"
done
if [ -n "$missing" ]; then
  info "ставлю пакеты:$missing"
  sudo apt-get update -qq
  sudo apt-get install -y -qq curl unzip openssl
fi

if [ -d "$SDK/platforms/android-34" ] && [ -x "$SDK/build-tools/34.0.0/aapt2" ]; then
  info "Android SDK уже установлен — пропускаю"
else
  info "ставлю Android command-line tools..."
  sudo mkdir -p "$SDK/cmdline-tools"
  curl -fsSL -o /tmp/cmdtools.zip \
    "https://dl.google.com/android/repository/commandlinetools-linux-${CMDLINE_VERSION}_latest.zip"
  rm -rf /tmp/cmdtools-extract
  unzip -q -o /tmp/cmdtools.zip -d /tmp/cmdtools-extract
  sudo rm -rf "$SDK/cmdline-tools/latest"
  sudo mv /tmp/cmdtools-extract/cmdline-tools "$SDK/cmdline-tools/latest"
  sudo chown -R "$(id -u):$(id -g)" "$SDK"
  rm -f /tmp/cmdtools.zip

  info "принимаю лицензии и ставлю platform 34 + build-tools..."
  export ANDROID_HOME="$SDK" ANDROID_SDK_ROOT="$SDK"
  # `yes` closes the pipe early, so the SDK manager's SIGPIPE would trip
  # pipefail; run these without it.
  set +o pipefail
  yes | "$SDK/cmdline-tools/latest/bin/sdkmanager" --licenses >/dev/null 2>&1 || true
  yes | "$SDK/cmdline-tools/latest/bin/sdkmanager" \
    "platform-tools" "platforms;android-34" "build-tools;34.0.0"
  set -o pipefail
fi

# The repo ships no Gradle wrapper, so install a matching Gradle.
if [ ! -x /opt/gradle/bin/gradle ]; then
  info "ставлю Gradle ${GRADLE_VERSION}..."
  curl -fsSL -o /tmp/gradle.zip "https://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip"
  sudo rm -rf /opt/gradle /opt/gradle-${GRADLE_VERSION}
  sudo unzip -q -o /tmp/gradle.zip -d /opt
  sudo mv "/opt/gradle-${GRADLE_VERSION}" /opt/gradle
  sudo chown -R "$(id -u):$(id -g)" /opt/gradle
  rm -f /tmp/gradle.zip
fi

info "Android SDK: $SDK"
info "Gradle:      /opt/gradle/bin/gradle"
info "Готово. Теперь: bash scripts/codespace-up.sh"
