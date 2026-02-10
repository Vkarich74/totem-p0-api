# BOT PILOT HYBRID REPORT v1 — ODOO

Timestamp (UTC): 2026-02-10T21:15:13Z
Base URL: https://totem-platform.odoo.com

## SCOPE (LOCKED)
- Public-only HTTP diagnostics
- No auth, no form submits, no DB writes
- Guards are NOT bypassed

## SUMMARY
- Total checks: 11
- 200/OK: 5
- Redirects: 3
- 401/403 guarded: 0
- 404 not found: 6
- Errors: 0
- Other statuses: 0

## RESULTS (FULL)

### https://totem-platform.odoo.com/
- status: 200
- final_url: https://totem-platform.odoo.com/
- redirected: False
- content_length: 36658

### https://totem-platform.odoo.com/s/
- status: 200
- final_url: https://totem-platform.odoo.com/s
- redirected: True
- content_length: 18126

### https://totem-platform.odoo.com/s/test
- status: 200
- final_url: https://totem-platform.odoo.com/s/test
- redirected: False
- content_length: 18134

### https://totem-platform.odoo.com/s/test/booking
- status: 404
- final_url: https://totem-platform.odoo.com/s/test/booking
- redirected: False
- content_length: 38683

### https://totem-platform.odoo.com/s/test/calendar
- status: 404
- final_url: https://totem-platform.odoo.com/s/test/calendar
- redirected: False
- content_length: 38686

### https://totem-platform.odoo.com/s/test/owner
- status: 404
- final_url: https://totem-platform.odoo.com/s/test/owner
- redirected: False
- content_length: 38677

### https://totem-platform.odoo.com/s/test/reports
- status: 404
- final_url: https://totem-platform.odoo.com/s/test/reports
- redirected: False
- content_length: 38683

### https://totem-platform.odoo.com/masters/cabinet
- status: 200
- final_url: https://totem-platform.odoo.com/masters/cabinet
- redirected: False
- content_length: 39245

### https://totem-platform.odoo.com/salons/cabinet
- status: 200
- final_url: https://totem-platform.odoo.com/salons/cabinet
- redirected: False
- content_length: 39225

### https://totem-platform.odoo.com/masters/
- status: 404
- final_url: https://totem-platform.odoo.com/masters
- redirected: True
- content_length: 38662

### https://totem-platform.odoo.com/salons/
- status: 404
- final_url: https://totem-platform.odoo.com/salons
- redirected: True
- content_length: 38659

## DIAGNOSTIC VERDICT

If most public pages are 404/redirect/empty or guarded incorrectly → site is NOT pilot-ready.
This report is a factual map of accessibility and dead-ends, not UX scoring.

END
