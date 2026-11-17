# БОМБА БЕТ — деплой в облако (без привязки к платформе)

Админка живёт на Vercel. Backend — отдельный Docker-контейнер, поэтому его можно
запустить на **любом** хостинге, который умеет Docker: Northflank, Koyeb, Google
Cloud Run, Render, Fly.io и т.д. База данных — внешний PostgreSQL (рекомендую Neon).

Такая схема выбрана осознанно: backend — это долгоживущий сервер с пулом
соединений к Postgres, поэтому он **не** подходит для serverless-платформ вроде
Vercel. Docker-образ переносим между хостингами без изменений кода.

---

## 1. Итоговая схема

```
Браузер ──► Vercel (admin/)          https://bomba-bet.vercel.app
                     │
                     │  VITE_API_BASE
                     ▼
Android ──► Backend (Docker)          https://api.<хост>.app
                     │  DATABASE_URL
                     ▼
            Neon PostgreSQL (free)
```

Три независимых куска:

| Часть | Где | Что деплоим |
| --- | --- | --- |
| Админ-панель | Vercel | статика из `admin/` |
| Backend API | любой Docker-хост | образ из `backend/Dockerfile` |
| База | Neon (или свой Postgres) | миграции применяются сами при старте |

---

## 2. Backend: почему Docker

`backend/Dockerfile` уже готов: multi-stage сборка, запуск от непривилегированного
пользователя, `tini` как init, клиент `psql` для бэкапов. Entrypoint сам:

1. ждёт, пока база начнёт принимать соединения;
2. применяет миграции (`node dist/db/migrate.js`);
3. создаёт настройки и администратора (`node dist/db/seed.js`);
4. запускает API (`node dist/server.js`).

Все шаги идемпотентны — повторный запуск ничего не ломает.

Проверить локально:

```bash
cd backend
sudo docker build -t bombabet-api .
sudo docker run --rm -p 4000:4000 \
  -e DATABASE_URL="postgres://user:pass@host:5432/db?sslmode=require" \
  -e JWT_SECRET="$(openssl rand -base64 48)" \
  -e ADMIN_PASSWORD="СмениМеня123456" \
  bombabet-api
curl http://127.0.0.1:4000/api/health   # {"ok":true,...}
```

> ⚠️ В `backend/.dockerignore` перечислены `.env` и `.env.*`. Это важно: иначе
> при сборке образа на чужом сервере туда уедет `backend/.env` с реальным
> `JWT_SECRET` и паролем базы.

---

## 3. Бесплатные хостинги для backend

Цифры взяты со страниц тарифов на момент написания. Тарифы меняются —
**проверьте перед деплоем**.

| Хостинг | Бесплатно | Минусы |
| --- | --- | --- |
| **Northflank** | Sandbox Free: до **$20/мес** ресурсов, 2 сервиса, 2 job, **1 база**, без карты | лимит $20, дальше pay-as-you-go |
| **Koyeb** | Free Instance: 512 MB RAM, 0.1 vCPU, 2 GB SSD | 1 инстанс на организацию; **засыпает после 1 ч** без трафика; нет volumes; только один регион (Frankfurt или Washington, D.C.); «не для продакшена» |
| **Google Cloud Run** | Always Free: 2 млн запросов/мес | нужен аккаунт GCP; scale-to-zero (холодный старт) |
| **Render** | Web Service free: 512 MB RAM | **засыпает** после простоя; free Postgres **удаляется через 30 дней** |
| **Fly.io** | — | для новых организаций бесплатного тарифа нет (отменён в окт. 2024) |
| **Railway** | только 30-дневный триал ($5), потом $1/мес | постоянного бесплатного нет |
| **Heroku** | — | бесплатный тариф убран в 2022 |

Уже закрылись, не рассматривайте: Glitch, Cyclic, Adaptable, Deta Space.

### Что выбрать под ваши задачи

- **Хочется без засыпания и без карты** → Northflank Sandbox Free.
- **Проще всего поднять** → Koyeb (но засыпает через час, первый запрос после
  сна медленный — для компании друзей это терпимо).
- **Уже есть аккаунт GCP** → Cloud Run, самый предсказуемый вариант.

Render тоже рабочий вариант, но именно из-за удаления бесплатной базы через
30 дней я не советую брать у него Postgres.

---

## 4. База данных: Neon (рекомендую)

Бесплатный Postgres от Render **удаляется через 30 дней** — вместе с очками
друзей. Neon Free-план постоянный.

1. Регистрация на [neon.com](https://neon.com/) (карта не нужна).
2. **Create project** → регион ближе к вашему backend (например, Frankfurt).
3. Скопируйте **connection string** из **Connection Details**. Он выглядит так:

   ```
   postgresql://USER:PASSWORD@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require
   ```

4. Добавьте `?sslmode=require`, если его нет. Это строка для `DATABASE_URL`.

Free-план Neon: 100 проектов, 1 GB хранилища на проект, scale-to-zero, без карты.
После простоя первое подключение «будит» базу пару секунд — это нормально,
backend сам ждёт (до 30 попыток по 2 секунды).

Альтернативы: **Supabase** (free 500 MB, но проект **пауза после 1 недели**
простоя и максимум 2 активных проекта), **Aiven** (free-план PostgreSQL).

---

## 5. Переменные окружения backend

Задаются в панели хостинга (**Environment Variables**).

| Переменная | Обязательна | Значение |
| --- | --- | --- |
| `DATABASE_URL` | да | строка от Neon, со `?sslmode=require` |
| `JWT_SECRET` | да | `openssl rand -base64 48`, **≥32 символа** |
| `ADMIN_USERNAME` | нет | логин админа, по умолчанию `owner` |
| `ADMIN_PASSWORD` | нет | пароль первого админа, **≥12 символов** |
| `CORS_ORIGIN` | нет | `https://bomba-bet.vercel.app` (см. раздел 7) |
| `PORT` | нет | хостинг подставляет сам |
| `HOST` | нет | `0.0.0.0` (значение по умолчанию) |
| `PGSSLMODE` | нет | `require` — если строка без `sslmode` |
| `SIGNUP_BONUS` | нет | приветственные очки, по умолчанию `500` |

Сгенерировать секрет:

```bash
openssl rand -base64 48
```

В `NODE_ENV=production` (его выставляют все хостинги) отсутствие `DATABASE_URL`
или `JWT_SECRET` **останавливает** запуск с понятной ошибкой — чтобы случайно не
уйти на localhost или dev-секрет.

`ADMIN_PASSWORD` можно не задавать: тогда сервер сгенерирует пароль и напечатает
его **один раз** в логах. Скопируйте сразу, повторно не покажется. Аккаунт
помечается «сменить пароль», и при первом входе приложение попросит новый.

---

## 6. Публичный адрес API

После деплоя у сервиса будет домен вида `https://api-xxx.koyeb.app` или
`https://api-xxx.northflank.app`. Проверьте:

```bash
BASE=https://<ваш-backend>

curl -sS $BASE/api/health
# {"ok":true,"ts":"..."}

curl -sS -X POST $BASE/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"owner","password":"ВАШ_ПАРОЛЬ"}'
# → {"user":{...,"role":"admin"},"accessToken":"...","refreshToken":"..."}
```

Health-check настраивается на `/api/health`.

---

## 7. CORS

Backend читает `CORS_ORIGIN` — список origin через запятую. Для вашей админки:

```
CORS_ORIGIN=https://bomba-bet.vercel.app
```

Android-клиента CORS не касается (это ограничение браузера), приложение работает
с API напрямую.

---

## 8. Админка на Vercel

В `admin/vercel.json` уже лежит конфиг:

```json
{
  "installCommand": "npm ci",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

Два обязательных шага в панели Vercel:

1. **Settings → Environment Variables** → добавьте
   `VITE_API_BASE = https://<ваш-backend>`.
2. **Redeploy** — Vite вшивает переменные **на этапе сборки**, без пересборки
   значение не подхватится.

`rewrites` нужен для `react-router`: без него перезагрузка на `/users` даёт 404.
Vercel отдаёт реальные файлы раньше, чем применяет rewrites, поэтому ассеты и
`/assets/*` продолжают работать.

---

## 9. Сборка APK под свой backend

Адрес API вшивается при сборке:

```bash
cd android
gradle :app:assembleRelease -PapiBaseUrl=https://<ваш-backend>
# → app/build/outputs/apk/release/app-release.apk
```

Или поменяйте значение по умолчанию в `android/app/build.gradle.kts`:

```kotlin
val apiBaseUrl = (project.findProperty("apiBaseUrl") as String?)
    ?: "https://<ваш-backend>"
```

Правила:

- адрес **без** завершающего слэша — `/api/...` добавляется сам;
- для публичного домена обязателен **HTTPS** (хостинги выдают сертификат сами);
- `http://` к интернету Android заблокирует (cleartext traffic).

Установка: `adb install -r android/app/build/outputs/apk/release/app-release.apk`.
Подробнее — `docs/BUILD_APK.md`.

---

## 10. Частые проблемы

| Симптом | Причина и решение |
| --- | --- |
| Админка: `POST /api/... → 404` | Не задан `VITE_API_BASE` или не было Redeploy. Раздел 8. |
| Админка: `/users` → 404 при F5 | Нет `rewrites` в `admin/vercel.json`. Раздел 8. |
| Браузер: CORS error | Неверный `CORS_ORIGIN` на backend. Раздел 7. |
| `DATABASE_URL must be set in production` | Переменная не задана. Раздел 5. |
| `JWT_SECRET must be at least 32 characters` | `openssl rand -base64 48`. |
| `password authentication failed` | Перекопируйте строку подключения из Neon. |
| `connect ECONNREFUSED` / таймаут к базе | Нет `?sslmode=require`; Neon засыпает и просыпается — подождите. |
| Сервис запущен, но 502/таймаут | Контейнер слушает не тот интерфейс. Проверьте `HOST=0.0.0.0`. |
| Первый запрос долгий | Scale-to-zero у хостинга или Neon. Это нормально. |
| Android: `CLEARTEXT communication not permitted` | В APK записан `http://`. Пересоберите с `https://`. |

---

## 11. Резервные копии

Бесплатные базы легко потерять (пауза, удаление, лимиты). Делайте дампы:

```bash
pg_dump "postgresql://USER:PASS@HOST/DB?sslmode=require" -Fc -f bombabet-$(date +%F).dump
```

В Docker-стеке есть готовый сервис `backup` (`docker/backup.sh`), он делает
логические бэкапы по расписанию. Для облачного деплоя можно запускать тот же
скрипт по cron отдельно или вручную раз в неделю.
