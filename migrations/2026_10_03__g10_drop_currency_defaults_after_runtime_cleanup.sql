BEGIN;

DO $$
DECLARE
  v_table text;
  v_default text;
  v_tables text[] := ARRAY[
    'billing_subscriptions',
    'contract_rent_obligations',
    'contract_rent_payments',
    'contract_salary_obligations',
    'finance_events',
    'money_audit_events',
    'money_ledger_entries',
    'money_owner_balances',
    'money_owner_obligations',
    'money_receipts',
    'money_split_allocations',
    'payment_collection_anchors',
    'payout_executions',
    'provider_events',
    'provider_settlement_items',
    'provider_settlements',
    'withdraw_requests'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    SELECT column_default
      INTO v_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = v_table
      AND column_name = 'currency';

    IF v_default IS NULL OR position('KGS' in v_default) = 0 THEN
      RAISE EXCEPTION 'G10_DEFAULT_PRECONDITION_FAILED table=% default=%', v_table, v_default;
    END IF;

    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN currency DROP DEFAULT',
      v_table
    );
  END LOOP;
END $$;

DO $$
DECLARE
  v_remaining integer;
BEGIN
  SELECT count(*)::int
    INTO v_remaining
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND column_name = 'currency'
    AND table_name = ANY(ARRAY[
      'billing_subscriptions','contract_rent_obligations','contract_rent_payments',
      'contract_salary_obligations','finance_events','money_audit_events',
      'money_ledger_entries','money_owner_balances','money_owner_obligations',
      'money_receipts','money_split_allocations','payment_collection_anchors',
      'payout_executions','provider_events','provider_settlement_items',
      'provider_settlements','withdraw_requests'
    ])
    AND column_default IS NOT NULL;

  IF v_remaining <> 0 THEN
    RAISE EXCEPTION 'G10_DEFAULT_POSTCHECK_FAILED remaining=%', v_remaining;
  END IF;
END $$;

COMMIT;
