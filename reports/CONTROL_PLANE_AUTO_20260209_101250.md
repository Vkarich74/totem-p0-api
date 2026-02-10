# CONTROL_PLANE AUTO
TS: 20260209_101250
[OK] PRECHECK

$ curl -i https://totem-p0-api-production.up.railway.app/health
HTTP/1.1 200 OK
Content-Length: 11
Content-Type: application/json; charset=utf-8
Date: Mon, 09 Feb 2026 10:12:52 GMT
Etag: W/"b-Ai2R8hgEarLmHKwesT1qcY913ys"
Server: railway-edge
X-Powered-By: Express
X-Railway-Edge: railway/europe-west4-drams3a
X-Railway-Request-Id: pu62DN7PRE-VU4pd5nX1uw

{"ok":true}
  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current
                                 Dload  Upload   Total   Spent    Left  Speed

  0     0    0     0    0     0      0      0 --:--:-- --:--:-- --:--:--     0
100    11  100    11    0     0     11      0  0:00:01 --:--:--  0:00:01    11
100    11  100    11    0     0     11      0  0:00:01 --:--:--  0:00:01    11
[OK] HEALTH

$ C:\Program Files\PostgreSQL\18\bin\psql.exe postgresql://postgres:prZkCbCpYTlLPXPkSprHnliKsXCQjoSU@interchange.proxy.rlwy.net:55042/railway -v ON_ERROR_STOP=1 -c select 1;
 ?column? 
----------
        1
(1 row)
[OK] DB PROBE
[OK] WRITE SQL

$ C:\Program Files\PostgreSQL\18\bin\psql.exe postgresql://postgres:prZkCbCpYTlLPXPkSprHnliKsXCQjoSU@interchange.proxy.rlwy.net:55042/railway -v ON_ERROR_STOP=1 -f C:\Users\Vitaly\Desktop\odoo-local\sql\control_plane.sql
BEGIN
CREATE TABLE
CREATE TABLE
CREATE TABLE
CREATE TABLE
INSERT 0 0
COMMIT
psql:C:/Users/Vitaly/Desktop/odoo-local/sql/control_plane.sql:11: NOTICE:  relation "audit_events" already exists, skipping
psql:C:/Users/Vitaly/Desktop/odoo-local/sql/control_plane.sql:19: NOTICE:  relation "onboarding_state_transitions" already exists, skipping
psql:C:/Users/Vitaly/Desktop/odoo-local/sql/control_plane.sql:26: NOTICE:  relation "permission_snapshots" already exists, skipping
psql:C:/Users/Vitaly/Desktop/odoo-local/sql/control_plane.sql:33: NOTICE:  relation "system_tokens" already exists, skipping
[OK] DB APPLY
[OK] WRITE ROUTER
[OK] PATCH index.js

$ git add sql/control_plane.sql routes/system_onboarding.js index.js
[OK] GIT ADD

$ git commit -m control-plane: final fix
[main 79d7835] control-plane: final fix
 3 files changed, 146 insertions(+)
 create mode 100644 routes/system_onboarding.js
 create mode 100644 sql/control_plane.sql
[OK] GIT COMMIT

$ git push
To https://github.com/Vkarich74/totem-p0-api.git
   bd1b5ae..79d7835  main -> main
[OK] GIT PUSH

$ curl -i https://totem-p0-api-production.up.railway.app/health
HTTP/1.1 200 OK
Content-Length: 11
Content-Type: application/json; charset=utf-8
Date: Mon, 09 Feb 2026 10:13:13 GMT
Etag: W/"b-Ai2R8hgEarLmHKwesT1qcY913ys"
Server: railway-edge
X-Powered-By: Express
X-Railway-Edge: railway/europe-west4-drams3a
X-Railway-Request-Id: tnK7hqd8Sw6HQSLDYqdHTg

{"ok":true}
  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current
                                 Dload  Upload   Total   Spent    Left  Speed

  0     0    0     0    0     0      0      0 --:--:-- --:--:-- --:--:--     0
  0     0    0     0    0     0      0      0 --:--:-- --:--:-- --:--:--     0
100    11  100    11    0     0     12      0 --:--:-- --:--:-- --:--:--    12
[OK] HEALTH

$ curl -i -X POST https://totem-p0-api-production.up.railway.app/system/onboarding/identity -H Content-Type: application/json -H X-System-Token: TECH_SYSTEM_TOKEN_TEMP_2026 -d {"lead_id":"cp-20260209_101250","odoo_user_id":"1","email":"a@a","requested_role":"MASTER"}
HTTP/1.1 200 OK
Content-Length: 60
Content-Type: application/json; charset=utf-8
Date: Mon, 09 Feb 2026 10:13:14 GMT
Etag: W/"3c-2spafpxUhrK7832plRkc8zWiaDY"
Server: railway-edge
X-Powered-By: Express
X-Railway-Edge: railway/europe-west4-drams3a
X-Railway-Request-Id: zRpwtR2ATQmG3_IIYqdHTg

{"core_user_id":2,"granted_role":"MASTER","state":"PENDING"}
  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current
                                 Dload  Upload   Total   Spent    Left  Speed

  0     0    0     0    0     0      0      0 --:--:-- --:--:-- --:--:--     0
  0     0    0     0    0     0      0      0 --:--:-- --:--:-- --:--:--     0
100   151  100    60  100    91     77    117 --:--:-- --:--:-- --:--:--   197
[OK] IDENTITY

$ curl -i -X POST https://totem-p0-api-production.up.railway.app/system/onboarding/state -H Content-Type: application/json -H X-System-Token: TECH_SYSTEM_TOKEN_TEMP_2026 -d {"core_user_id":2,"to_state":"ACTIVE","reason":"ok"}
HTTP/1.1 404 Not Found
Content-Length: 163
Content-Security-Policy: default-src 'none'
Content-Type: text/html; charset=utf-8
Date: Mon, 09 Feb 2026 10:13:15 GMT
Server: railway-edge
X-Content-Type-Options: nosniff
X-Powered-By: Express
X-Railway-Edge: railway/europe-west4-drams3a
X-Railway-Request-Id: 3zXJjt2MRnq2qdljm3z_FQ

<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Error</title>
</head>
<body>
<pre>Cannot POST /system/onboarding/state</pre>
</body>
</html>
  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current
                                 Dload  Upload   Total   Spent    Left  Speed

  0     0    0     0    0     0      0      0 --:--:-- --:--:-- --:--:--     0
  0     0    0     0    0     0      0      0 --:--:-- --:--:-- --:--:--     0
100   215  100   163  100    52    183     58 --:--:-- --:--:-- --:--:--   243
[OK] STATE

$ curl -i -H X-System-Token: TECH_SYSTEM_TOKEN_TEMP_2026 https://totem-p0-api-production.up.railway.app/system/onboarding/audit?lead_id=cp-20260209_101250&limit=10
HTTP/1.1 404 Not Found
Content-Length: 162
Content-Security-Policy: default-src 'none'
Content-Type: text/html; charset=utf-8
Date: Mon, 09 Feb 2026 10:13:16 GMT
Server: railway-edge
X-Content-Type-Options: nosniff
X-Powered-By: Express
X-Railway-Edge: railway/europe-west4-drams3a
X-Railway-Request-Id: zI-3QaLSRcSiA84pm3z_FQ

<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Error</title>
</head>
<body>
<pre>Cannot GET /system/onboarding/audit</pre>
</body>
</html>
  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current
                                 Dload  Upload   Total   Spent    Left  Speed

  0     0    0     0    0     0      0      0 --:--:-- --:--:-- --:--:--     0
  0     0    0     0    0     0      0      0 --:--:-- --:--:-- --:--:--     0
100   162  100   162    0     0    248      0 --:--:-- --:--:-- --:--:--   251
[OK] AUDIT
[OK] REGRESSION
[OK] DONE
REPORT: C:\Users\Vitaly\Desktop\odoo-local\reports\CONTROL_PLANE_AUTO_20260209_101250.md
