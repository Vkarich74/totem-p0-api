\set ON_ERROR_STOP on

\echo '========================================'
\echo 'TOTEM — DATA HYGIENE (PREVIEW ONLY)'
\echo 'NO CHANGES WILL BE MADE'
\echo '========================================'

\echo ''
\echo '1) calendar_slots with request_id IS NULL (EXPECTED: 4 rows)'
SELECT id, master_id, salon_id, start_at, end_at, status, request_id
FROM calendar_slots
WHERE request_id IS NULL
ORDER BY start_at;

\echo ''
\echo '2) master_salon orphan rows (EXPECTED: 1 row)'
SELECT ms.master_id, ms.salon_id
FROM master_salon ms
LEFT JOIN masters m ON m.id::text = ms.master_id::text
WHERE m.id IS NULL
ORDER BY ms.master_id, ms.salon_id;

\echo ''
\echo 'END — PREVIEW ONLY (NO DELETE)'
