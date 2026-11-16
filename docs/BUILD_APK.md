# БОМБА БЕТ — сборка APK

## 1. Что нужно установить

| Компонент      | Версия            | Зачем                          |
| -------------- | ----------------- | ------------------------------ |
| JDK            | 17 или 21         | компиляция Kotlin              |
| Android SDK    | platform 34, build-tools 34 | сборка под Android 14 |
| Gradle         | 8.9 (или wrapper) | сборка проекта                 |

Быстрый способ поставить SDK без Android Studio:

```bash
mkdir -p /opt/android-sdk/cmdline-tools
cd /tmp
curl -LO https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
unzip -q commandlinetools-linux-*.zip -d /opt/android-sdk/cmdline-tools
mv /opt/android-sdk/cmdline-tools/cmdline-tools /opt/android-sdk/cmdline-tools/latest

export ANDROID_HOME=/opt/android-sdk
yes | $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --licenses > /dev/null
$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager \
  "platform-tools" "platforms;android-34" "build-tools;34.0.0"
```

## 2. Указать адрес сервера

Откройте `android/app/build.gradle.kts` и задайте `API_BASE_URL`:

```kotlin
defaultConfig {
    // Эмулятор: 10.0.2.2 — это хост-машина.
    buildConfigField("String", "API_BASE_URL", "\"http://10.0.2.2:4000\"")
    // Реальный телефон в той же сети:
    // buildConfigField("String", "API_BASE_URL", "\"http://192.168.1.50:4000\"")
}
```

## 3. Сборка

```bash
cd android
export ANDROID_HOME=/opt/android-sdk
export JAVA_HOME=$(dirname $(dirname $(readlink -f $(which java))))

# Отладочная сборка (быстрая, для проверки)
gradle :app:assembleDebug
# → app/build/outputs/apk/debug/app-debug.apk

# Релизная сборка (минификация R8, уменьшенный размер)
gradle :app:assembleRelease
# → app/build/outputs/apk/release/app-release.apk
```

Готовые файлы уже лежат в репозитории:

* `android/app/build/outputs/apk/debug/app-debug.apk`
* `android/app/build/outputs/apk/release/app-release.apk`

## 4. Установка на телефон

```bash
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

Либо скопируйте APK на телефон и откройте файл — потребуется разрешить
установку из неизвестных источников.

## 5. Тесты

```bash
cd android
gradle :app:testDebugUnitTest
```

25 тестов: сетевой слой против реального HTTP-сервера (авторизация, refresh
токена, парсинг событий, прогнозы, призы), форматирование и хранилище сессии.

## 6. Подпись релиза

Сейчас релиз подписывается отладочным ключом, чтобы `assembleRelease`
работал «из коробки». Перед распространением замените подпись:

```bash
keytool -genkeypair -v -keystore bombabet.jks -keyalg RSA -keysize 2048 \
  -validity 10000 -alias bombabet
```

Добавьте в `android/app/build.gradle.kts`:

```kotlin
signingConfigs {
    create("release") {
        storeFile = file("../bombabet.jks")
        storePassword = System.getenv("KEYSTORE_PASSWORD")
        keyAlias = "bombabet"
        keyPassword = System.getenv("KEY_PASSWORD")
    }
}
buildTypes {
    release { signingConfig = signingConfigs.getByName("release") }
}
```

и передавайте пароли через переменные окружения, не коммитьте keystore.

## 7. Требования к устройству

* Android 8.0 (API 26) и выше.
* Интернет для связи с API.
* Приложение обращается по `http://` — для публичного домена используйте
  HTTPS, иначе Android заблокирует незашифрованный трафик.
