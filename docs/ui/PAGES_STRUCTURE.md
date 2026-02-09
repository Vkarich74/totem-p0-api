# TOTEM — UI / ODOO Pages Structure (UI-3)

Status: UI Track  
Core: READ ONLY  
Source of truth: Odoo dump (read-only)

---

## PUBLIC
- `/`
- `/contactus`
- `/contactus-thank-you`
- `/privacy`
- `/your-task-has-been-submitted`

## TOTEM (PUBLIC, slug-based)
- `/s/:slug`
- `/s/:slug/booking`
- `/s/:slug/calendar`
- `/s/:slug/reports`
- `/s/:slug/owner`

> UI does not decide access. Backend may return 401/403.

## MASTER (auth required, not published)
- `/masters/cabinet`
- `/masters/schedule`
- `/masters/bookings`
- `/masters/clients`
- `/masters/money`
- `/masters/salons`
- `/masters/settings`

## SALON (auth required, not published)
- `/salons/cabinet`
- `/salons/schedule`
- `/salons/bookings`
- `/salons/clients`
- `/salons/masters`
- `/salons/money`
- `/salons/settings`

---

## Navigation (Odoo Menus)

### Top Menu
- Home → `/`
- Appointment → `/appointment`
- Салоны → `#`
- Мастера → `#`

### TOTEM
- Salon → `/s/:slug`
- Booking → `/s/:slug/booking`
- Calendar → `/s/:slug/calendar`
- Reports → `/s/:slug/reports`
- Owner → `/s/:slug/owner`

---

## Rules
- No business logic in UI
- No role checks in UI
- Backend decides everything
- UI renders status and errors only
