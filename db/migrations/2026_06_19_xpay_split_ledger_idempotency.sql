CREATE UNIQUE INDEX IF NOT EXISTS ux_money_ledger_xpay_split_allocation
ON public.money_ledger_entries (
  source_type,
  source_id,
  owner_type,
  owner_id,
  money_zone,
  direction
)
WHERE source_type = 'xpay_split_allocation';
