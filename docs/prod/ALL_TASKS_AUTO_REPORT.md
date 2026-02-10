# ALL TASKS AUTO REPORT

UTC: 2026-02-10T22:29:07Z

## APPLY
- uid=2
- STUB /s/test (view.updated,page.updated)
- STUB /s/test/booking (view.updated,page.updated)
- STUB /s/test/calendar (view.updated,page.updated)
- REDIRECT /s/test/owner (view.updated,page.updated)
- REDIRECT /s/test/reports (view.updated,page.updated)
- REDIRECT /masters/cabinet (view.updated,page.updated)
- REDIRECT /salons/cabinet (view.updated,page.updated)
- DEMO /demo (view.updated,page.updated)
- DEMO /demo/s/test (view.updated,page.updated)
- DEMO /demo/s/test/booking (view.created,page.updated)
- DEMO /demo/s/test/calendar (view.created,page.updated)
- CTA /waitlist (view.updated,page.updated)
- ENTRY /start (view.updated,page.updated)

## VERIFY
- / -> 200 (https://totem-platform.odoo.com/)
- /start -> 200 (https://totem-platform.odoo.com/start)
- /waitlist -> 200 (https://totem-platform.odoo.com/waitlist)
- /demo -> 200 (https://totem-platform.odoo.com/demo)
- /demo/s/test -> 200 (https://totem-platform.odoo.com/demo/s/test)
- /demo/s/test/booking -> 200 (https://totem-platform.odoo.com/demo/s/test/booking)
- /demo/s/test/calendar -> 200 (https://totem-platform.odoo.com/demo/s/test/calendar)

END
