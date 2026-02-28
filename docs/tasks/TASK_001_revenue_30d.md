\# TASK\_001 — revenue\_last\_30\_days



\## 1. Цель

Добавить revenue за последние 30 дней в public metrics.



\## 2. Backend

\- Файл: src/app.js

\- Endpoint: GET /public/salons/:slug/metrics

\- Добавить:

&nbsp; revenue\_30d



SQL:



SELECT COALESCE(SUM(p.amount), 0)

FROM payments p

JOIN bookings b ON b.id = p.booking\_id

WHERE b.salon\_id = $1

AND p.status = 'confirmed'

AND p.is\_active = true

AND p.created\_at >= NOW() - INTERVAL '30 days';



\## 3. SDK

\- src/main.jsx

\- Добавить карточку:

&nbsp; "Revenue 30d"



\## 4. Validation



curl https://api.totemv.com/public/salons/totem-demo-salon/metrics



Expected JSON:



{

&nbsp; revenue\_total,

&nbsp; revenue\_30d

}



\## 5. Commit



Stage 17: add 30d revenue metric



\## 6. Result



UI показывает 4 карточки:

\- Bookings

\- Revenue

\- Revenue 30d

\- Avg check

