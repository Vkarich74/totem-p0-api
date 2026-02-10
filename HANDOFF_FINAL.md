Принял. Ниже — **HANDOFF FINAL — TOTEM (CANON, 1 ФАЙЛ)**.
Это **единственный источник истины**. Копируй **целиком** и используй первым сообщением в новом чате или как `HANDOFF_FINAL.md` в репозитории.

---

# HANDOFF FINAL — TOTEM PLATFORM

**STATUS: RELEASED / CANONICAL**
**Дата:** 2026-02-10

---

## 0️⃣ EXECUTION MODE — ЖЕЛЕЗНЫЕ ПРАВИЛА

❌ Никаких «давай попробуем»
❌ Никаких вариантов
❌ Никаких фрагментов кода

✅ Только команды, которые обязаны сработать
✅ Только полные файлы
✅ Работа удалённо через CMD
✅ Если ошибка — **СТОП** → сбор фактов → копии → потом фиксы
✅ Любые изменения → **commit + deploy**
🔒 Backend **НЕ ТРОГАТЬ** (заморожен)

---

## 1️⃣ АРХИТЕКТУРА (ЗАФИКСИРОВАНО)

* **Backend**: Node.js (Railway) — **SOURCE OF TRUTH**, **FREEZE**
* **Frontend**: Odoo Website (SaaS)
* **Связка**: Backend → Public Pages → Cabinets
* **Routing**: канонический, без динамики в меню

---

## 2️⃣ RESERVED SLUGS CONTRACT (НАВСЕГДА)

### Public (ЕДИНСТВЕННО СЛАГИ)

```
/s/:slug
/s/:slug/booking
/s/:slug/calendar
/s/:slug/owner      (guarded)
/s/:slug/reports    (guarded)
```

### Cabinet (БЕЗ SLUG)

```
/masters/*
/salons/*
```

❌ Никаких `/masters/:slug/*`
❌ Никаких `/salons/:slug/*`

---

## 3️⃣ WEBSITE MENU (ЗАФИКСИРОВАНО)

* Меню **очищено**
* Допустимы **ТОЛЬКО**:

```
Мастера  → /masters/cabinet
Салоны   → /salons/cabinet
Клиенты  → #
```

❌ Без dropdown
❌ Без контейнеров `/masters`, `/salons`
❌ Без `/s/:slug` в меню

---

## 4️⃣ СТРАНИЦЫ (НЕ ТРОГАТЬ)

### Masters

```
/masters/cabinet
/masters/bookings
/masters/clients
/masters/money
/masters/salons
/masters/schedule
/masters/settings
```

### Salons

```
/salons/cabinet
/salons/bookings
/salons/clients
/salons/masters
/salons/money
/salons/schedule
/salons/settings
```

### System

```
/
/contactus
/contactus-thank-you
/privacy
/your-task-has-been-submitted
```

---

## 5️⃣ SECURITY / GUARDS (DONE / FREEZE)

### Cabinet Guards

* Public ❌ `/masters/*`, `/salons/*`
* Master ❌ `/salons/*`
* Salon ❌ `/masters/*`

### Public Flow Guard

* `/s/:slug/booking|calendar`:

  * если resolve/context не пришёл ≤ 5с → redirect на `/s/:slug`
* `/owner`, `/reports` — доступны **только** с токеном

---

## 6️⃣ UI STATUS (ПРИНЯТО)

* Встроенные блоки кабинетов — **основной UI**
* Внешний sidebar — **dev-артефакт**, оставлен осознанно
* CSS-конфликты — **отложены** до финального полиша

---

## 7️⃣ АВТОМАТИЗАЦИЯ / ИНСТАЛЛЕРЫ (КАНОН)

Все изменения в Odoo делались **ТОЛЬКО** через JSON-RPC, **CMD**, идемпотентные installer-скрипты, с бэкапами `before/after`.

### Директории артефактов:

```
C:\Users\Vitaly\Desktop\odoo-local\
 ├─ TOTEM_HANDOFF\
 ├─ TOTEM_GUARDS\
 ├─ TOTEM_UI\
 ├─ TOTEM_PUBLIC_FLOW\
```

---

## 8️⃣ RELEASE CHECK (5 МИН)

* `/masters/cabinet` — OK
* `/salons/cabinet` — OK
* `/s/VALID_SLUG` — OK
* `/s/INVALID_SLUG/booking` — redirect
* `/s/slug/owner` без токена — redirect

➡️ Всё ✔ → релиз валиден.

---

## 9️⃣ RELEASE STATUS

```
TOTEM v1 — ARCHITECTURE STABLE
Frontend: hardened
Routing: canonical
Security: enforced
UI: dev-accepted
```

---

## 🔟 NEXT (НЕ В ЭТОМ РЕЛИЗЕ)

* UI polish (финальное «шаманство»)
* Payments provider
* Reports v2
* Mobile UX

---

**END OF HANDOFF FINAL — CANON**
Использовать как **первый документ** в любом новом чате или как файл в репозитории.
