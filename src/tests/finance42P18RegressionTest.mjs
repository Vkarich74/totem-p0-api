// Targeted PostgreSQL 42P18 regression: salon/master collection anchors + lost profit.
// No database connection, no real/synthetic business records and no writes.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getCollectionAnchors } from "../services/paymentCollectionAnchors.service.js";

const market = {
  market_id: 1,
  market_code: "KG",
  country_code: "KG",
  default_locale: "ru-KG",
  supported_locales: ["ru-KG"],
  default_currency: "KGS",
  supported_currencies: ["KGS"],
  default_timezone: "Asia/Bishkek",
  country_pack_code: "KG",
  country_pack_version: "1",
  market_active: true,
};
const tenant = {
  ...market,
  salon_id: 32,
  salon_slug: "read-only-fixture",
  city_id: null,
  city_slug: null,
  city_timezone: null,
  locale_override: null,
  currency_override: null,
  timezone_override: null,
  payment_profile_code: null,
  notification_profile_code: null,
  fiscal_profile_code: null,
};

function assertAllParametersUsed(sql, values) {
  assert.match(sql, /^\s*SELECT\b/i, "finance query must be SELECT only");
  assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP)\b/i);
  const referenced = new Set([...sql.matchAll(/\$(\d+)\b/g)].map((match) => Number(match[1])));
  assert.equal(referenced.size, values.length, "every bound value must be used by SQL");
  for (let index = 1; index <= values.length; index += 1) {
    assert.ok(referenced.has(index), \`unused SQL parameter $\${index}\`);
  }
}

class FakeDb {
  constructor() { this.statement = null; }
  async query(sql, values = []) {
    const normalized = String(sql).replace(/\s+/g, " ").trim().toLowerCase();
    if (normalized.includes("from public.master_salon ms")) {
      return { rowCount: 1, rows: [{ salon_id: 32 }] };
    }
    if (normalized.includes("from public.salons s") &&
        normalized.includes("join public.tenant_market_settings")) {
      assert.equal(Number(values[0]), 32);
      return { rowCount: 1, rows: [{ ...tenant }] };
    }
    if (normalized.includes("from public.market_capabilities") ||
        normalized.includes("from public.market_provider_bindings")) {
      return { rowCount: 0, rows: [] };
    }
    if (normalized.includes("from public.payment_collection_anchors a")) {
      assertAllParametersUsed(sql, values);
      this.statement = { sql, values };
      return { rowCount: 0, rows: [] };
    }
    throw new Error(\`UNEXPECTED_SQL: \${normalized.slice(0, 150)}\`);
  }
}

let assertions = 0;
async function anchors(label, options, expected, expectedTimezoneParameter) {
  const db = new FakeDb();
  const row = options.scopeType === "master"
    ? { id: 8, slug: "real-master" }
    : { id: 32, slug: "real-salon" };
  const result = await getCollectionAnchors(db, {
    scopeType: options.scopeType || "salon",
    scopeRow: row,
    scopeId: row.id,
    ...options,
  });
  assert.equal(result.ok, true, label);
  assert.ok(db.statement, label);
  assert.deepEqual(db.statement.values, expected, label);
  assert.match(db.statement.sql, /a\.currency\s*=\s*\$2/, label);
  if (expectedTimezoneParameter === null) {
    assert.doesNotMatch(db.statement.sql, /AT TIME ZONE/, label);
  } else {
    assert.ok(db.statement.sql.includes(\`AT TIME ZONE $\${expectedTimezoneParameter}::text\`), label);
  }
  assertions += 1;
  console.log("42P18_PASS", label);
}
await anchors("salon_unfiltered", {}, [32, "KGS"], null);
await anchors("master_unfiltered", { scopeType: "master" }, [8, "KGS"], null);
await anchors("salon_status_only", { status: "open" }, [32, "KGS", ["open"]], null);
await anchors("salon_both_dates", { from: "2026-11-01", to: "2026-11-30" },
  [32, "KGS", "Asia/Bishkek", "2026-11-01", "2026-11-30"], 3);
await anchors("salon_to_only", { to: "2026-11-30" },
  [32, "KGS", "Asia/Bishkek", "2026-11-30"], 3);
await anchors("salon_status_date_master", {
  status: "open", from: "2026-11-01", masterFilterRow: { id: 5, slug: "master-five" },
}, [32, "KGS", ["open"], "Asia/Bishkek", "2026-11-01", 5], 4);

// Execute the real lost-profit query builder in isolation, without loading
// Express/router and without making any requests or connecting to PostgreSQL.
const source = readFileSync(new URL("../routes/internal/masters.js", import.meta.url), "utf8");
const start = source.indexOf("const values = [masterRow.id, timezone];");
const end = source.indexOf("const allRows = rowsResult.rows || [];", start);
assert.ok(start !== -1 && end > start, "lost-profit SQL source must match tested contract");
const buildQuery = source.slice(start, end);
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
const execute = new AsyncFunction("masterRow", "timezone", "currency", "from", "to", "pool", buildQuery);
async function lostProfit(label, from, to, expected) {
  let observed = null;
  await execute({ id: 8 }, "Asia/Bishkek", "KGS", from, to, {
    async query(sql, values) {
      assertAllParametersUsed(sql, values);
      observed = { sql, values };
      return { rowCount: 0, rows: [] };
    },
  });
  assert.ok(observed, label);
  assert.deepEqual(observed.values, expected, label);
  assert.match(observed.sql, /AT TIME ZONE \$2/, label);
  assertions += 1;
  console.log("42P18_PASS", label);
}
await lostProfit("master_lost_profit_both_dates", "2026-11-01", "2026-11-30",
  [8, "Asia/Bishkek", "2026-11-01", "2026-11-30"]);
await lostProfit("master_lost_profit_from_only", "2026-11-01", null,
  [8, "Asia/Bishkek", "2026-11-01"]);
await lostProfit("master_lost_profit_no_dates", null, null,
  [8, "Asia/Bishkek"]);
console.log("42P18_REGRESSION_PASS", assertions);
