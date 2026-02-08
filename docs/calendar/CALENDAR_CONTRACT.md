# TOTEM — CALENDAR v1 API CONTRACT
# STATUS: FROZEN

## SCOPE
Этот документ фиксирует контракт CALENDAR v1.
Любые изменения допустимы ТОЛЬКО через новый контракт (v2+).
Код CALENDAR v1 считается корректным и не пересматривается.

---

## GLOBAL INVARIANTS

1. Один мастер не может иметь более одного активного слота в один момент времени.
2. Пересечения по времени запрещены на уровне БД.
3. Все операции резервирования идемпотентны по `request_id`.
4. `salon_id` обязателен всегда.
5. Повторный запрос с тем же `request_id` возвращает тот же результат.
6. Конфликт времени → `CALENDAR_CONFLICT`.
7. CALENDAR v1 не зависит от booking, UI, payment.

---

## ENTITY: calendar_slots

- id (uuid)
- master_id (uuid) — REQUIRED
- salon_id (uuid) — REQUIRED
- start_at (timestamptz) — REQUIRED
- end_at (timestamptz) — REQUIRED
- status (enum)
- request_id (text) — REQUIRED, UNIQUE
- created_at (timestamptz)

Гарантии:
- exclusion constraint по времени
- невозможны пересечения

---

## API

### POST /calendar/reserve

REQUEST (JSON):
- master_id (uuid)
- salon_id (uuid)
- start_at (ISO 8601)
- end_at (ISO 8601)
- request_id (string)

REQUIREMENTS:
- salon_id ОБЯЗАТЕЛЕН
- request_id ОБЯЗАТЕЛЕН
- start_at < end_at

SUCCESS (200):
{
  "ok": true,
  "calendar_slot": {
    "id": "uuid",
    "master_id": "uuid",
    "salon_id": "uuid",
    "start_at": "ISO",
    "end_at": "ISO",
    "status": "reserved"
  }
}

ERRORS:

409 CALENDAR_CONFLICT
{
  "ok": false,
  "error": "CALENDAR_CONFLICT"
}

400 VALIDATION_ERROR
{
  "ok": false,
  "error": "VALIDATION_ERROR"
}

---

### GET /calendar/master/:master_id

QUERY:
- salon_id (optional)

BEHAVIOR:
- без salon_id → все слоты мастера
- с salon_id → только слоты салона

SUCCESS (200):
{
  "ok": true,
  "slots": []
}

---

## FORBIDDEN

- бронь без salon_id
- бронь без request_id
- пересечения
- изменение поведения без нового контракта

---

## VERSIONING
CALENDAR v1 — FROZEN  
Изменения → новый контракт (v2)

Дата фиксации: 2026-02-09
