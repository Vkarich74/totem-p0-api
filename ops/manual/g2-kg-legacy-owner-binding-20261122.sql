-- TOTEM G2 / KG backwards-compatibility: explicitly convert ONE verified
-- legacy salon_admin principal from auth_users.salon_slug to owner_salon.
-- OPTIONAL/manual migration. Not an automatic startup migration.
-- Preconditions bind exact principal, salon, existing KG market, and role.
-- No changes to ledgers, wallets, bookings, payments, or totem_test.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';
SET LOCAL search_path = pg_catalog, public;
SELECT pg_advisory_xact_lock(724006, 20261122);
DO $g2$
DECLARE
    eligible_count integer;
    existing_count integer;
    correct_count integer;
BEGIN
    SELECT COUNT(*) INTO eligible_count
    FROM public.auth_users u
    JOIN public.salons s ON s.id = 1
    JOIN public.tenant_market_settings t ON t.salon_id = s.id
    JOIN public.markets mk ON mk.id = t.market_id
    WHERE u.id = 8
      AND u.enabled IS TRUE AND u.role = 'salon_admin'
      AND u.salon_slug = 'totem-demo-salon'
      AND u.salon_id IS NULL
      AND s.slug = 'totem-demo-salon'
      AND s.enabled IS TRUE AND s.status = 'active'
      AND mk.code = 'KG';
    IF eligible_count <> 1 THEN
        RAISE EXCEPTION 'STOP_KG_LEGACY_OWNER_CONTRACT: eligibility=%, expected=1', eligible_count;
    END IF;

    SELECT COUNT(*) INTO existing_count
    FROM public.owner_salon WHERE owner_id = '8';
    IF existing_count > 1 THEN
        RAISE EXCEPTION 'STOP_KG_LEGACY_OWNER_CONTRACT: ambiguous existing grants=%', existing_count;
    END IF;

    IF existing_count = 0 THEN
        INSERT INTO public.owner_salon(owner_id, salon_id, status)
        VALUES ('8', 1, 'active');
    END IF;

    SELECT COUNT(*) INTO correct_count
    FROM public.owner_salon
    WHERE owner_id = '8' AND salon_id = 1 AND status = 'active';
    IF correct_count <> 1 THEN
        RAISE EXCEPTION 'STOP_KG_LEGACY_OWNER_CONTRACT: missing/invalid active direct grant';
    END IF;
    SELECT COUNT(*) INTO existing_count
    FROM public.owner_salon WHERE owner_id = '8';
    IF existing_count <> 1 THEN
        RAISE EXCEPTION 'STOP_KG_LEGACY_OWNER_CONTRACT: unexpected cross-salon grant count=%', existing_count;
    END IF;
END
$g2$;
COMMIT;
SELECT 'G2_KG_LEGACY_OWNER_8_SALON_1=PASS' AS status,
       COUNT(*) AS direct_active_grants
FROM public.owner_salon
WHERE owner_id='8' AND salon_id=1 AND status='active';
