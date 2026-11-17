# БОМБА БЕТ — пошаговый деплой без Render

Это подробный туториал «делай раз-два-три». В конце у вас будет:

- backend API в интернете, с реальной базой PostgreSQL;
- админка, которая с ним разговаривает;
- APK, который логинится на ваш сервер.

Время — примерно 20–30 минут. Деньги — 0 ₽.

Схема, к которой мы идём:

```
Android ─┐
         ├──► Backend (Docker, Northflank) ──► PostgreSQL (addon в Northflank)
Vercel ──┘            https://api-xxx.northflank.app
(админка)
```

Почему так: backend — это долгоживущий сервер с пулом соединений к Postgres.
Он **не** подходит для serverless-платформ вроде Vercel. Поэтому backend едет в
Docker-контейнер, а админка (это просто статика) живёт на Vercel.

Обзор альтернатив и общие принципы — в `docs/DEPLOY_CLOUD.md`. Здесь только
один конкретный рабочий путь, по шагам.

---

## 0. Что понадобится заранее

| Что | Зачем | Где взять |
| --- | --- | --- |
| Аккаунт GitHub | там лежит код | уже есть (`normanrus/Bomba-bet`) |
| Аккаунт Northflank | хостинг backend + база | [app.northflank.com](https://app.northflank.com/) |
| Аккаунт Vercel | админка | уже есть (`bomba-bet.vercel.app`) |
| Локально: `openssl` | сгенерировать секрет | есть на Linux/macOS |

> ⚠️ **Важно про карту.** Northflank просит привязать карту при регистрации —
> для проверки личности, чтобы не было злоупотреблений. Списаний на бесплатном
> плане не будет, но карта нужна. Если карты нет вообще — смотрите раздел 11
> (там вариант с Koyeb).

---

## 1. Регистрация в Northflank

1. Откройте [app.northflank.com](https://app.northflank.com/) → **Sign up**.
2. Зарегистрируйтесь через GitHub (так проще — сразу подключится репозиторий).
3. На шаге выбора плана выберите **Developer Sandbox** (это и есть бесплатный).
4. Привяжите карту, когда попросит (Billing → Add a card). Это только проверка.
5. **Сразу поставьте лимит расходов**, чтобы не было сюрпризов:
   Billing → **Billing alerts** → поставьте порог, например `$1`.
   На бесплатном плане вы в него не упрётесь, но спокойнее.

Что даёт бесплатный план (Developer Sandbox):

- **2 сервиса** (нам нужен 1);
- **2 job**;
- **1 addon** (это наша база данных);
- 1 BYOC-кластер.

Этого хватает с запасом.

---

## 2. Создаём проект

Проект — это папка, внутри которой сервис и база видят друг друга по внутренней
сети (без интернета).

1. Откройте [форму создания проекта](https://app.northflank.com/s/account/projects/new)
   (или кнопка **Create project** на дашборде).
2. **Project name**: `bombabet`.
3. **Project region**: выберите `Europe West Frankfurt` (ближе к вам и к Vercel).
4. Остальное не трогаем → **Create project**.

> Регион потом **не поменять**. Если ошибётесь — удалите проект и создайте заново.

---

## 3. Создаём базу данных (addon)

Данные друзей должны где-то лежать. Используем бесплатный addon — это Postgres
внутри того же проекта.

1. Откройте [создание addon](https://app.northflank.com/s/project/create/addon)
   (или **Create new → Addon** справа сверху).
2. **Type**: `PostgreSQL`.
3. **Name**: `bombabet-db`.
4. **Version**: оставьте значение по умолчанию (самая свежая, 16+).
5. **TLS**: включите (для внутренней сети можно и без, но пусть будет).
6. **Publicly accessible**: **не** включайте. База нужна только backend'у внутри
   проекта — наружу её светить незачем и небезопасно.
7. **Resources**: минимальные (для компании друзей хватит).
8. **Create addon**. Провизioning занимает пару минут, статус станет `running`.

### Забираем строку подключения

1. Откройте addon `bombabet-db` → вкладка **Connection details**.
2. Найдите **`POSTGRES_URI`** — это строка вида:

   ```
   postgresql://bombabet_xxx:пароль@<внутренний-хост>:5432/bombabet
   ```

   Хост здесь — **внутренний** (короткое имя внутри проекта, а не интернет-адрес).
   Это правильно: backend и база в одном проекте, трафик не выходит в интернет.
3. Скопируйте её — сейчас вставим в сервис.

> Строка подключения — это секрет. Не публикуйте её, не коммитьте в git.

---

## 4. Деплоим backend

Backend собирается из `backend/Dockerfile`. Важный нюанс: репозиторий
**монорепо** (внутри `backend/`, `admin/`, `android/`), поэтому надо указать
подпапку как контекст сборки.

### 4.1 Создаём сервис

1. Откройте [создание сервиса](https://app.northflank.com/s/project/create/service)
   (или **Create new → Service**).
2. Выберите тип **Combined** (это CI+CD: сам собирает и сам деплоит).
3. **Name**: `bombabet-api`.

### 4.2 Подключаем репозиторий

1. **Repository**: если GitHub уже связан — выберите `normanrus/Bomba-bet`.
   Если репозитория нет в списке — нажмите **Connect GitHub** и дайте Northflank
   доступ к нему.
2. **Branch**: `main`.

### 4.3 Настраиваем сборку (это ключевой шаг)

1. **Build options** → **Dockerfile**.
2. **Build context**: `/backend`
   *(без этого сборка упадёт: Dockerfile лежит не в корне).*
3. **Dockerfile path**: `/backend/Dockerfile`
   *(путь относительно корня репозитория).*

### 4.4 Переменные окружения

Откройте **Environment variables** (или **Build & deploy → Runtime variables**)
и добавьте:

| Переменная | Значение | Обязательна |
| --- | --- | --- |
| `DATABASE_URL` | строка `POSTGRES_URI` из шага 3 | **да** |
| `JWT_SECRET` | результат `openssl rand -base64 48` (см. ниже) | **да** |
| `ADMIN_USERNAME` | `owner` | нет |
| `ADMIN_PASSWORD` | пароль админа, **минимум 12 символов** | нет |
| `CORS_ORIGIN` | `https://bomba-bet.vercel.app` | нет |

Сгенерируйте секрет в терминале:

```bash
openssl rand -base64 48
```

Скопируйте вывод целиком — это значение `JWT_SECRET`. Он должен быть **не короче
32 символов**, иначе сервер откажется стартовать (это защита, а не баг).

Про `ADMIN_PASSWORD`:

- Если зададите — это будет пароль первого админа.
- Если **не** зададите — сервер сам сгенерирует пароль и напечатает его **один раз**
  в логах. Скопируйте сразу, второй раз он не появится.
- В любом случае при первом входе админку попросят сменить пароль.

### 4.5 Порты и сеть

1. Откройте **Configure → Networking**.
2. Northflank сам найдёт порт из `EXPOSE 4000` в Dockerfile. Если не нашёл —
   нажмите **Add port**:
   - **Port**: `4000`
   - **Protocol**: `HTTP`
   - **Accessibility**: `Public`
   - **Name**: `api`
3. Сохраните. Northflank выдаст публичный домен вида
   `https://api-xxx.northflank.app` и сам сделает TLS-сертификат (Let's Encrypt).

### 4.6 Health check (чтобы сервис не «мигал»)

1. Откройте **Health checks**.
2. **Add health check** → тип **Readiness** (или Liveness).
3. **Protocol**: `HTTP`.
4. **Path**: `/api/health`.
5. **Port**: `4000`.
6. Сохраните.

Теперь Northflank пускает трафик в контейнер только когда `/api/health` отвечает.
Это защищает от 502 сразу после деплоя.

### 4.7 Ресурсы

На странице **Resources** оставьте минимальный план
(например `nf-compute-20` — 0.2 vCPU / 512 MB). Для друзей этого достаточно.

### 4.8 Запуск

Нажмите **Create service**. Начнётся сборка. Первый билд идёт 3–6 минут.

Смотрите **Build logs**, затем **Runtime logs**. Успешный старт выглядит так:

```
[entrypoint] waiting for database...
[entrypoint] running migrations...
{"msg":"migrations complete"}
[entrypoint] seeding bootstrap admin and settings...
{"msg":"admin created from ADMIN_PASSWORD"}   ← или пароль в рамке, если не задавали
[entrypoint] starting API on port 4000
{"msg":"БОМБА БЕТ API слушает http://0.0.0.0:4000"}
```

Если видите эту картину — backend живой. Миграции и создание админа происходят
**автоматически при каждом старте** и идемпотентны (повторный запуск ничего не
ломает и не перезатирает пароль).

---

## 5. Проверяем API

Скопируйте публичный домен сервиса (виден в шапке сервиса и в Networking).

```bash
BASE=https://api-xxx.northflank.app     # ← ваш домен

# 1. Сервер жив?
curl -sS $BASE/api/health
# {"ok":true,"ts":"..."}

# 2. Логин админа работает?
curl -sS -X POST $BASE/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"owner","password":"ВАШ_ADMIN_PASSWORD"}'
# → {"user":{...,"role":"admin"},"accessToken":"...","refreshToken":"..."}
```

Если оба запроса ответили — backend готов. Если нет — раздел 10.

---

## 6. Админка на Vercel

Админка уже задеплоена на `https://bomba-bet.vercel.app`, но сейчас она **не
работает**: в неё не вшит адрес backend'а, поэтому запросы уходят в никуда и
получают 404.

Vite вшивает переменные **на этапе сборки**, поэтому одного изменения в панели
мало — нужен повторный деплой.

1. Откройте проект на [vercel.com](https://vercel.com/) → **Settings** →
   **Environment Variables**.
2. Добавьте:

   | Key | Value | Environments |
   | --- | --- | --- |
   | `VITE_API_BASE` | `https://api-xxx.northflank.app` | Production (и Preview) |

   Без завершающего слэша.
3. **Deployments** → у последнего деплоя **⋯** → **Redeploy**.
   (Именно Redeploy, а не просто Save — иначе старое значение останется в бандле.)

В репозитории уже лежит `admin/vercel.json` с правильными настройками:

```json
{
  "installCommand": "npm ci",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

`rewrites` нужен для `react-router`: без него перезагрузка страницы на `/users`
или `/events` даёт 404. Vercel отдаёт реальные файлы раньше, чем применяет
rewrites, поэтому картинки и `/assets/*` продолжают работать.

### Связка CORS

Backend пускает браузерные запросы только с адресов из `CORS_ORIGIN`. Он у нас уже
`https://bomba-bet.vercel.app`. Если админка переедет на другой домен — **обновите
`CORS_ORIGIN` на backend** и перезапустите сервис, иначе браузер заблокирует
запросы (в консоли будет `CORS error`).

Android CORS не касается — это ограничение браузеров, приложение ходит в API
напрямую.

---

## 7. Пересобираем APK под свой сервер

Адрес API вшивается в приложение при сборке.

```bash
cd android
gradle :app:assembleRelease -PapiBaseUrl=https://api-xxx.northflank.app
# → app/build/outputs/apk/release/app-release.apk
```

Правила:

- адрес **без** завершающего слэша — `/api/...` добавляется сам;
- для публичного домена обязателен **HTTPS** (Northflank выдаёт сертификат сам);
- `http://` в интернет Android заблокирует (cleartext traffic).

Установка на телефон:

```bash
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

Подробности по инструментам сборки — в `docs/BUILD_APK.md`.

---

## 8. Проверяем сценарии целиком

Пройдите цепочку как пользователь и как админ:

1. **Регистрация** — заведите друга в APK, проверьте приветственный бонус.
2. **Прогноз** — сделайте прогноз на матч, баланс должен уменьшиться на ставку.
3. **Создание матча** — в админке создайте событие и варианты прогнозов с
   коэффициентами.
4. **Расчёт** — завершите матч и укажите результат. Выигравший прогноз должен
   получить виртуальный выигрыш, проигравший — нет.
5. **Заявка на приз** — в APK запросите приз, указав Telegram-юзернейм.
6. **Выдача приза** — в админке подтвердите заявку, статус станет «Выдан».

В репозитории есть автоматический тест всех этих сценариев. Его можно прогнать
против вашего задеплоенного сервера:

```bash
cd backend
BASE=https://api-xxx.northflank.app/api \
ADMIN_PASSWORD='ВАШ_ADMIN_PASSWORD' \
bash scripts/e2e.sh
```

Ожидаемый финал: `===== PASS: 52   FAIL: 0 =====`.

> Два важных нюанса.
> 1. Тест создаёт данные. На «боевом» сервере с реальными друзьями лучше прогонять
>    его на отдельном проекте, а не на том, где уже играют.
> 2. Одна проверка (таблица лидеров) требует демо-данных. Если сервер поднят без
>    них, увидите `PASS: 51  FAIL: 1` — это ожидаемо, а не поломка. Чтобы прогнать
>    всё подряд, поднимите тестовый сервис с переменной `SEED_DEMO_DATA=true`.

---

## 9. Обновление кода и обслуживание

**Обновить backend.** Northflank следит за веткой `main` (CI/CD включён по
умолчанию). Просто запушьте коммит — сервис сам пересоберётся и передеплоится.
Вручную: **Restart** в шапке сервиса.

**Бэкапы базы.** Бесплатные базы легко потерять. Делайте дампы:

```bash
pg_dump "postgresql://USER:PASS@HOST:PORT/DB" -Fc -f bombabet-$(date +%F).dump
```

Для внутреннего addon'а хост недоступен извне — либо включите addon
**Publicly accessible** на время дампа, либо используйте встроенные
**Backup schedules** у addon (Database → Backups).

**Логи.** Runtime logs и Build logs доступны в панели сервиса в реальном времени.

---

## 10. Частые проблемы

| Симптом | Причина и решение |
| --- | --- |
| Сборка: `Dockerfile not found` | Не указан **Build context = `/backend`**. Шаг 4.3. |
| Сборка: `npm ci` падает | В `backend/` нет `package-lock.json` — он должен быть в git. |
| Runtime: `DATABASE_URL must be set in production` | Переменная не задана. Шаг 4.4. |
| Runtime: `JWT_SECRET must be at least 32 characters` | Секрет короче 32 символов. `openssl rand -base64 48`. |
| Runtime: `password authentication failed` | Перекопируйте `POSTGRES_URI` из Connection details. |
| Runtime: `connect ECONNREFUSED` / таймаут | База ещё не `running`, или неверный хост в строке. Подождите пару минут. |
| Деплой «успешен», но 502 | Нет public-порта или не задан health check. Шаги 4.5–4.6. |
| Первый запрос долгий | Addon/сервис «просыпается». Для друзей терпимо. |
| Админка: `POST /api/... → 404` | Не задан `VITE_API_BASE` или не было Redeploy. Шаг 6. |
| Админка: `/users` → 404 при F5 | Нет `rewrites` в `admin/vercel.json`. Шаг 6. |
| Браузер: CORS error | Неверный `CORS_ORIGIN` на backend. Шаг 6. |
| Android: `CLEARTEXT communication not permitted` | В APK записан `http://`. Пересоберите с `https://`. Шаг 7. |

---

## 11. Альтернативы

### Нет карты для Northflank → Koyeb

[Koyeb](https://www.koyeb.com/) даёт бесплатный инстанс (0.25 vCPU, 1 GB RAM,
1 GB диска) в Frankfurt / Washington / Singapore. Backend там деплоится так же:
источник — Dockerfile, **build context `/backend`**, порт 4000, те же переменные.

Минусы: один инстанс, **засыпает после простоя** (первый запрос после сна
медленный), нет постоянных volumes.

### База снаружи: Neon

Если не хотите держать базу в Northflank (или хостинг её не даёт) — возьмите
[Neon](https://neon.com/): постоянный бесплатный Postgres, без карты.

1. Регистрация → **Create project** → регион `Frankfurt`.
2. **Connection details** → скопируйте строку:

   ```
   postgresql://USER:PASS@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require
   ```

3. Это и есть `DATABASE_URL`. Параметр `?sslmode=require` обязателен.
4. Если хостинг не понимает `sslmode` в строке — добавьте переменную
   `PGSSLMODE=require` отдельно.

Neon засыпает после простоя и «просыпается» пару секунд — backend это переживает
сам (entrypoint ждёт базу до 2 минут).

### Уже есть аккаунт Google Cloud → Cloud Run

Самый предсказуемый вариант, но нужен биллинг-аккаунт GCP. Scale-to-zero, есть
щедрый always-free уровень.
