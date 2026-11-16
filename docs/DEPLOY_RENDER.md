# БОМБА БЕТ — деплой backend на Render

Инструкция для развёртывания backend на [Render](https://render.com/) как
Web Service + PostgreSQL. Всё, что описано ниже, проверено на реальной сборке
и запуске против настоящей базы данных.

---

## 1. Почему была ошибка ENOENT

Render по умолчанию выполняет команды в **корне репозитория**, а не в папке
backend. Отсюда и ошибка:

```
npm error enoent Could not read package.json:
open '/opt/render/project/src/package.json'
```

Фактическая структура репозитория такая:

```
bomba-bet/
├── backend/            ← ЗДЕСЬ package.json
│   ├── package.json
│   ├── package-lock.json
│   ├── tsconfig.json
│   ├── tsconfig.build.json
│   ├── migrations/     ← SQL-миграции
│   ├── src/            ← исходники TypeScript
│   └── dist/           ← собирается в build (в git не хранится)
├── admin/              ← админ-панель (React), не нужна для этого сервиса
├── android/            ← Android-клиент
├── docker/             ← docker-конфигурация
├── docker-compose.yml
└── render.yaml         ← blueprint для Render
```

`package.json` **не** в корне репозитория и **не** в `src/` — он в `backend/`.
Поэтому Render'у нужно явно указать корневую директорию.

Вторая ловушка: Render выставляет `NODE_ENV=production`, а при этом `npm ci`
**не ставит devDependencies** — и сборка падает с `sh: 1: tsc: not found`.
Сборка должна явно запрашивать dev-зависимости флагом `--include=dev`.

---

## 2. Точные настройки Render

### Вариант A — Blueprint (рекомендуется)

В репозитории есть `render.yaml`. Порядок действий:

1. Render Dashboard → **New** → **Blueprint**.
2. Подключите GitHub-репозиторий `normanrus/Bomba-bet`.
3. Render прочитает `render.yaml`, создаст сервис `bombabet-api` и базу
   `bombabet-db`, и свяжет их.
4. На шаге подтверждения Render спросит `ADMIN_PASSWORD` — введите пароль
   длиной **не менее 12 символов**. Он используется один раз, при первом
   запуске, для создания администратора.
5. Дождитесь окончания деплоя (статус **Live**).

### Вариант B — вручную (Web Service)

Render Dashboard → **New** → **Web Service** → подключить репозиторий, затем:

| Поле                   | Значение                                          |
| ---------------------- | ------------------------------------------------- |
| **Name**               | `bombabet-api`                                    |
| **Language / Runtime** | Node                                              |
| **Region**             | любая (например, Frankfurt)                       |
| **Branch**             | `main`                                            |
| **Root Directory**     | `backend`                                         |
| **Build Command**      | `npm ci --include=dev && npm run build`           |
| **Start Command**      | `npm start`                                       |
| **Health Check Path**  | `/api/health`                                     |
| **Instance Type**      | Free (или выше, если нужна скорость)              |

> **Root Directory = `backend`** — это и есть исправление ошибки ENOENT.
> Если поле пустое, Render ищет `package.json` в корне репозитория и падает.

### Скрипты npm, которые использует Render

Из `backend/package.json`:

| Скрипт            | Что делает                                  | Где используется       |
| ----------------- | ------------------------------------------- | ---------------------- |
| `npm run build`   | `tsc -p tsconfig.build.json` → `dist/`       | Build Command          |
| `npm start`       | `node dist/server.js`                        | Start Command          |
| `npm run migrate:prod` | `node dist/db/migrate.js`               | вручную, если нужно    |
| `npm run seed:prod`    | `node dist/db/seed.js`                  | вручную, если нужно    |

Отдельный шаг миграций настраивать **не нужно**: `npm start` при каждом
запуске сам применяет миграции, создаёт настройки по умолчанию и
bootstrap-администратора. Все три операции идемпотентны, повторный запуск
безопасен.

---

## 3. Переменные окружения

Задаются в Render: **Service → Environment → Environment Variables**.

| Переменная        | Обязательна | Значение / как получить                                      |
| ----------------- | ----------- | ------------------------------------------------------------ |
| `NODE_ENV`        | да          | `production`                                                 |
| `HOST`            | да          | `0.0.0.0` — иначе сервер слушает только loopback и Render его не увидит |
| `PORT`            | нет         | Render подставляет сам; трогать не нужно                     |
| `DATABASE_URL`    | да          | строка подключения к базе (см. раздел 4)                     |
| `JWT_SECRET`      | да          | длинная случайная строка, **минимум 32 символа**             |
| `ADMIN_USERNAME`  | нет         | логин администратора, по умолчанию `owner`                    |
| `ADMIN_PASSWORD`  | нет         | пароль первого админа, **минимум 12 символов**               |
| `CORS_ORIGIN`     | нет         | домен админ-панели, либо `*` (см. раздел 7)                  |
| `PGSSLMODE`       | нет         | `require` для внешнего Postgres с обязательным SSL           |
| `SIGNUP_BONUS`    | нет         | приветственные очки новому игроку (по умолчанию `500`)       |

Сгенерировать `JWT_SECRET`:

```bash
openssl rand -base64 48
```

`ADMIN_PASSWORD` можно не задавать: тогда сервер сгенерирует надёжный пароль
и напечатает его **один раз** в логах (`Logs` в панели Render). Скопируйте его
сразу — повторно он не покажется. Аккаунт помечается `must_change_password`,
поэтому при первом входе приложение попросит сменить пароль.

> Если в `production` не задать `DATABASE_URL` или `JWT_SECRET`, сервер
> намеренно **не стартует** и пишет понятную ошибку, например:
> `DATABASE_URL must be set in production (NODE_ENV=production)`.
> Это защита от случайного запуска на локальной базе с dev-секретом.

---

## 4. Подключение PostgreSQL

### Вариант A — база Render (проще всего)

1. Render Dashboard → **New** → **Postgres**.
2. Name: `bombabet-db`, Region — та же, что у web-сервиса, Plan: Free.
3. После создания откройте базу → **Connections** → скопируйте
   **Internal Database URL** (внутри Render, быстрее и без SSL).
4. В web-сервисе задайте переменную `DATABASE_URL` = эта строка.

Строка имеет вид:

```
postgres://USER:PASSWORD@HOST/DBNAME
```

`pg` сам разбирает `sslmode` из строки подключения: `sslmode=require` включает
TLS, `sslmode=disable` выключает. Дополнительно можно задать `PGSSLMODE=require`
— тогда TLS включается независимо от строки (используется `rejectUnauthorized: false`,
что подходит для managed-Postgres с самоподписанным сертификатом).

### Вариант B — внешняя база (Neon, Supabase, свой сервер)

Возьмите connection string у провайдера, добавьте `?sslmode=require` и
положите в `DATABASE_URL`. Схему создавать вручную не нужно — миграции
применятся при первом старте.

> **Важно:** Render Free-план засыпает после простоя, и бесплатная база
> Render удаляется через ~30 дней. Для постоянного хранения друзей с
> реальными очками лучше внешний Postgres (Neon/Supabase free tier) или
> платный план. Это ограничение Render, не приложения.

---

## 5. Публичный URL backend

После деплоя сервис доступен по адресу:

```
https://<имя-сервиса>.onrender.com
```

Например, если имя сервиса `bombabet-api`:

```
https://bombabet-api.onrender.com
```

Точный URL виден в Render: **Service → Settings → URL** (или сверху страницы
сервиса). Проверить API:

```bash
curl https://bombabet-api.onrender.com/api/health
# {"ok":true,"ts":"..."}
```

> Первый запрос после простоя может занять до минуты — Free-план «просыпается».

---

## 6. Замена localhost в Android-приложении

Адрес API задаётся на этапе сборки APK через Gradle-свойство `apiBaseUrl`
(по умолчанию — `http://10.0.2.2:4000`, хост-машина для эмулятора).

Соберите APK с публичным адресом Render:

```bash
cd android
gradle :app:assembleRelease -PapiBaseUrl=https://bombabet-api.onrender.com
# → app/build/outputs/apk/release/app-release.apk
```

Либо измените значение по умолчанию в `android/app/build.gradle.kts`:

```kotlin
val apiBaseUrl = (project.findProperty("apiBaseUrl") as String?)
    ?: "https://bombabet-api.onrender.com"   // вместо http://10.0.2.2:4000
```

Правила:

* Адрес **без** завершающего слэша — путь `/api/...` добавляется сам.
* Для публичного домена обязателен **HTTPS**. Render выдаёт TLS-сертификат
  автоматически, так что `https://` здесь работает из коробки.
* `http://` к реальному серверу в интернете Android заблокирует
  (cleartext traffic). Cleartext разрешён только для локальной разработки.

После смены адреса переустановите APK:

```bash
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

Подробнее о сборке — `docs/BUILD_APK.md`.

---

## 7. CORS

Backend читает `CORS_ORIGIN` — список разрешённых origin через запятую.
Значение `*` разрешает всем (удобно для старта).

* **Android-клиент**: CORS его не касается, это ограничение браузера.
  Приложение работает с API напрямую, поэтому `*` ему не мешает.
* **Админ-панель**: разместите её отдельно (Render Static Site, Vercel,
  Netlify) и впишите её домен:

  ```
  CORS_ORIGIN=https://bombabet-admin.onrender.com
  ```

  Если админка и API на одном домене, CORS вообще не задействуется.

---

## 8. Проверка работоспособности после деплоя

Замените `BASE` на URL вашего сервиса:

```bash
BASE=https://bombabet-api.onrender.com

# 1) Сервер жив
curl -sS $BASE/api/health
# {"ok":true,...}

# 2) Публичные настройки приложения читаются из БД
curl -sS $BASE/api/config | head -c 200

# 3) Вход администратора (пароль — тот, что задали в ADMIN_PASSWORD)
curl -sS -X POST $BASE/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"owner","password":"ВАШ_ПАРОЛЬ"}'
# → {"user":{...,"role":"admin"},"accessToken":"...","refreshToken":"..."}
```

Ожидаемый результат: health возвращает `{"ok":true}`, а login — объект с
`accessToken` и `role: "admin"`. Если login возвращает
`Неверный никнейм или пароль`:

* проверьте, что `ADMIN_PASSWORD` был задан **до** первого деплоя;
* если он был пустым — ищите сгенерированный пароль в логах сервера
  (`admin created`, печатается один раз);
* если базу пересоздавали — админ создаётся заново при следующем старте.

Если в логах деплоя видно `database not ready, retrying in a moment` —
это нормально: сервер ждёт, пока managed-база начнёт принимать соединения
(по умолчанию до 30 попыток по 2 секунды).

---

## 9. Частые ошибки и что делать

| Симптом в логах Render                                        | Причина и решение                                                                 |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `ENOENT ... /src/package.json`                                | Не задан **Root Directory**. Поставьте `backend`.                                  |
| `sh: 1: tsc: not found`                                       | `npm ci` без devDependencies. Build Command должен быть `npm ci --include=dev && npm run build`. |
| `DATABASE_URL must be set in production`                      | Переменная не задана. Добавьте `DATABASE_URL` в Environment.                       |
| `JWT_SECRET must be at least 32 characters in production`      | Слишком короткий секрет. Сгенерируйте: `openssl rand -base64 48`.                  |
| `connect ECONNREFUSED ...:5432`                                | База ещё не готова или неверный хост. Проверьте `DATABASE_URL`; сервер сам повторит попытку. |
| `password authentication failed for user`                      | Неверные логин/пароль в `DATABASE_URL`. Перекопируйте строку из базы.              |
| Сервис поднялся, но запросы висят / 502                        | Сервер слушает не тот интерфейс. Убедитесь, что `HOST=0.0.0.0`.                     |
| Android: `CLEARTEXT communication not permitted`               | В APK записан `http://`. Соберите с `https://...onrender.com`.                     |

---

## 10. Что было изменено для Render

Минимальные правки, без переписывания проекта:

* `backend/src/server.ts` — ожидание готовности БД с повтором, явный bind на
  `config.host`, и bootstrap-администратор прямо при старте (миграции +
  настройки + админ), чтобы `npm start` был самодостаточным.
* `backend/src/config.ts` — параметр `HOST` (по умолчанию `0.0.0.0`);
  в `production` отсутствие `DATABASE_URL`/`JWT_SECRET` теперь даёт понятную
  ошибку вместо тихого использования dev-значений.
* `backend/src/db/seed.ts` — `seedAdmin` экспортирован и переиспользуется
  сервером; CLI-запуск обёрнут в `require.main === module`, поэтому импорт
  больше не запускает seed и не закрывает пул.
* `backend/package.json` — добавлены `engines.node >= 20`, `migrate:prod`,
  `seed:prod`.
* `backend/.env.example` — задокументированы `HOST`, `DB_READY_ATTEMPTS`,
  `DB_READY_DELAY_MS`.
* `render.yaml` — blueprint с правильным `rootDir: backend`.

Совместимость Android-клиента сохранена: схема API, пути `/api/...`, формат
ответов и авторизация не менялись.
