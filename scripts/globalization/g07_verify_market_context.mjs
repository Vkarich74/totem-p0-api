import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import dotenv from "dotenv";

import {
  resolveHistoricalCurrencyCode,
  resolveMarketContext,
} from "../../src/market-context/index.js";

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
dotenv.config({ path: path.join(repoRoot, ".env"), quiet: true });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL_MISSING");

const targetCurrencyTables = [
  "contracts",
  "services",
  "services_v2",
  "salon_master_services",
  "bookings",
  "payments",
  "payment_refunds",
  "payouts",
  "settlement_items",
  "settlement_periods",
  "settlement_payout_batches",
  "settlement_reconciliation_reports",
  "money_reconciliation_mismatches",
  "withdraw_settings",
  "withdraws",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sslFor(url) {
  const host = new URL(url).hostname;
  return ["127.0.0.1", "localhost"].includes(host)
    ? false
    : { rejectUnauthorized: false };
}

function clientOptions() {
  return {
    connectionString: databaseUrl,
    ssl: sslFor(databaseUrl),
    options: "-c default_transaction_read_only=on -c statement_timeout=120000",
  };
}

async function q(client, text, params = []) {
  return (await client.query(text, params)).rows;
}

const reportsDir = path.join(repoRoot, "reports", "globalization");
fs.mkdirSync(reportsDir, { recursive: true });
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const reportBase = path.join(reportsDir, `g07_market_context_verify_${timestamp}`);

let client = null;

try {
  client = new Client(clientOptions());
  await client.connect();

  const identity = (
    await q(
      client,
      `SELECT current_database() database,
              current_setting('transaction_read_only') read_only`
    )
  )[0];
  assert(identity.database === "railway", `UNEXPECTED_DATABASE_${identity.database}`);
  assert(identity.read_only === "on", "PRODUCTION_CONNECTION_NOT_READ_ONLY");

  const salons = await q(
    client,
    `SELECT id, slug FROM public.salons ORDER BY id`
  );
  assert(salons.length === 27, `SALON_COUNT_${salons.length}`);

  const tenantCounts = (
    await q(
      client,
      `SELECT
         count(*)::int total,
         count(*) FILTER (WHERE city_id IS NOT NULL)::int linked_city,
         count(*) FILTER (WHERE city_id IS NULL)::int null_city
       FROM public.tenant_market_settings`
    )
  )[0];
  assert(
    tenantCounts.total === 27 &&
      tenantCounts.linked_city === 14 &&
      tenantCounts.null_city === 13,
    `TENANT_COUNTS_${JSON.stringify(tenantCounts)}`
  );

  const defaultMarket = (
    await q(
      client,
      `SELECT value
       FROM public.platform_config
       WHERE key = 'default_market_code'
       LIMIT 1`
    )
  )[0]?.value;
  assert(defaultMarket === "KG", `DEFAULT_MARKET_${defaultMarket}`);

  const markets = await q(
    client,
    `SELECT code, country_code, active
     FROM public.markets
     ORDER BY code`
  );
  assert(
    markets.length === 1 &&
      markets[0].code === "KG" &&
      markets[0].country_code === "KG" &&
      markets[0].active === true,
    `MARKETS_${JSON.stringify(markets)}`
  );

  const kz = (
    await q(
      client,
      `SELECT code, status
       FROM public.countries
       WHERE code = 'KZ'
       LIMIT 1`
    )
  )[0];
  assert(kz?.status === "planned", `KZ_STATUS_${kz?.status}`);

  const currencyColumns = await q(
    client,
    `SELECT table_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = ANY($1::text[])
       AND column_name = 'currency_code'
     ORDER BY table_name`,
    [targetCurrencyTables]
  );
  assert(
    currencyColumns.length === targetCurrencyTables.length,
    `G06_CURRENCY_COLUMN_COUNT_${currencyColumns.length}`
  );

  const currencyDistributions = {};
  for (const table of targetCurrencyTables) {
    const row = (
      await q(
        client,
        `SELECT
           count(*)::int total,
           count(*) FILTER (WHERE currency_code IS NULL)::int null_currency,
           count(*) FILTER (WHERE currency_code IS NOT NULL AND currency_code <> 'KGS')::int non_kgs
         FROM public."${table}"`
      )
    )[0];
    assert(row.null_currency === 0, `NULL_CURRENCY_${table}_${row.null_currency}`);
    assert(row.non_kgs === 0, `NON_KGS_CURRENCY_${table}_${row.non_kgs}`);
    currencyDistributions[table] = row;
  }

  const resolved = [];
  for (const salon of salons) {
    const context = await resolveMarketContext({
      db: client,
      salonId: Number(salon.id),
      requestedLocale: "ru-KG",
    });

    assert(context.market_code === "KG", `SALON_${salon.id}_MARKET`);
    assert(context.country_code === "KG", `SALON_${salon.id}_COUNTRY`);
    assert(context.locale === "ru-KG", `SALON_${salon.id}_LOCALE`);
    assert(context.currency_code === "KGS", `SALON_${salon.id}_CURRENCY`);
    assert(context.timezone === "Asia/Bishkek", `SALON_${salon.id}_TIMEZONE`);
    assert(context.phone_country_code === "+996", `SALON_${salon.id}_PHONE_PREFIX`);
    assert(context.default_phone_region === "KG", `SALON_${salon.id}_PHONE_REGION`);
    assert(context.capabilities.length === 0, `SALON_${salon.id}_CAPABILITIES`);
    assert(context.payment_bindings.providers.length === 0, `SALON_${salon.id}_PAYMENT_BINDINGS`);
    assert(context.payout_bindings.providers.length === 0, `SALON_${salon.id}_PAYOUT_BINDINGS`);
    assert(context.notification_bindings.providers.length === 0, `SALON_${salon.id}_NOTIFICATION_BINDINGS`);
    assert(context.fiscal_bindings.providers.length === 0, `SALON_${salon.id}_FISCAL_BINDINGS`);

    resolved.push({
      salon_id: Number(salon.id),
      salon_slug: salon.slug,
      market_code: context.market_code,
      city_id: context.city_id,
      city_slug: context.city_slug,
      locale: context.locale,
      currency_code: context.currency_code,
      timezone: context.timezone,
    });
  }

  const tenantless = await resolveMarketContext({ db: client });
  assert(tenantless.market_code === "KG", "TENANTLESS_DEFAULT_NOT_KG");
  assert(tenantless.currency_code === "KGS", "TENANTLESS_CURRENCY_NOT_KGS");
  assert(tenantless.timezone === "Asia/Bishkek", "TENANTLESS_TIMEZONE_NOT_BISHKEK");

  let nonexistentMarketError = null;
  try {
    await resolveMarketContext({ db: client, marketCode: "KZ" });
  } catch (error) {
    nonexistentMarketError = error;
  }
  assert(nonexistentMarketError?.code === "MARKET_NOT_FOUND", "KZ_MARKET_WAS_SELECTED");

  assert(
    resolveHistoricalCurrencyCode({ currency_code: "USD" }) === "USD",
    "HISTORICAL_CURRENCY_OVERRIDDEN"
  );

  let missingHistoricalCurrency = null;
  try {
    resolveHistoricalCurrencyCode({});
  } catch (error) {
    missingHistoricalCurrency = error;
  }
  assert(
    missingHistoricalCurrency?.code === "HISTORICAL_RECORD_CURRENCY_REQUIRED",
    "HISTORICAL_CURRENCY_MISSING_NOT_REJECTED"
  );

  const payload = {
    status: "PASS",
    production_db_write: false,
    identity,
    salon_count: salons.length,
    tenant_counts: tenantCounts,
    default_market_code: defaultMarket,
    markets,
    kz,
    g06_currency_columns: currencyColumns.length,
    currency_distributions: currencyDistributions,
    resolved_count: resolved.length,
    resolved,
    tenantless: {
      market_code: tenantless.market_code,
      country_code: tenantless.country_code,
      locale: tenantless.locale,
      currency_code: tenantless.currency_code,
      timezone: tenantless.timezone,
      phone_country_code: tenantless.phone_country_code,
      default_phone_region: tenantless.default_phone_region,
    },
    capability_rows: tenantless.capabilities.length,
    payment_binding_rows: tenantless.payment_bindings.providers.length,
    payout_binding_rows: tenantless.payout_bindings.providers.length,
    notification_binding_rows: tenantless.notification_bindings.providers.length,
    fiscal_binding_rows: tenantless.fiscal_bindings.providers.length,
    historical_currency_protection: "PASS",
    nonexistent_market_controlled_error: nonexistentMarketError.code,
  };

  fs.writeFileSync(`${reportBase}.json`, JSON.stringify(payload, null, 2));
  fs.writeFileSync(
    `${reportBase}.txt`,
    [
      "G07_MARKET_CONTEXT_PRODUCTION_VERIFY=PASS",
      "PRODUCTION_DB_WRITE=0",
      `SALONS=${salons.length}`,
      `TENANTS=${tenantCounts.total}`,
      `LINKED_CITY=${tenantCounts.linked_city}`,
      `NULL_CITY=${tenantCounts.null_city}`,
      `RESOLVED=${resolved.length}`,
      `DEFAULT_MARKET=${defaultMarket}`,
      `G06_CURRENCY_COLUMNS=${currencyColumns.length}`,
      `KZ_STATUS=${kz.status}`,
      `CAPABILITY_ROWS=${payload.capability_rows}`,
      `PAYMENT_BINDING_ROWS=${payload.payment_binding_rows}`,
      `PAYOUT_BINDING_ROWS=${payload.payout_binding_rows}`,
      `NOTIFICATION_BINDING_ROWS=${payload.notification_binding_rows}`,
      `FISCAL_BINDING_ROWS=${payload.fiscal_binding_rows}`,
      "HISTORICAL_CURRENCY_PROTECTION=PASS",
      "NONEXISTENT_MARKET_ERROR=MARKET_NOT_FOUND",
      "",
    ].join("\n")
  );

  console.log(
    JSON.stringify(
      {
        status: "PASS",
        production_db_write: false,
        resolved: resolved.length,
        linked_city: tenantCounts.linked_city,
        null_city: tenantCounts.null_city,
        report: {
          json: `${reportBase}.json`,
          text: `${reportBase}.txt`,
        },
      },
      null,
      2
    )
  );
} catch (error) {
  console.error(
    JSON.stringify(
      {
        status: "FAIL",
        production_db_write: false,
        error: error?.message || String(error),
      },
      null,
      2
    )
  );
  process.exitCode = 1;
} finally {
  if (client) {
    await client.end();
  }
}
