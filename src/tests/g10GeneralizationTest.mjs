import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  requireCurrencyCode,
  resolveOwnerMarketContext,
} from "../market-context/BusinessContext.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(__dirname, "..");

assert.equal(requireCurrencyCode("usd"), "USD");
assert.equal(requireCurrencyCode("KGS"), "KGS");
assert.throws(
  () => requireCurrencyCode("US", "TEST_CURRENCY_INVALID"),
  (error) => error?.code === "TEST_CURRENCY_INVALID"
);

const baseMarket = {
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

const altMarket = {
  ...baseMarket,
  supported_currencies: ["KGS", "USD"],
  currency_override: "USD",
  timezone_override: "Europe/London",
};

class FakeDb {
  constructor(masterSalons = [1, 2]) {
    this.masterSalons = masterSalons;
  }

  async query(sql, params = []) {
    const normalized = String(sql).replace(/\s+/g, " ").trim().toLowerCase();

    if (
      normalized.includes("select distinct ms.salon_id") &&
      normalized.includes("from public.master_salon")
    ) {
      return {
        rowCount: this.masterSalons.length,
        rows: this.masterSalons.map((salon_id) => ({ salon_id })),
      };
    }

    if (
      normalized.includes("from public.salons s") &&
      normalized.includes("join public.tenant_market_settings")
    ) {
      const salonId = Number(params[0]);
      const market = salonId === 3 ? altMarket : baseMarket;
      return {
        rowCount: 1,
        rows: [{
          ...market,
          salon_id: salonId,
          salon_slug: `salon-${salonId}`,
        }],
      };
    }

    if (normalized.includes("from public.market_capabilities")) {
      return { rowCount: 0, rows: [] };
    }

    if (normalized.includes("from public.market_provider_bindings")) {
      return { rowCount: 0, rows: [] };
    }

    throw new Error(`UNHANDLED_SQL:${normalized}`);
  }
}

const sameMarketContext = await resolveOwnerMarketContext(
  new FakeDb([1, 2]),
  { ownerType: "master", ownerId: 77 }
);
assert.equal(sameMarketContext.market_code, "KG");
assert.equal(sameMarketContext.currency_code, "KGS");
assert.equal(sameMarketContext.timezone, "Asia/Bishkek");

let ambiguous = null;
try {
  await resolveOwnerMarketContext(
    new FakeDb([1, 3]),
    { ownerType: "master", ownerId: 77 }
  );
} catch (error) {
  ambiguous = error;
}
assert.equal(ambiguous?.code, "OWNER_MARKET_CONTEXT_AMBIGUOUS");

const forbidden = ["KGS", "Asia/Bishkek", "+996", "ru-RU", "Кыргызстан"];
const allowedFiles = new Set([
  "market-context/country-packs/KG.js",
  "money-core/providers/xpay.adapter.js",
]);
const extensions = new Set([".js", ".mjs", ".cjs"]);
const violations = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "tests") continue;
      walk(absolute);
      continue;
    }

    if (!extensions.has(path.extname(entry.name))) continue;
    const relative = path.relative(srcRoot, absolute).replaceAll("\\", "/");
    if (allowedFiles.has(relative)) continue;

    const lines = fs.readFileSync(absolute, "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const token of forbidden) {
        if (line.includes(token)) {
          violations.push(`${relative}:${index + 1}:${token}`);
        }
      }
    });
  }
}

walk(srcRoot);
assert.deepEqual(
  violations,
  [],
  `Forbidden global market literals remain:\n${violations.join("\n")}`
);

console.log("G10_GENERALIZATION_UNIT=PASS");
