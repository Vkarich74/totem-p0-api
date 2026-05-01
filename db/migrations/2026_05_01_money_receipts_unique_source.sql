-- Money Core receipt dedupe contract.
-- Applied manually in production via Railway psql on 2026-05-01 before this migration file was added.
-- CONCURRENTLY must run outside transaction blocks.

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS money_receipts_receipt_source_type_uidx
ON public.money_receipts (receipt_type, source_type, source_id);
