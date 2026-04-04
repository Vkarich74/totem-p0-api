\
@echo off
setlocal

cd /d C:\Work\totem-p0-api

echo [1/4] NODE CHECK
node --check src\services\provision\provisionShared.js || goto :fail
node --check src\services\provision\createSalonCanonical.js || goto :fail
node --check src\services\provision\createMasterCanonical.js || goto :fail
node --check src\services\provision\bindMasterToSalonCanonical.js || goto :fail
node --check src\services\provision\activateMasterSalonCanonical.js || goto :fail
node --check src\services\provision\terminateMasterSalonCanonical.js || goto :fail
node --check src\routes\internal\provision.js || goto :fail
node --check src\routes\internal.js || goto :fail

echo [2/4] ROUTE REGISTRATION
type C:\Work\totem-p0-api\src\routes\internal.js | findstr /i provision || goto :fail

echo [3/4] START SERVER
echo Open another CMD and run:
echo npm run dev
echo.
echo Wait until server boots without import/router errors.
echo.

echo [4/4] SMOKE CURL COMMANDS
echo.
echo --- CREATE SALON ---
echo curl -X POST http://localhost:8080/internal/provision/salons ^
echo   -H "Content-Type: application/json" ^
echo   -H "Authorization: Bearer <TOKEN>" ^
echo   -d "{\"email\":\"salon.test@example.com\",\"name\":\"Owner Test\",\"salon_name\":\"Salon Test\",\"requested_role\":\"salon_admin\"}"
echo.
echo --- CREATE MASTER ---
echo curl -X POST http://localhost:8080/internal/provision/masters ^
echo   -H "Content-Type: application/json" ^
echo   -H "Authorization: Bearer <TOKEN>" ^
echo   -d "{\"email\":\"master.test@example.com\",\"name\":\"Master Test\",\"requested_role\":\"master\",\"password_hash\":\"test_hash\"}"
echo.
echo --- BIND ---
echo curl -X POST http://localhost:8080/internal/provision/bind ^
echo   -H "Content-Type: application/json" ^
echo   -H "Authorization: Bearer <TOKEN>" ^
echo   -d "{\"salon_slug\":\"<SALON_SLUG>\",\"master_slug\":\"<MASTER_SLUG>\",\"bind_mode\":\"pending\",\"create_contract\":false}"
echo.
echo --- ACTIVATE ---
echo curl -X POST http://localhost:8080/internal/provision/bind/activate ^
echo   -H "Content-Type: application/json" ^
echo   -H "Authorization: Bearer <TOKEN>" ^
echo   -d "{\"salon_slug\":\"<SALON_SLUG>\",\"master_slug\":\"<MASTER_SLUG>\"}"
echo.
echo --- TERMINATE ---
echo curl -X POST http://localhost:8080/internal/provision/bind/terminate ^
echo   -H "Content-Type: application/json" ^
echo   -H "Authorization: Bearer <TOKEN>" ^
echo   -d "{\"salon_slug\":\"<SALON_SLUG>\",\"master_slug\":\"<MASTER_SLUG>\"}"
echo.
echo PASS: static checks complete. Continue with server boot + curl calls.
goto :eof

:fail
echo FAIL: smoke precheck stopped.
exit /b 1
