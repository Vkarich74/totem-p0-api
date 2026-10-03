import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import dotenv from "dotenv";

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
dotenv.config({ path: process.env.G10_ENV_FILE || path.join(repoRoot, ".env"), quiet: true });

const databaseUrl = process.env.G10_DATABASE_URL || process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL_MISSING");

const applyRequested = process.argv.includes("--apply");
const migrationPath = path.join(
  repoRoot,
  "migrations",
  "2026_10_03__g10_drop_currency_defaults_after_runtime_cleanup.sql"
);
const migrationSql = fs.readFileSync(migrationPath, "utf8");
const tables = [
  "billing_subscriptions", "contract_rent_obligations", "contract_rent_payments",
  "contract_salary_obligations", "finance_events", "money_audit_events",
  "money_ledger_entries", "money_owner_balances", "money_owner_obligations",
  "money_receipts", "money_split_allocations", "payment_collection_anchors",
  "payout_executions", "provider_events", "provider_settlement_items",
  "provider_settlements", "withdraw_requests",
];

function sslFor(url) {
  const host = new URL(url).hostname;
  return ["127.0.0.1", "localhost"].includes(host)
    ? false
    : { rejectUnauthorized: false };
}

function clientOptions(readOnly = false) {
  return {
    connectionString: databaseUrl,
    ssl: sslFor(databaseUrl),
    options: readOnly
      ? "-c default_transaction_read_only=on -c statement_timeout=120000"
      : "-c statement_timeout=120000",
  };
}

function assert(value, message) {
  if (!value) throw new Error(message);
}

async function queryRows(client, text, params = []) {
  return (await client.query(text, params)).rows;
}
async function collectState(client) {
  const defaults = await queryRows(
    client,
    `SELECT table_name, column_default
     FROM information_schema.columns
     WHERE table_schema='public'
       AND column_name='currency'
       AND table_name = ANY($1::text[])
     ORDER BY table_name`,
    [tables]
  );

  const business = (await queryRows(
    client,
    `SELECT
       (SELECT count(*)::int FROM public.bookings) AS bookings,
       (SELECT count(*)::int FROM public.payments) AS payments,
       (SELECT count(*)::int FROM public.payouts) AS payouts,
       (SELECT count(*)::int FROM public.withdraw_requests) AS withdraw_requests`
  ))[0];

  const walletFingerprint = (await queryRows(
    client,
    `SELECT count(*)::int AS count,
       md5(coalesce(string_agg(to_jsonb(t)::text, '|' ORDER BY id::text), '')) AS hash
     FROM totem_test.wallets t`
  ))[0];

  const ledgerFingerprint = (await queryRows(
    client,
    `SELECT count(*)::int AS count,
       md5(coalesce(string_agg(to_jsonb(t)::text, '|' ORDER BY id::text), '')) AS hash
     FROM totem_test.ledger_entries t`
  ))[0];

  const market = (await queryRows(
    client,
    `SELECT
       (SELECT count(*)::int
          FROM public.market_provider_bindings mpb
          JOIN public.markets m ON m.id=mpb.market_id
         WHERE m.code='KG' AND mpb.provider_type='payout') AS kg_payout_bindings,
       (SELECT count(*)::int FROM public.markets WHERE code='KZ') AS kz_market_count,
       (SELECT status FROM public.countries WHERE code='KZ' LIMIT 1) AS kz_country_status`
  ))[0];

  return {
    defaults,
    business,
    walletFingerprint,
    ledgerFingerprint,
    market,
  };
}

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
const preClient = new Client(clientOptions(true));
await preClient.connect();
const pre = await collectState(preClient);
await preClient.end();

assert(pre.defaults.length === tables.length, "G10_DEFAULT_COLUMN_COUNT_MISMATCH");
const defaultsWithKgs = pre.defaults.filter((row) =>
  String(row.column_default || "").includes("KGS")
);
const defaultsNull = pre.defaults.filter((row) => row.column_default == null);

let status = "PRECHECK_PASS";
let productionDbWrite = 0;

if (defaultsNull.length === tables.length) {
  status = "ALREADY_APPLIED_PASS";
} else {
  assert(defaultsWithKgs.length === tables.length, "G10_DEFAULT_PRECONDITION_MISMATCH");
  if (applyRequested) {
    const writeClient = new Client(clientOptions(false));
    await writeClient.connect();
    await writeClient.query(migrationSql);
    await writeClient.end();
    productionDbWrite = 1;
    status = "APPLIED";
  }
}

const postClient = new Client(clientOptions(true));
await postClient.connect();
const post = await collectState(postClient);
await postClient.end();
assert(post.defaults.length === tables.length, "G10_DEFAULT_POST_COLUMN_COUNT_MISMATCH");
if (status === "PRECHECK_PASS") {
  assert(
    post.defaults.every((row) => String(row.column_default || "").includes("KGS")),
    "G10_DEFAULT_PRECHECK_STATE_CHANGED"
  );
} else {
  assert(
    post.defaults.every((row) => row.column_default == null),
    "G10_DEFAULT_POSTCHECK_FAILED"
  );
}
assert(sameJson(pre.business, post.business), "G10_BUSINESS_COUNTS_CHANGED");
assert(
  sameJson(pre.walletFingerprint, post.walletFingerprint),
  "G10_TOTEM_TEST_WALLETS_CHANGED"
);
assert(
  sameJson(pre.ledgerFingerprint, post.ledgerFingerprint),
  "G10_TOTEM_TEST_LEDGER_CHANGED"
);
assert(post.market.kg_payout_bindings === 4, "G10_KG_PROVIDER_BINDINGS_MISMATCH");
assert(post.market.kz_market_count === 0, "G10_KZ_MARKET_CREATED");
assert(post.market.kz_country_status === "planned", "G10_KZ_COUNTRY_STATUS_CHANGED");

const report = {
  generated_at: new Date().toISOString(),
  status,
  apply_requested: applyRequested,
  production_db_write: productionDbWrite,
  defaults_before: pre.defaults,
  defaults_after: post.defaults,
  business_before: pre.business,
  business_after: post.business,
  totem_test_wallets_before: pre.walletFingerprint,
  totem_test_wallets_after: post.walletFingerprint,
  totem_test_ledger_before: pre.ledgerFingerprint,
  totem_test_ledger_after: post.ledgerFingerprint,
  market_before: pre.market,
  market_after: post.market,
};

const reportsDir = path.join(repoRoot, "reports", "globalization");
fs.mkdirSync(reportsDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const reportPath = path.join(
  reportsDir,
  `g10_currency_defaults_cleanup_${stamp}.json`
);
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(`G10_CURRENCY_DEFAULTS=${status}`);
console.log(`PRODUCTION_DB_WRITE=${productionDbWrite}`);
console.log(`DEFAULTS_BEFORE_KGS=${defaultsWithKgs.length}`);
console.log(`DEFAULTS_AFTER_NON_NULL=${post.defaults.filter((row) => row.column_default != null).length}`);
console.log(`BUSINESS=${post.business.bookings}/${post.business.payments}/${post.business.payouts}/${post.business.withdraw_requests}`);
console.log(`KG_PAYOUT_BINDINGS=${post.market.kg_payout_bindings}`);
console.log(`KZ_MARKET_COUNT=${post.market.kz_market_count}`);
console.log(`KZ_COUNTRY_STATUS=${post.market.kz_country_status}`);
console.log(`REPORT=${reportPath}`);
