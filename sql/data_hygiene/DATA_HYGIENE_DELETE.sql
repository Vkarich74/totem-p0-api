\set ON_ERROR_STOP on

BEGIN;

\echo '========================================'
\echo 'TOTEM — DATA HYGIENE (DELETE)'
\echo 'NON CORE — CONTROLLED'
\echo '========================================'

\echo ''
\echo '1) Deleting calendar_slots with request_id IS NULL (EXPECTED: 4 rows)'
DELETE FROM calendar_slots
WHERE request_id IS NULL;

\echo ''
\echo '2) Deleting orphan master_salon rows (EXPECTED: 1 row)'
DELETE FROM master_salon
WHERE master_id = 'test-master'
  AND salon_id  = 'test-salon';

\echo ''
\echo 'COMMITTING CHANGES'
COMMIT;

\echo '========================================'
\echo 'DONE — DATA HYGIENE DELETE'
\echo '========================================'
