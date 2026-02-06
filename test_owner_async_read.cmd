@echo off

curl -i -X GET ^
https://totem-p0-api-production.up.railway.app/owner/async/jobs ^
-H "Authorization: Bearer 9d4170de68a72c9ba805239f09a44bacae1802f29852102e4db50515b521e936"

echo.
echo ===== END =====
pause
