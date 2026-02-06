@echo off

curl -i -X POST ^
https://totem-p0-api-production.up.railway.app/owner/async/backfill ^
-H "Authorization: Bearer 9d4170de68a72c9ba805239f09a44bacae1802f29852102e4db50515b521e936" ^
-H "Content-Type: application/json" ^
-d "{\"job_type\":\"ops_smoke_test\",\"idempotency_key\":\"ops-smoke-001\",\"payload\":{\"salon_slug\":\"totem-demo-salon\",\"note\":\"owner backfill smoke test\"}}"

echo.
echo ===== END =====
pause
