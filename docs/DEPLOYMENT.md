# БОМБА БЕТ — развёртывание

Закрытый шуточный проект для компании друзей. Прогнозы бесплатные, баланс —
виртуальные очки, призы администратор выдаёт вручную в Telegram Stars.
Денежных депозитов и платных ставок нет.

---

## 1. Состав проекта

| Каталог            | Что это                                              |
| ------------------ | ---------------------------------------------------- |
| `backend/`         | REST API: Node.js + TypeScript + PostgreSQL          |
| `admin/`           | Админ-панель: React + TypeScript + Vite              |
| `android/`         | Android-приложение: Kotlin + Jetpack Compose         |
| `docker-compose.yml` | Полный стек: база, API, админка, резервные копии   |
| `docs/`            | Инструкции                                           |

---

## 2. Быстрый старт в Docker

Нужен только Docker (с плагином Compose).

```bash
cd /path/to/bomba-bet

# 1) Задайте секреты. Пароль администратора НЕ хранится в открытом виде:
#    он передаётся один раз, хэшируется, и аккаунт требует смены пароля.
cat > .env <<'ENV'
POSTGRES_USER=bombabet
POSTGRES_PASSWORD=<придумайте_сложный_пароль_бд>
POSTGRES_DB=bombabet
JWT_SECRET=<случайная_строка_не_короче_32_символов>
ADMIN_USERNAME=owner
# Оставьте пустым, чтобы сервер сгенерировал пароль и напечатал его ОДИН раз в лог.
ADMIN_PASSWORD=
API_PORT=4000
ADMIN_PORT=8080
ENV

# 2) Запуск всего стека
docker compose up -d --build

# 3) Первый запуск: узнайте пароль администратора (печатается один раз)
docker compose logs api | grep -A4 "начальный администратор"
```

Готово:

* API — http://localhost:4000/api/health
* Админ-панель — http://localhost:8080
* PostgreSQL — внутри сети compose, наружу порт не публикуется

Миграции и создание администратора выполняются автоматически при старте
контейнера `api` (см. `backend/docker/entrypoint.sh`).

### Наполнить демо-данными (по желанию)

```bash
SEED_DEMO_DATA=true docker compose up -d api
```

Скрипт идемпотентен: повторный запуск не создаёт дубликаты.

---

## 3. Переменные окружения

| Переменная                | Назначение                                            | По умолчанию |
| ------------------------- | ----------------------------------------------------- | ------------ |
| `POSTGRES_*`              | Доступ к базе                                          | —            |
| `DATABASE_URL`            | Строка подключения (собирается в compose)              | —            |
| `JWT_SECRET`              | Ключ подписи JWT, минимум 32 символа в проде           | —            |
| `JWT_ACCESS_TTL`          | Время жизни access-токена, секунды                     | `900`        |
| `JWT_REFRESH_TTL_DAYS`    | Время жизни refresh-токена, дни                        | `30`         |
| `ADMIN_USERNAME`          | Логин первого администратора                           | `owner`      |
| `ADMIN_PASSWORD`          | Пароль администратора. Пусто → сгенерируется           | пусто        |
| `SIGNUP_BONUS`            | Приветственный бонус новому игроку                     | `1000`       |
| `CORS_ORIGIN`             | Разрешённые источники (`*` или список через запятую)   | `*`          |
| `SEED_DEMO_DATA`          | Загрузить демо-матчи и игроков                         | `false`      |
| `BACKUP_INTERVAL_HOURS`   | Период резервного копирования                          | `24`         |
| `BACKUP_KEEP`             | Сколько архивов хранить                                | `14`         |
| `LOG_LEVEL`               | Уровень логирования pino                               | `info`       |

---

## 4. Запуск без Docker (для разработки)

### База данных

```bash
createdb bombabet
export DATABASE_URL="postgres://localhost:5432/bombabet"
```

### Backend

```bash
cd backend
npm install
npm run migrate     # применить SQL-миграции
npm run seed        # создать администратора и настройки по умолчанию
npm run dev         # http://localhost:4000
```

### Админ-панель

```bash
cd admin
npm install
VITE_API_TARGET=http://localhost:4000 npm run dev   # http://localhost:5173
```

Админка ходит в API через прокси `/api`, поэтому в браузере один источник.

### Тесты

```bash
cd backend && npm test          # end-to-end сценарии API
cd android && gradle test       # юнит- и интеграционные тесты клиента
```

---

## 5. Первый вход администратора

1. Откройте админ-панель.
2. Введите `ADMIN_USERNAME` и пароль из лога первого запуска
   (или тот, что вы задали в `ADMIN_PASSWORD`).
3. При первом входе система **обязательно** требует задать новый пароль —
   временный сразу перестаёт действовать, все старые refresh-токены отзываются.
4. Дальше доступны разделы: обзор, пользователи, события, призы, журнал,
   настройки.

---

## 6. Резервное копирование

Контейнер `backup` каждые `BACKUP_INTERVAL_HOURS` делает `pg_dump`, сжимает
архив в `docker/backups/bombabet-<время>.sql.gz` и хранит последние
`BACKUP_KEEP` файлов.

Восстановление:

```bash
gunzip -c docker/backups/bombabet-20260101T030000Z.sql.gz \
  | docker compose exec -T db psql -U bombabet -d bombabet
```

Ручной дамп в любой момент:

```bash
docker compose exec db pg_dump -U bombabet bombabet | gzip > backup-$(date +%F).sql.gz
```

---

## 7. Обновление схемы

Миграции лежат в `backend/migrations/` и применяются по порядку имени файла.
Каждая записанная миграция фиксируется в таблице `schema_migrations`, поэтому
повторный запуск безопасен.

Добавить миграцию: создайте `backend/migrations/002_название.sql`, затем

```bash
docker compose restart api      # применит новые миграции при старте
```

или локально `cd backend && npm run migrate`.

---

## 8. Публикация API для телефона

Приложение должно знать адрес сервера. Адрес задаётся в
`android/app/build.gradle.kts` в поле `API_BASE_URL`.

* Эмулятор Android видит хост как `http://10.0.2.2:4000`.
* Реальный телефон должен обращаться к машине в локальной сети:
  `http://192.168.x.x:4000`. Убедитесь, что порт открыт в файрволе.
* Для публичного доступа поставьте API за HTTPS-прокси (nginx, Caddy) и
  укажите в `CORS_ORIGIN` домен админки.

Сборка APK описана в `docs/BUILD_APK.md`.
