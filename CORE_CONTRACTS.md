# TOTEM — CORE CONTRACTS v1

Status: ACTIVE
Scope: PROD
Source of truth: Backend API

---

## 1. API LAYERS

### 1.1 PUBLIC API
Доступен из:
- Widget
- Web
- Zoho Sites
- SDK

Назначение:
- создание брони
- инициация платежа

Разрешённые endpoints:
- POST /public/bookings
- POST /public/payments/intent

Гарантии:
- идемпотентность по request_id
- отсутствие финансовых мутаций без system слоя

---

### 1.2 SYSTEM API
Доступен ТОЛЬКО:
- backend
- cron
- ops
- trusted services

Назначение:
- подтверждение платежей
- settlement
- ops отчёты

Разрешённые endpoints:
- POST /payments/webhook
- POST /system/payouts/:id/settle
- GET  /system/ops/export/payouts

Запрещено:
- вызывать из браузера
- вызывать из Zoho

---

### 1.3 MARKETPLACE API
Назначение:
- расчёт выплат
- группировка бронирований

Разрешённые endpoints:
- POST /marketplace/payouts/create

---

## 2. MONEY FLOW (INVARIANTS)

- деньги всегда инициируются через PUBLIC
- деньги всегда подтверждаются через SYSTEM
- payout возможен ТОЛЬКО после confirmed payment
- ops export отражает только settled данные
- frontend НИКОГДА не знает payout_id

---

## 3. SECURITY BASELINE (v1)

- PUBLIC: без токена (временно)
- SYSTEM: trusted-only
- MARKETPLACE: internal-only

---

## 4. VERSIONING RULE

Любое изменение:
- payload
- статусов
- money flow

→ требует новой версии контракта.

v1 считается ЗАМОРОЖЕННЫМ.
