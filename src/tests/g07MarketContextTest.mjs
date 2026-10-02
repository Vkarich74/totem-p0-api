import assert from "node:assert/strict";

import {
  getCountryPack,
  resolveHistoricalCurrencyCode,
  resolveMarketContext,
} from "../market-context/index.js";

const baseMarket = {
  market_id: 1,
  market_code: "KG",
  country_code: "KG",
  default_locale: "ru-KG",
  supported_locales: ["ru-KG", "ky-KG"],
  default_currency: "KGS",
  supported_currencies: ["KGS", "USD"],
  default_timezone: "Asia/Bishkek",
  country_pack_code: "KG",
  country_pack_version: "1",
  market_active: true,
};

const tenants = new Map([
  [1, {
    ...baseMarket,
    salon_id: 1,
    salon_slug: "one",
    city_id: 10,
    city_slug: "bishkek",
    city_timezone: "UTC",
    locale_override: null,
    currency_override: null,
    timezone_override: null,
    payment_profile_code: null,
    notification_profile_code: null,
    fiscal_profile_code: null,
  }],
  [2, {
    ...baseMarket,
    salon_id: 2,
    salon_slug: "two",
    city_id: null,
    city_slug: null,
    city_timezone: null,
    locale_override: null,
    currency_override: null,
    timezone_override: null,
    payment_profile_code: null,
    notification_profile_code: null,
    fiscal_profile_code: null,
  }],
  [3, {
    ...baseMarket,
    salon_id: 3,
    salon_slug: "three",
    city_id: 11,
    city_slug: "test-city",
    city_timezone: "UTC",
    locale_override: "ky-KG",
    currency_override: "USD",
    timezone_override: "Europe/London",
    payment_profile_code: "pay-profile",
    notification_profile_code: "notify-profile",
    fiscal_profile_code: "fiscal-profile",
  }],
]);

class FakeDb {
  constructor({ capabilities = [], bindings = [] } = {}) {
    this.capabilities = capabilities;
    this.bindings = bindings;
  }

  async query(sql, params = []) {
    const normalized = String(sql).replace(/\s+/g, " ").trim().toLowerCase();

    if (normalized.includes("from public.salons s") &&
        normalized.includes("join public.tenant_market_settings")) {
      const salonId = params[0];
      const salonSlug = params[1];
      const row = salonId
        ? tenants.get(Number(salonId))
        : [...tenants.values()].find((item) => item.salon_slug === salonSlug);
      return { rowCount: row ? 1 : 0, rows: row ? [{ ...row }] : [] };
    }

    if (normalized.includes("from public.platform_config")) {
      return { rowCount: 1, rows: [{ value: "KG" }] };
    }

    if (normalized.includes("from public.markets m")) {
      const code = String(params[0] || "").toUpperCase();
      if (code !== "KG") return { rowCount: 0, rows: [] };
      return { rowCount: 1, rows: [{ ...baseMarket }] };
    }

    if (normalized.includes("from public.market_capabilities")) {
      return { rowCount: this.capabilities.length, rows: this.capabilities };
    }

    if (normalized.includes("from public.market_provider_bindings")) {
      return { rowCount: this.bindings.length, rows: this.bindings };
    }

    throw new Error(`UNHANDLED_SQL:${normalized}`);
  }
}

async function expectError(code, fn) {
  let caught = null;
  try {
    await fn();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, `Expected error ${code}`);
  assert.equal(caught.code, code);
}

const db = new FakeDb();

const cityContext = await resolveMarketContext({ db, salonId: 1 });
assert.equal(cityContext.market_code, "KG");
assert.equal(cityContext.country_code, "KG");
assert.equal(cityContext.locale, "ru-KG");
assert.equal(cityContext.currency_code, "KGS");
assert.equal(cityContext.timezone, "UTC");
assert.equal(cityContext.phone_country_code, "+996");
assert.equal(cityContext.default_phone_region, "KG");
assert.equal(cityContext.city_slug, "bishkek");
assert.deepEqual(cityContext.capabilities, []);
assert.deepEqual(cityContext.payment_bindings.providers, []);
assert.ok(Object.isFrozen(cityContext));
assert.ok(Object.isFrozen(cityContext.supported_locales));
assert.ok(Object.isFrozen(cityContext.payment_bindings));

const marketFallback = await resolveMarketContext({ db, salonId: 2 });
assert.equal(marketFallback.timezone, "Asia/Bishkek");

const overrideContext = await resolveMarketContext({ db, salonId: 3 });
assert.equal(overrideContext.locale, "ky-KG");
assert.equal(overrideContext.currency_code, "USD");
assert.equal(overrideContext.timezone, "Europe/London");
assert.equal(overrideContext.payment_bindings.profile_code, "pay-profile");
assert.equal(overrideContext.notification_bindings.profile_code, "notify-profile");
assert.equal(overrideContext.fiscal_bindings.profile_code, "fiscal-profile");

const explicitLocaleContext = await resolveMarketContext({
  db,
  salonId: 3,
  requestedLocale: "ru-KG",
});
assert.equal(explicitLocaleContext.locale, "ru-KG");

const unsupportedLocaleContext = await resolveMarketContext({
  db,
  salonId: 3,
  requestedLocale: "es-MX",
});
assert.equal(unsupportedLocaleContext.locale, "ky-KG");

const tenantlessDefault = await resolveMarketContext({ db });
assert.equal(tenantlessDefault.market_code, "KG");
assert.equal(tenantlessDefault.currency_code, "KGS");

const explicitMarket = await resolveMarketContext({ db, marketCode: "KG" });
assert.equal(explicitMarket.market_code, "KG");

await expectError("MARKET_NOT_FOUND", () =>
  resolveMarketContext({ db, marketCode: "KZ" })
);
await expectError("TENANT_MARKET_CONTEXT_NOT_FOUND", () =>
  resolveMarketContext({ db, salonId: 999 })
);

assert.equal(resolveHistoricalCurrencyCode({ currency_code: "USD" }), "USD");
assert.equal(resolveHistoricalCurrencyCode({ currency: "eur" }), "EUR");
await expectError("HISTORICAL_RECORD_CURRENCY_REQUIRED", () =>
  Promise.resolve(resolveHistoricalCurrencyCode({}))
);

const providerDb = new FakeDb({
  capabilities: [
    { capability_code: "online_payment", enabled: true, config_json: { mode: "test" } },
  ],
  bindings: [
    {
      provider_type: "payment",
      provider_code: "xpay",
      enabled: true,
      priority: 10,
      profile_code: "kg-main",
      config_json: {},
    },
    {
      provider_type: "payout",
      provider_code: "manual",
      enabled: false,
      priority: 100,
      profile_code: null,
      config_json: {},
    },
  ],
});
const providerContext = await resolveMarketContext({ db: providerDb });
assert.equal(providerContext.capabilities[0].code, "online_payment");
assert.equal(providerContext.payment_bindings.providers[0].code, "xpay");
assert.equal(providerContext.payout_bindings.providers[0].code, "manual");

const kgPack = getCountryPack("KG", "1");
assert.deepEqual(kgPack.normalizeMobilePhone("0555 123 456"), {
  ok: true,
  phone: "+996555123456",
});
assert.equal(kgPack.normalizeMobilePhone("+1 202 555 0100").error, "INVALID_KG_MOBILE_PHONE");

console.log("G07_MARKET_CONTEXT_UNIT=PASS");
