// Static, offline US-02 migration guard. No PostgreSQL or network access.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../../", import.meta.url);
const us02 = readFileSync(new URL("migrations/2026_11_14__us02_inactive_market_geography.sql", root), "utf8");
const kz = readFileSync(new URL("migrations/2026_10_06__add_kz_market.sql", root), "utf8");
const kg = readFileSync(new URL("migrations/2026_10_02__g05_add_global_market_schema.sql", root), "utf8");

let checks = 0;
function check(label, fn) { fn(); checks++; console.log("US02_KZ_STATIC_PASS", label); }

const matched = us02.match(
  /IF NOT EXISTS \(SELECT 1 FROM public\.markets\s+WHERE code = 'KG'(?<kg>[\s\S]*?)\)\s+OR NOT EXISTS \(SELECT 1 FROM public\.markets\s+WHERE code = 'KZ'(?<kz>[\s\S]*?)\) THEN\s+RAISE EXCEPTION 'US02_STOP_KG_KZ_MARKET_BASELINE_CHANGED'/,
);
assert.ok(matched?.groups, "KG/KZ US-02 preflight must remain fail-closed");
const kgGuard = matched.groups.kg;
const kzGuard = matched.groups.kz;

check("KZ migration registers inactive market", () => {
  assert.match(kz, /VALUES\('KZ','KZ','ru-KZ',[\s\S]*?,'KZT',[\s\S]*?'Asia\/Almaty','KZ','1',false\)/);
});
check("US-02 still requires active KG and KGS", () => {
  assert.match(kgGuard, /country_code = 'KG'/);
  assert.match(kgGuard, /default_currency = 'KGS' AND active/);
  assert.match(kg, /'KG',[\s\S]*?'KGS',[\s\S]*?'Asia\/Bishkek',[\s\S]*?true\s*\)/);
});
check("US-02 requires structurally correct KZ without activation", () => {
  assert.match(kzGuard, /country_code = 'KZ'/);
  assert.match(kzGuard, /default_currency = 'KZT'/);
  assert.doesNotMatch(kzGuard, /\bactive\b/i);
});
check("no legacy KG/KZ row modifications by US-02", () => {
  assert.doesNotMatch(us02, /^\s*(?:UPDATE|DELETE FROM|ALTER TABLE)\s+(?:public\.)?(?:markets|countries|tenant_market_settings)\b/gim);
});
check("US registration stays inactive and default KG stays guarded", () => {
  assert.match(us02, /'USD', ARRAY\['USD'\]::text\[\], 'Etc\/UTC', 'US', '1', false/);
  assert.match(us02, /default_market_code'[\s\S]*?IS DISTINCT FROM 'KG'/);
  assert.match(us02, /US02_STOP_CONFLICT_EXISTING_US_OBJECT/);
});
check("US location activation remains prohibited", () => {
  assert.match(us02, /IF NEW\.enabled THEN\s+RAISE EXCEPTION 'US02_LOCATION_ACTIVATION_LOCKED'/);
  assert.match(us02, /US02_STOP_FINAL_MARKET_SAFETY_MISMATCH/);
});
console.log("US02_KZ_INACTIVE_PREFLIGHT_STATIC_PASS", checks);
