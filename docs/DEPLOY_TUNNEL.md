# БОМБА БЕТ — запуск на своём компьютере + публичный адрес (Вариант А)

Это самый простой способ поднять сервер: он работает **на вашем компьютере**,
а наружу открывается бесплатным туннелем Cloudflare. Никаких аккаунтов, карт и
панелей хостингов — всё в двух командах.

Что получится:

```
Телефон (APK) ─┐
               ├──► Cloudflare Tunnel ──► ваш компьютер
Браузер ───────┘      https://xxx.trycloudflare.com
                      (админка + API на одном адресе)
```

Почему один адрес на всё: админка — это nginx, который отдаёт страницы и
**сам проксирует `/api/`** внутрь стека. Поэтому туннель нужен только один, и
тот же адрес вшивается в APK.

> Это вариант «для компании друзей»: сервер живёт, пока включён ваш компьютер.
> Для сервера 24/7 без вашего участия нужен облачный хостинг — см.
> `docs/DEPLOY_STEP_BY_STEP.md`.

---

## 0. Что нужно

| Что | Зачем | Как поставить |
| --- | --- | --- |
| Docker Desktop | запускает сервер и базу | [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) |
| cloudflared | открывает публичный адрес | см. шаг 3 |
| `openssl` | генерация секретов | уже есть в macOS/Linux; на Windows — в Git Bash |

Проверьте, что Docker запущен:

```bash
docker compose version
```

Если команда не найдена — откройте Docker Desktop и подождите, пока он стартует.

---

## 1. Запуск одной командой

Из корня проекта:

```bash
bash scripts/tunnel.sh
```

Скрипт сам:

1. создаст `.env` со **случайными** паролем базы и `JWT_SECRET`, если файла ещё нет;
2. соберёт и поднимет контейнеры (база, API, админка, бэкапы);
3. дождётся, пока API ответит на `/api/health`;
4. откроет туннель и **проверит**, что публичный адрес реально работает;
5. напечатает готовый адрес и команду сборки APK.

В конце вы увидите примерно такое:

```
================================================================
  БОМБА БЕТ запущена и доступна в интернете

  Публичный адрес:  https://spisok-xxx.trycloudflare.com
  Админка:          https://spisok-xxx.trycloudflare.com
  API health:       https://spisok-xxx.trycloudflare.com/api/health
  Локально:         http://localhost:8080

  Этот же адрес вшивается в APK:
    cd android && gradle :app:assembleRelease -PapiBaseUrl=https://spisok-xxx.trycloudflare.com
================================================================
```

Откройте адрес в браузере — это админка. `Ctrl+C` останавливает туннель
(контейнеры продолжат работать).

### Полезные варианты

```bash
bash scripts/tunnel.sh --no-tunnel   # только локально, без публичного адреса
bash scripts/tunnel.sh --down        # остановить и убрать контейнеры
```

### Если cloudflared ещё не стоит

Скрипт скажет об этом и напечатает инструкцию. Коротко:

```bash
# macOS
brew install cloudflared

# Debian / Ubuntu
curl -fsSL -o /tmp/cloudflared \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
sudo install -m755 /tmp/cloudflared /usr/local/bin/cloudflared

# Windows (PowerShell)
winget install --id Cloudflare.cloudflared
```

---

## 2. Пароль администратора

Есть два случая.

**Если `ADMIN_PASSWORD` в `.env` пуст** (так по умолчанию) — сервер генерирует
пароль и печатает его **один раз** в логах. Скрипт показывает его сам:

```
» ADMIN_PASSWORD пуст — пароль админа печатается один раз в логах:
  Логин:  owner
  Пароль: Bomba-xxxx-xxxx-xxxx
```

Если не успели скопировать — посмотрите ещё раз:

```bash
docker compose logs api | grep -A4 'начальный администратор создан'
```

Если и там пусто (админ создавался раньше), пароль восстановить нельзя — только
сменить через админку или пересоздать базу (`bash scripts/tunnel.sh --down` с
удалением тома).

**Если задали `ADMIN_PASSWORD` в `.env` сами** — используйте его. Минимум 12 символов.

При первом входе система попросит сменить пароль (`mustChangePassword: true`) —
это нормально и сделано специально.

---

## 3. Проверка, что всё живо

```bash
# локально
curl http://localhost:4000/api/health          # {"ok":true,...}
curl http://localhost:8080/api/health          # то же самое через админку

# публично (подставьте свой адрес из шага 1)
curl https://spisok-xxx.trycloudflare.com/api/health
```

Все три должны вернуть `{"ok":true,...}`.

---

## 4. Админка

Откройте публичный адрес в браузере → войдите как `owner` со своим паролем.

Всё работает по-настоящему: пользователи, матчи, коэффициенты, расчёт выигрышей,
заявки на призы, корректировка баланса, журнал действий, настройки.

Локально админка также доступна на `http://localhost:8080`.

---

## 5. APK для телефона

Адрес API вшивается в приложение при сборке:

```bash
cd android
gradle :app:assembleRelease -PapiBaseUrl=https://spisok-xxx.trycloudflare.com
# → app/build/outputs/apk/release/app-release.apk
```

Установка:

```bash
adb install -r app/build/outputs/apk/release/app-release.apk
```

Или просто скачайте APK из админки — он раздаётся по пути `/download/`, если
положить файл в `android/app/build/outputs/apk/`.

Правила:

- адрес **без** завершающего слэша;
- обязателен **HTTPS** (туннель его даёт) — Android блокирует `http://` в интернет;
- адрес туннеля **меняется** при перезапуске → APK придётся пересобрать (см. шаг 7).

Подробнее про сборку — `docs/BUILD_APK.md`.

---

## 6. Полезные команды

```bash
docker compose ps                      # статус контейнеров
docker compose logs -f api             # логи сервера в реальном времени
docker compose logs api | tail -50     # последние 50 строк
docker compose restart api             # перезапустить только API
docker compose down                    # остановить (данные сохранятся)
docker compose down -v                 # остановить И УДАЛИТЬ базу (осторожно!)
```

Резервная копия базы (делается автоматически сервисом `backup` в
`docker/backups/`, но можно и вручную):

```bash
docker compose exec -T db pg_dump -U bombabet bombabet | gzip > backup-$(date +%F).sql.gz
```

Восстановление:

```bash
gunzip -c backup-2026-01-01.sql.gz | docker compose exec -T db psql -U bombabet -d bombabet
```

---

## 7. Постоянный адрес (чтобы не пересобирать APK)

Бесплатный quick-туннель меняет адрес при каждом запуске — это неудобно: APK
приходится пересобирать. Решение — **именованный туннель** с вашим доменом.

Нужно: домен, добавленный в Cloudflare (сам домен покупается отдельно, DNS-хостинг
в Cloudflare бесплатный). Если домена нет, можно пропустить этот шаг и просто
пересобирать APK — для компании друзей это нормально.

```bash
# 1. вход в Cloudflare (откроется браузер)
cloudflared tunnel login

# 2. создаём именованный туннель
cloudflared tunnel create bombabet

# 3. привязываем поддомен к туннелю
cloudflared tunnel route dns bombabet api.ваш-домен.ру

# 4. запускаем: туннель на админку (она проксирует и API)
cloudflared tunnel run --url http://localhost:8080 bombabet
```

Теперь адрес `https://api.ваш-домен.ру` не меняется никогда, и APK собирается
один раз:

```bash
cd android
gradle :app:assembleRelease -PapiBaseUrl=https://api.ваш-домен.ру
```

Чтобы туннель поднимался сам при включении компьютера, установите его как службу:

```bash
sudo cloudflared service install
```

---

## 8. Частые проблемы

| Симптом | Причина и решение |
| --- | --- |
| `Cannot connect to the Docker daemon` | Docker Desktop не запущен. Откройте его и подождите. |
| `docker: command not found` | Docker не установлен. См. шаг 0. |
| Скрипт пишет, что нет cloudflared | Установите по шагу 1 и запустите снова. |
| Адрес `trycloudflare.com` не открывается | Подождите 10–20 секунд после старта — туннель регистрируется. |
| `API не поднялся за 60 секунд` | Посмотрите `docker compose logs api`. Часто порт 4000 занят — смените `API_PORT` в `.env`. |
| Порт занят (`address already in use`) | Поменяйте `API_PORT` / `ADMIN_PORT` в `.env` и перезапустите. |
| В браузере админка пустая/белая | Откройте консоль (F12). Если ошибка CORS — проверьте, что заходите по тому же адресу, что и API (один origin). |
| Телефон не логинится | APK собран со старым адресом. Пересоберите с текущим (шаг 5). |
| `CLEARTEXT communication not permitted` | В APK записан `http://`. Нужен `https://` (шаг 5). |
| Пароль админа потерян | Смените через админку или пересоздайте базу (шаг 2). |

---

## 9. Безопасность

- `.env` содержит пароли — он **не коммитится** в git (уже в `.gitignore`).
- Публичный адрес открыт всему интернету: любой, кто его узнает, увидит форму входа.
  Пароль админа — сильный, логин закрыт JWT. Для компании друзей этого достаточно.
- Если нужно спрятать сервер совсем — не запускайте туннель, используйте только
  локальный доступ (`bash scripts/tunnel.sh --no-tunnel`), а друзьям раздайте APK
  с адресом внутри вашей сети.
- Бэкапы базы лежат в `docker/backups/` — храните их в надёжном месте.
