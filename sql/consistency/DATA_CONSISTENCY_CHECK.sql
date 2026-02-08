\set ON_ERROR_STOP on

\echo '========================================'
\echo 'TOTEM — DATA CONSISTENCY CHECK (READ-ONLY)'
\echo '========================================'

SELECT now() AS check_ran_at;

\echo ''
\echo '--- REQUIRED TABLES (presence check) ---'
SELECT
  to_regclass('public.calendar_slots') AS calendar_slots,
  to_regclass('public.masters')        AS masters,
  to_regclass('public.owner_salon')    AS owner_salon,
  to_regclass('public.master_salon')   AS master_salon;

\echo ''
\echo '========================================'
\echo 'A) CALENDAR_SLOTS — BASIC INTEGRITY'
\echo '========================================'

\echo ''
\echo 'A1) calendar_slots: NULL critical fields (should be 0 rows)'
SELECT id, master_id, salon_id, start_at, end_at, status, request_id
FROM calendar_slots
WHERE master_id IS NULL
   OR salon_id  IS NULL
   OR start_at  IS NULL
   OR end_at    IS NULL
   OR request_id IS NULL
ORDER BY id
LIMIT 200;

\echo ''
\echo 'A2) calendar_slots: end_at <= start_at (should be 0 rows)'
SELECT id, master_id, salon_id, start_at, end_at, status, request_id
FROM calendar_slots
WHERE end_at <= start_at
ORDER BY id
LIMIT 200;

\echo ''
\echo 'A3) calendar_slots: duplicate request_id (should be 0 rows)'
SELECT request_id, COUNT(*) AS cnt
FROM calendar_slots
GROUP BY request_id
HAVING COUNT(*) > 1
ORDER BY cnt DESC, request_id
LIMIT 200;

\echo ''
\echo 'A4) calendar_slots: orphan master_id -> masters.id missing (should be 0 rows)'
SELECT cs.id, cs.master_id, cs.salon_id, cs.start_at, cs.end_at, cs.status, cs.request_id
FROM calendar_slots cs
LEFT JOIN masters m ON m.id = cs.master_id
WHERE m.id IS NULL
ORDER BY cs.id
LIMIT 200;

\echo ''
\echo 'A5) calendar_slots: overlap check (should be 0 rows)'
SELECT
  a.id AS slot_a_id,
  b.id AS slot_b_id,
  a.master_id,
  a.salon_id,
  a.start_at AS a_start,
  a.end_at   AS a_end,
  b.start_at AS b_start,
  b.end_at   AS b_end
FROM calendar_slots a
JOIN calendar_slots b
  ON a.id < b.id
 AND a.master_id = b.master_id
 AND a.salon_id  = b.salon_id
WHERE a.start_at < b.end_at
  AND b.start_at < a.end_at
ORDER BY a.master_id, a.salon_id, a.start_at
LIMIT 200;

\echo ''
\echo 'A6) calendar_slots: salon_id not linked in owner_salon/master_salon'
SELECT DISTINCT cs.salon_id
FROM calendar_slots cs
LEFT JOIN (
  SELECT salon_id::text AS salon_id FROM owner_salon
  UNION
  SELECT salon_id::text AS salon_id FROM master_salon
) ms ON ms.salon_id = cs.salon_id::text
WHERE ms.salon_id IS NULL
ORDER BY cs.salon_id
LIMIT 200;

\echo ''
\echo '========================================'
\echo 'B) OWNER_SALON / MASTER_SALON — CONSISTENCY'
\echo '========================================'

\echo ''
\echo 'B1) owner_salon: duplicates (should be 0 rows)'
SELECT owner_id, salon_id, COUNT(*) AS cnt
FROM owner_salon
GROUP BY owner_id, salon_id
HAVING COUNT(*) > 1
ORDER BY cnt DESC, owner_id, salon_id
LIMIT 200;

\echo ''
\echo 'B2) master_salon: duplicates (should be 0 rows)'
SELECT master_id, salon_id, COUNT(*) AS cnt
FROM master_salon
GROUP BY master_id, salon_id
HAVING COUNT(*) > 1
ORDER BY cnt DESC, master_id, salon_id
LIMIT 200;

\echo ''
\echo 'B3) master_salon: orphan master_id -> masters.id missing (should be 0 rows)'
SELECT ms.master_id, ms.salon_id
FROM master_salon ms
LEFT JOIN masters m ON m.id::text = ms.master_id::text
WHERE m.id IS NULL
ORDER BY ms.master_id, ms.salon_id
LIMIT 200;

\echo ''
\echo '========================================'
\echo 'END — DATA CONSISTENCY CHECK'
\echo '========================================'
