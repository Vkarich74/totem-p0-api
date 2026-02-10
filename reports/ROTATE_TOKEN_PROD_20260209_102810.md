# ROTATE TOKEN PROD — AUTO
TS: 20260209_102810

$ curl -i https://totem-p0-api-production.up.railway.app/health
HTTP/1.1 200 OK
Content-Length: 11
Content-Type: application/json; charset=utf-8
Date: Mon, 09 Feb 2026 10:28:12 GMT
Etag: W/"b-Ai2R8hgEarLmHKwesT1qcY913ys"
Server: railway-edge
X-Powered-By: Express
X-Railway-Edge: railway/europe-west4-drams3a
X-Railway-Request-Id: YjEumDqhRkiY9kyDN8N_Fg

{"ok":true}
  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current
                                 Dload  Upload   Total   Spent    Left  Speed

  0     0    0     0    0     0      0      0 --:--:-- --:--:-- --:--:--     0
  0     0    0     0    0     0      0      0 --:--:-- --:--:-- --:--:--     0
100    11  100    11    0     0     11      0  0:00:01 --:--:--  0:00:01    11
[OK] HEALTH

$ curl -i -X POST https://totem-p0-api-production.up.railway.app/system/onboarding/token/rotate -H X-System-Token: TECH_SYSTEM_TOKEN_TEMP_2026
HTTP/1.1 200 OK
Content-Length: 74
Content-Type: application/json; charset=utf-8
Date: Mon, 09 Feb 2026 10:28:13 GMT
Etag: W/"4a-i6hGED+mjJ1AB0JdvhF2x4FMDZU"
Server: railway-edge
X-Powered-By: Express
X-Railway-Edge: railway/europe-west4-drams3a
X-Railway-Request-Id: i7fzZldiSCiDGS9hjUJq2g

{"ok":true,"new_token":"d21bb8242efa08fc3ae8911cff543c93a58aa2b09ce0178f"}
  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current
                                 Dload  Upload   Total   Spent    Left  Speed

  0     0    0     0    0     0      0      0 --:--:-- --:--:-- --:--:--     0
100    74  100    74    0     0     85      0 --:--:-- --:--:-- --:--:--    86
100    74  100    74    0     0     85      0 --:--:-- --:--:-- --:--:--    85
[OK] ROTATE TOKEN
[OK] NEW TOKEN ISSUED
NEW_TOKEN (SAVE SECURELY):
d21bb8242efa08fc3ae8911cff543c93a58aa2b09ce0178f

$ curl -i -X POST https://totem-p0-api-production.up.railway.app/system/onboarding/identity -H Content-Type: application/json -H X-System-Token: TECH_SYSTEM_TOKEN_TEMP_2026 -d {"lead_id":"revoke-check","odoo_user_id":"0","email":"x@x","requested_role":"MASTER"}
HTTP/1.1 401 Unauthorized
Content-Length: 24
Content-Type: application/json; charset=utf-8
Date: Mon, 09 Feb 2026 10:28:16 GMT
Etag: W/"18-gH7/fIZxPCVRh6TuPVNAgHt/40I"
Server: railway-edge
X-Powered-By: Express
X-Railway-Edge: railway/europe-west4-drams3a
X-Railway-Request-Id: SfTpz5dbSpiKlRLsm3z_FQ

{"error":"unauthorized"}
  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current
                                 Dload  Upload   Total   Spent    Left  Speed

  0     0    0     0    0     0      0      0 --:--:-- --:--:-- --:--:--     0
100   109  100    24  100    85     26     92 --:--:-- --:--:-- --:--:--   119
100   109  100    24  100    85     26     92 --:--:-- --:--:-- --:--:--   119
[OK] VERIFY OLD TOKEN REVOKED
[OK] OLD TOKEN REVOKED

$ curl -i -X POST https://totem-p0-api-production.up.railway.app/system/onboarding/identity -H Content-Type: application/json -H X-System-Token: d21bb8242efa08fc3ae8911cff543c93a58aa2b09ce0178f -d {"lead_id":"prod-20260209_102810","odoo_user_id":"1","email":"a@a","requested_role":"MASTER"}
HTTP/1.1 200 OK
Content-Length: 60
Content-Type: application/json; charset=utf-8
Date: Mon, 09 Feb 2026 10:28:17 GMT
Etag: W/"3c-fVZDxVqAjjBnQ9d4cwHhcddcDYU"
Server: railway-edge
X-Powered-By: Express
X-Railway-Edge: railway/europe-west4-drams3a
X-Railway-Request-Id: I1atYTqSTkmTAIpCm3z_FQ

{"core_user_id":3,"granted_role":"MASTER","state":"PENDING"}
  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current
                                 Dload  Upload   Total   Spent    Left  Speed

  0     0    0     0    0     0      0      0 --:--:-- --:--:-- --:--:--     0
100   153  100    60  100    93     94    146 --:--:-- --:--:-- --:--:--   242
100   153  100    60  100    93     94    145 --:--:-- --:--:-- --:--:--   242
[OK] VERIFY NEW TOKEN ACTIVE
[OK] NEW TOKEN VERIFIED
[OK] ROTATE_TOKEN_PROD DONE
REPORT: C:\Users\Vitaly\Desktop\odoo-local\reports\ROTATE_TOKEN_PROD_20260209_102810.md
