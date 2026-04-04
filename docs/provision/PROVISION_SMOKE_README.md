# PROVISION SMOKE PACKAGE

Files:
- PROVISION_SMOKE_COMMANDS.bat
- PROVISION_SMOKE_DB_CHECKS.sql

Order:
1. Run PROVISION_SMOKE_COMMANDS.bat
2. Start server manually with `npm run dev`
3. Run the printed curl commands
4. Replace placeholders in PROVISION_SMOKE_DB_CHECKS.sql
5. Run SQL checks in psql

PASS when:
- node --check passes
- internal.js still shows provision router registration
- server boots without import/router errors
- all five endpoints respond as expected
- DB rows exist and match the created entities
