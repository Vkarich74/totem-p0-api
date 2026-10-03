BEGIN;

DO $$
DECLARE
  v_kg_market_id bigint;
  v_provider_count integer;
  v_bad_phone_count integer;
BEGIN
  SELECT id INTO v_kg_market_id
  FROM public.markets
  WHERE code = 'KG' AND active = true;

  IF v_kg_market_id IS NULL THEN
    RAISE EXCEPTION 'G10_KG_MARKET_NOT_FOUND';
  END IF;

  SELECT count(*)::int INTO v_provider_count
  FROM public.destination_providers
  WHERE country = 'KG';

  IF v_provider_count <> 4 THEN
    RAISE EXCEPTION 'G10_KG_DESTINATION_PROVIDER_COUNT_%', v_provider_count;
  END IF;

  SELECT count(*)::int INTO v_bad_phone_count
  FROM public.auth_users
  WHERE phone IS NOT NULL
    AND phone !~ '^\+[1-9][0-9]{7,14}$';

  IF v_bad_phone_count <> 0 THEN
    RAISE EXCEPTION 'G10_AUTH_PHONE_NOT_E164_%', v_bad_phone_count;
  END IF;
END $$;

INSERT INTO public.market_provider_bindings (
  market_id, provider_type, provider_code, enabled,
  priority, profile_code, config_json
)
SELECT
  m.id,
  'payout',
  dp.code,
  dp.enabled,
  100,
  NULL,
  jsonb_build_object(
    'source', 'destination_providers',
    'country_code', dp.country
  )
FROM public.markets m
JOIN public.destination_providers dp ON dp.country = m.country_code
WHERE m.code = 'KG'
ON CONFLICT (market_id, provider_type, provider_code) DO NOTHING;

DO $$
DECLARE v_bound integer;
BEGIN
  SELECT count(*)::int INTO v_bound
  FROM public.market_provider_bindings mpb
  JOIN public.markets m ON m.id = mpb.market_id
  JOIN public.destination_providers dp ON dp.code = mpb.provider_code
  WHERE m.code = 'KG'
    AND mpb.provider_type = 'payout'
    AND dp.country = 'KG';

  IF v_bound <> 4 THEN
    RAISE EXCEPTION 'G10_KG_PROVIDER_BINDINGS_%', v_bound;
  END IF;
END $$;

ALTER TABLE public.auth_users
  DROP CONSTRAINT IF EXISTS auth_users_phone_canonical_check;
ALTER TABLE public.auth_users
  ADD CONSTRAINT auth_users_phone_canonical_check
  CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{7,14}$');

ALTER TABLE public.destination_providers
  DROP CONSTRAINT IF EXISTS destination_providers_country_check;
ALTER TABLE public.destination_providers
  ADD CONSTRAINT destination_providers_country_check
  CHECK (country ~ '^[A-Z]{2}$');
ALTER TABLE public.destination_providers
  ALTER COLUMN country DROP DEFAULT;

DO $$
DECLARE
  v_table text;
  v_tables text[] := ARRAY[
    'money_audit_events',
    'money_ledger_entries',
    'money_owner_balances',
    'money_receipts',
    'money_split_allocations',
    'payout_executions',
    'provider_events',
    'provider_settlement_items',
    'provider_settlements',
    'withdraw_requests'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    EXECUTE format(
      'ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I',
      v_table,
      v_table || '_currency_check'
    );
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (currency ~ ''^[A-Z]{3}$'')',
      v_table,
      v_table || '_currency_check'
    );
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.create_refund_on_booking_cancel()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_payment_id integer;
  v_amount integer;
  v_currency text;
  v_refund_id uuid;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF NEW.status <> 'canceled' OR OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT p.id, p.amount, COALESCE(p.currency_code, NEW.currency_code)
    INTO v_payment_id, v_amount, v_currency
  FROM public.payments p
  WHERE p.booking_id = NEW.id
    AND p.status = 'confirmed'
    AND p.is_active = true
  LIMIT 1;

  IF v_payment_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_currency := upper(trim(v_currency));
  IF v_currency IS NULL OR v_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'REFUND_CURRENCY_REQUIRED';
  END IF;

  v_refund_id := gen_random_uuid();

  INSERT INTO public.payment_refunds (
    id,
    intent_id,
    payment_id,
    booking_id,
    amount,
    status,
    created_at,
    currency_code
  )
  VALUES (
    v_refund_id,
    gen_random_uuid(),
    v_payment_id,
    NEW.id,
    v_amount,
    'requested',
    now(),
    v_currency
  )
  ON CONFLICT (payment_id) DO NOTHING;

  SELECT r.id INTO v_refund_id
  FROM public.payment_refunds r
  WHERE r.payment_id = v_payment_id
  LIMIT 1;

  INSERT INTO public.finance_events (
    salon_id,
    master_id,
    type,
    status,
    amount,
    currency,
    created_at,
    refund_id
  )
  VALUES (
    NEW.salon_id::text,
    NEW.master_id::text,
    'refund',
    'pending',
    v_amount,
    v_currency,
    now(),
    v_refund_id
  )
  ON CONFLICT (refund_id) DO NOTHING;

  RETURN NEW;
END;
$function$;

DO $$
DECLARE
  v_bad_currency integer;
  v_bad_phone integer;
BEGIN
  SELECT count(*)::int INTO v_bad_phone
  FROM public.auth_users
  WHERE phone IS NOT NULL
    AND phone !~ '^\+[1-9][0-9]{7,14}$';

  IF v_bad_phone <> 0 THEN
    RAISE EXCEPTION 'G10_POST_AUTH_PHONE_NOT_E164_%', v_bad_phone;
  END IF;

  SELECT count(*)::int INTO v_bad_currency
  FROM (
    SELECT currency FROM public.money_audit_events
    UNION ALL SELECT currency FROM public.money_ledger_entries
    UNION ALL SELECT currency FROM public.money_owner_balances
    UNION ALL SELECT currency FROM public.money_receipts
    UNION ALL SELECT currency FROM public.money_split_allocations
    UNION ALL SELECT currency FROM public.payout_executions
    UNION ALL SELECT currency FROM public.provider_events
    UNION ALL SELECT currency FROM public.provider_settlement_items
    UNION ALL SELECT currency FROM public.provider_settlements
    UNION ALL SELECT currency FROM public.withdraw_requests
  ) x
  WHERE currency !~ '^[A-Z]{3}$';

  IF v_bad_currency <> 0 THEN
    RAISE EXCEPTION 'G10_POST_BAD_CURRENCY_%', v_bad_currency;
  END IF;
END $$;

COMMIT;
