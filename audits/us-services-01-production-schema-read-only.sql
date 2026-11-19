-- TOTEM USA | US-SERVICES-01 | Production PostgreSQL preflight
-- Contract: read only. No table scans outside the single US market row count.
-- No IDs, clients, emails, payments, bookings or credentials are returned.
-- Run with a PostgreSQL account authorized to read public catalog metadata.
-- A PASS here verifies structural prerequisites, not functional production E2E.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '8s';
SET LOCAL lock_timeout = '1500ms';

WITH
expected_columns(table_name,column_name,kind) AS (
 VALUES
 ('salons','id','integer'),('salons','slug','string'),
 ('salons','enabled','boolean'),('salons','status','string'),
 ('masters','id','integer'),('masters','slug','string'),
 ('masters','user_id','integer'),('masters','active','boolean'),
 ('owner_salon','salon_id','integer'),('owner_salon','owner_id','string'),
 ('owner_salon','status','string'),
 ('master_salon','salon_id','integer'),('master_salon','master_id','integer'),
 ('master_salon','status','string'),
 ('auth_users','id','integer'),('auth_users','role','string'),
 ('auth_users','enabled','boolean'),
 ('auth_sessions','id','session'),('auth_sessions','user_id','integer'),
 ('auth_sessions','expires_at','timestamp'),
 ('auth_sessions','last_seen_at','timestamp'),
 ('auth_sessions','revoked_at','timestamp'),
 ('tenant_market_settings','salon_id','integer'),
 ('tenant_market_settings','market_id','integer'),
 ('markets','id','integer'),('markets','code','string'),
 ('markets','country_code','string'),('markets','active','boolean'),
 ('markets','default_currency','string'),
 ('billing_subscriptions','owner_type','string'),
 ('billing_subscriptions','owner_id','id'),
 ('billing_subscriptions','subscription_status','string'),
 ('billing_subscriptions','blocked_at','timestamp'),
 ('billing_subscriptions','next_charge_at','timestamp'),
 ('billing_subscriptions','grace_until','timestamp'),
 ('services','id','integer'),('services','service_id','string'),
 ('services','name','string'),('services','duration_min','integer'),
 ('services','price','integer'),
 ('salon_master_services','id','integer'),
 ('salon_master_services','salon_id','integer'),
 ('salon_master_services','master_id','integer'),
 ('salon_master_services','service_pk','integer'),
 ('salon_master_services','price','integer'),
 ('salon_master_services','duration_min','integer'),
 ('salon_master_services','active','boolean'),
 ('salon_master_services','currency_code','string'),
 ('us_service_price_amounts','salon_master_service_id','integer'),
 ('us_service_price_amounts','market_id','integer'),
 ('us_service_price_amounts','amount_minor','integer'),
 ('us_service_price_amounts','currency_code','string'),
 ('us_service_price_amounts','price_version','integer')
),
actual_columns AS (
 SELECT c.table_name,c.column_name,c.udt_name,
        c.is_nullable,c.column_default
 FROM information_schema.columns c
 WHERE c.table_schema='public'
),
column_status AS (
 SELECT 'COLUMN'::text AS check_group,
        ('public.'||e.table_name||'.'||e.column_name)::text AS check_name,
        CASE
          WHEN a.column_name IS NULL THEN 'BLOCK'
          WHEN e.kind='integer' AND a.udt_name NOT IN ('int2','int4','int8','numeric')
            THEN 'BLOCK'
          WHEN e.kind='string' AND a.udt_name NOT IN ('text','varchar','bpchar','citext')
            THEN 'BLOCK'
          WHEN e.kind='boolean' AND a.udt_name<>'bool' THEN 'BLOCK'
          WHEN e.kind='session' AND a.udt_name NOT IN ('text','varchar','uuid')
            THEN 'BLOCK'
          WHEN e.kind='timestamp' AND a.udt_name NOT IN ('timestamp','timestamptz')
            THEN 'BLOCK'
          WHEN e.kind='id' AND a.udt_name NOT IN ('int2','int4','int8','numeric','text','varchar')
            THEN 'BLOCK'
          ELSE 'PASS'
        END AS result,
        COALESCE(a.udt_name,'MISSING')::text AS evidence
 FROM expected_columns e
 LEFT JOIN actual_columns a
 ON a.table_name=e.table_name AND a.column_name=e.column_name
),
index_requirements(check_name,table_name,index_pattern) AS (
 VALUES
 ('salon-master-service exact unique','salon_master_services','(salon_id, master_id, service_pk)'),
 ('US price per link primary unique','us_service_price_amounts','(salon_master_service_id)'),
 ('service catalog code unique','services','(service_id)')
),
index_status AS (
 SELECT 'INDEX'::text AS check_group,r.check_name::text,
        CASE WHEN EXISTS (
          SELECT 1 FROM pg_catalog.pg_class tab
          JOIN pg_catalog.pg_namespace ns ON ns.oid=tab.relnamespace
          JOIN pg_catalog.pg_index ix ON ix.indrelid=tab.oid
          WHERE ns.nspname='public' AND tab.relname=r.table_name
            AND ix.indisunique IS TRUE
            AND position(r.index_pattern IN
                 pg_catalog.pg_get_indexdef(ix.indexrelid))>0
        ) THEN 'PASS' ELSE 'BLOCK' END AS result,
        'requires unfiltered unique index (named columns)'::text AS evidence
 FROM index_requirements r
),
required_fks(check_name,table_name,ref_table) AS (
 VALUES
 ('service link->salon','salon_master_services','salons'),
 ('service link->master','salon_master_services','masters'),
 ('service link->catalog','salon_master_services','services'),
 ('price->service link','us_service_price_amounts','salon_master_services'),
 ('price->market','us_service_price_amounts','markets')
),
fk_status AS (
 SELECT 'FK'::text AS check_group,r.check_name::text,
        CASE WHEN EXISTS (
          SELECT 1 FROM pg_catalog.pg_constraint con
          JOIN pg_catalog.pg_class tab ON tab.oid=con.conrelid
          JOIN pg_catalog.pg_namespace ns ON ns.oid=tab.relnamespace
          JOIN pg_catalog.pg_class ref ON ref.oid=con.confrelid
          JOIN pg_catalog.pg_namespace rn ON rn.oid=ref.relnamespace
          WHERE ns.nspname='public' AND rn.nspname='public'
            AND tab.relname=r.table_name AND ref.relname=r.ref_table
            AND con.contype='f' AND con.convalidated IS TRUE
        ) THEN 'PASS' ELSE 'BLOCK' END AS result,
        'validated foreign key'::text AS evidence
 FROM required_fks r
),
trigger_status AS (
 SELECT 'TRIGGER'::text AS check_group,
        'us_pay_c11_service_price_guard'::text AS check_name,
        CASE WHEN EXISTS (
          SELECT 1 FROM pg_catalog.pg_trigger trg
          JOIN pg_catalog.pg_class tab ON tab.oid=trg.tgrelid
          JOIN pg_catalog.pg_namespace ns ON ns.oid=tab.relnamespace
          WHERE ns.nspname='public' AND tab.relname='us_service_price_amounts'
            AND trg.tgname='us_pay_c11_service_price_guard'
            AND NOT trg.tgisinternal AND trg.tgenabled IN ('O','A')
        ) THEN 'PASS' ELSE 'BLOCK' END AS result,
        'live enabled trigger on USD cents'::text AS evidence
),
market_status AS (
 SELECT 'MARKET'::text AS check_group,
        'active US/USD market is unique'::text AS check_name,
        CASE WHEN COUNT(*)=1 AND
             COUNT(*) FILTER(WHERE country_code='US' AND default_currency='USD'
               AND active IS TRUE)=1
          THEN 'PASS' ELSE 'BLOCK' END AS result,
        ('US market rows='||COUNT(*)::text)::text AS evidence
 FROM public.markets WHERE code='US'
),
checks AS (
 SELECT * FROM column_status
 UNION ALL SELECT * FROM index_status
 UNION ALL SELECT * FROM fk_status
 UNION ALL SELECT * FROM trigger_status
 UNION ALL SELECT * FROM market_status
)
SELECT 'US-SERVICES-01/production-schema-v1' AS contract_version,
       current_database() AS database_name,
       current_setting('transaction_read_only') AS transaction_read_only,
       check_group,check_name,result,evidence,
       (SELECT COUNT(*) FILTER(WHERE result='BLOCK') FROM checks)
         AS total_blockers,
       CASE WHEN (SELECT COUNT(*) FILTER(WHERE result='BLOCK') FROM checks)=0
         THEN 'SCHEMA_PASS_RELEASE_GATE_1'
         ELSE 'SCHEMA_BLOCK_RELEASE_HOLD' END AS gate
FROM checks
ORDER BY CASE WHEN result='BLOCK' THEN 0 ELSE 1 END,
         check_group,check_name;

COMMIT;
