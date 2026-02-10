# TOTEM CONTROL_PLANE AUTO
TS: 20260209_100953
REPORT: C:\Users\Vitaly\Desktop\odoo-local\reports\CONTROL_PLANE_AUTO_20260209_100953.md
[OK] PRECHECK: paths

$ curl -i https://totem-p0-api-production.up.railway.app/health
HTTP/1.1 200 OK
Content-Length: 11
Content-Type: application/json; charset=utf-8
Date: Mon, 09 Feb 2026 10:09:56 GMT
Etag: W/"b-Ai2R8hgEarLmHKwesT1qcY913ys"
Server: railway-edge
X-Powered-By: Express
X-Railway-Edge: railway/europe-west4-drams3a
X-Railway-Request-Id: 3VBdchFTRGyE8z735nX1uw

{"ok":true}
  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current
                                 Dload  Upload   Total   Spent    Left  Speed

  0     0    0     0    0     0      0      0 --:--:-- --:--:-- --:--:--     0
  0     0    0     0    0     0      0      0 --:--:-- --:--:-- --:--:--     0
100    11  100    11    0     0     10      0  0:00:01  0:00:01 --:--:--    10
100    11  100    11    0     0     10      0  0:00:01  0:00:01 --:--:--    10
[OK] HEALTH
[OK] HEALTH: 200

$ C:\Program Files\PostgreSQL\18\bin\psql.exe postgresql://postgres:prZkCbCpYTlLPXPkSprHnliKsXCQjoSU@interchange.proxy.rlwy.net:55042/railway -v ON_ERROR_STOP=1 -c select 1 as ok;
 ok 
----
  1
(1 row)
[OK] DB PROBE
[OK] WRITE: sql/control_plane.sql

$ C:\Program Files\PostgreSQL\18\bin\psql.exe postgresql://postgres:prZkCbCpYTlLPXPkSprHnliKsXCQjoSU@interchange.proxy.rlwy.net:55042/railway -v ON_ERROR_STOP=1 -f C:\Users\Vitaly\Desktop\odoo-local\sql\control_plane.sql
BEGIN
CREATE TABLE
CREATE TABLE
CREATE TABLE
CREATE TABLE
INSERT 0 1
COMMIT
[OK] DB APPLY
[FAIL] FATAL
ERROR: name 'args' is not defined
REPORT: C:\Users\Vitaly\Desktop\odoo-local\reports\CONTROL_PLANE_AUTO_20260209_100953.md
