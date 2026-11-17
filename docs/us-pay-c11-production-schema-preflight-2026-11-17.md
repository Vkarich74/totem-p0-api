# US-PAY-C11 — фактическая сверка структуры PostgreSQL Production (preflight)

**Дата анализа:** 17.11.2026  
**Источник:** существующие локальные read-only exports реальной production PostgreSQL 17, созданные 16.11.2026:
- `C:\Work\totem-global-audit\04_WORK_AREAS\US_20261114_DEV\US_PAY_SCHEMA_AUDIT_20261116\PROD_SCHEMA_ONLY_NO_DATA.sql` (без данных; 356604 bytes).
- `...\PROD_DB_SCHEMA_READONLY.json`, metadata `snapshot_at=2026-11-16T14:28:24.041Z`, `read_only=true`.
- `...\PROD_DB_AGGREGATES_READONLY.json` (структурные агрегаты; **не резервная копия**).

**Граница доказательства:** это анализ реального выгруженного состояния на 16 ноября, а не прямой запрос к LIVE PostgreSQL в момент написания. Новый `pg_dump` и полноценный backup содержимого БД **не выполнялись**: у текущей машины нет `DATABASE_URL`/`PGHOST`/`PGPASSWORD` в окружении, а Railway OAuth возвращает имена переменных без секретов. Запуск production миграций на этой основе запрещён.

## Сверка типов

| PROD объект/поле | Тип в prod snapshot | US-PAY-C11 контракт |
| --- | --- | --- |
| `auth_users.id` | integer | FK seller/owner events integer — совместимо |
| `auth_users.role` / `enabled` | text / boolean | salon_admin/master, live session enabled — совместимо |
| `auth_sessions.id` | **text** | OAuth attempts FK **text** — **ИСПРАВЛЕНО** 17.11 |
| `auth_sessions.user_id` | integer | direct live owner auth integer — совместимо |
| `auth_sessions.expires_at,last_seen_at,revoked_at` | timestamptz | fail-closed session checks — совместимо |
| `owner_salon.owner_id` | **text** | сравнивается как text — совместимо |
| `owner_salon.salon_id,status` | bigint / text | ACTIVE association required — **УСИЛЕНО** 17.11 |
| `salons.id,slug,enabled,status` | integer / text / boolean / text | US owner scope requires active enabled salon — **УСИЛЕНО** |
| `masters.id,user_id,active,slug` | integer / integer / boolean / text | master must directly own user_id and remain active — **УСИЛЕНО** |
| `master_salon.master_id,salon_id,status` | integer / integer / text | active master-salon relationship — совместимо |
| `markets.id,code,active,default_currency` | bigint / text / boolean / text | US+USD+active only — совместимо |
| `tenant_market_settings.salon_id,market_id` | integer / bigint | booking market relation — совместимо |
| `bookings.id,salon_id,master_id,service_id,currency_code` | integer/int/int/int/text | USD sidecars — совместимо |
| `salon_master_services.id,service_pk,currency_code` | integer/int/text | USD immutable price snapshot — совместимо |

## Обнаруженные дефекты и исправления

**BLOCKER-01 — несовпадение FK типа OAuth-сессии**: исходная миграция `2026_11_17__us_pay_c11_live_existing_oauth.sql` использовала `session_id uuid REFERENCES auth_sessions(id)`, но production `auth_sessions.id` — **text**, следовательно production миграция не могла успешно примениться. Исправлены **полные файлы** миграции и PG17 auth fixture на `text`; после этого запущена регрессионная CI сборка.

**SECURITY-02 — неактивная связь владельца**: исходный LIVE seller scope проверял прямое `owner_salon`, но не проверял `owner_salon.status`, `salons.enabled/status` и `masters.active`. Теперь LIVE onboarding требует только действующий салон, активную owner-связь, действующего мастера и активную session. Синтетические fixtures в CI приведены к подтверждённым production типам/полям; отрицательные проверки добавлены в уже существующую интеграцию, не создан новый тестовый салон или Stripe-продавец.

## LIVE environment — реальные текущие проверки

- Railway production проект `peaceful-growth`: API, PostgreSQL 17, Redis, Admin **SUCCESS**; текущий API source — `Vkarich74/totem-p0-api@main` (Feature C11 на production **не развёрнута**).
- Для API нет переменных `US_PAY_C11_LIVE_STRIPE_SECRET_KEY`, `US_PAY_C11_LIVE_OAUTH_CLIENT_ID`, `US_PAY_C11_LIVE_CONNECT_WEBHOOK_SECRET` или LIVE feature gates. Существующая `DATABASE_URL` есть, но **значение закрыто** в OAuth Railway.
- Stripe LIVE `TOTEM USA Connect` `acct_1UcJO2GBhTJXwgwV`: **0 connected accounts**, **0 LIVE webhook endpoints**.
- У платформы ещё не подтверждён LIVE `ca_*` client ID и registered OAuth callback `https://api.totemv.com/stripe/connect/us-pay-c11/live/oauth/callback`.
- Отдельный Railway staging environment `totem-us-staging-isolated`: **0 services**.

## Следующий безопасный release gate

1. Получить актуальную read-only сверку **живой** БД непосредственно перед релизом и **восстановимую data+schema резервную копию**; проверить её сохранность. Старый schema-only snapshot не является backup.
2. Подтвердить реальный Stripe Connect OAuth `ca_*`, зарегистрировать HTTPS callback в LIVE Connect Dashboard и безопасно разместить секреты в Railway без передачи секретов в чат, GitHub, CI или Drive.
3. Сверить все six C11 DDL migrations и подготовить отключённое по умолчанию развёртывание; backend webhook mount + HTTPS endpoint должны реально существовать прежде чем создавать LIVE connected-account webhook в Stripe.
4. Запускать first real owner OAuth/KYC acceptance **только с настоящим американским продавцом** по решению владельца проекта. Не создавать фиктивный US salon/master.

**РЕШЕНИЕ: Production DEPLOY = NO-GO.** В code branch исправлены подтверждённые дефекты контрактов; это не разрешает миграции, создание Stripe LIVE merchant или включение платежей.
