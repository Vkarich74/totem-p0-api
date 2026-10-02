import { getCountryPack } from "./CountryPackRegistry.js";

function createMarketContextError(code, message, statusCode = 500) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeCode(value) {
  return normalizeText(value).toUpperCase();
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(normalizeText).filter(Boolean))];
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }

  return Object.freeze(value);
}

function isIanaTimeZone(value) {
  const zone = normalizeText(value);
  if (!zone) return false;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function normalizeLocaleChoice(requestedLocale, tenantLocale, marketDefault, supportedLocales) {
  const supported = new Set(uniqueStrings(supportedLocales));
  const explicit = normalizeText(requestedLocale);
  const tenant = normalizeText(tenantLocale);
  const fallback = normalizeText(marketDefault);

  if (explicit && supported.has(explicit)) return explicit;
  if (tenant && supported.has(tenant)) return tenant;
  if (fallback && supported.has(fallback)) return fallback;

  throw createMarketContextError(
    "MARKET_LOCALE_UNRESOLVED",
    "Unable to resolve a supported locale",
    500
  );
}

function normalizeCurrencyChoice(tenantCurrency, marketDefault, supportedCurrencies) {
  const supported = new Set(uniqueStrings(supportedCurrencies).map(normalizeCode));
  const tenant = normalizeCode(tenantCurrency);
  const fallback = normalizeCode(marketDefault);
  const resolved = tenant || fallback;

  if (!resolved || !supported.has(resolved)) {
    throw createMarketContextError(
      "MARKET_CURRENCY_UNRESOLVED",
      "Unable to resolve a supported currency",
      500
    );
  }

  return resolved;
}

function normalizeTimezoneChoice(tenantTimezone, cityTimezone, marketDefault) {
  const candidates = [tenantTimezone, cityTimezone, marketDefault]
    .map(normalizeText)
    .filter(Boolean);

  for (const candidate of candidates) {
    if (isIanaTimeZone(candidate)) return candidate;
  }

  throw createMarketContextError(
    "MARKET_TIMEZONE_UNRESOLVED",
    "Unable to resolve a valid IANA timezone",
    500
  );
}

async function readTenantMarketRow(db, { salonId, salonSlug }) {
  const id = Number(salonId);
  const slug = normalizeText(salonSlug);
  const hasSalonId =
    salonId !== null &&
    salonId !== undefined &&
    Number.isInteger(id) &&
    id > 0;

  if (!hasSalonId && !slug) return null;

  const result = await db.query(
    `SELECT
       s.id AS salon_id,
       s.slug AS salon_slug,
       t.market_id,
       t.city_id,
       t.locale_override,
       t.currency_override,
       t.timezone_override,
       t.payment_profile_code,
       t.notification_profile_code,
       t.fiscal_profile_code,
       m.code AS market_code,
       m.country_code,
       m.default_locale,
       m.supported_locales,
       m.default_currency,
       m.supported_currencies,
       m.default_timezone,
       m.country_pack_code,
       m.country_pack_version,
       m.active AS market_active,
       c.slug AS city_slug,
       c.timezone AS city_timezone
     FROM public.salons s
     JOIN public.tenant_market_settings t
       ON t.salon_id = s.id
     JOIN public.markets m
       ON m.id = t.market_id
     LEFT JOIN public.cities c
       ON c.id = t.city_id
     WHERE (
       ($1::integer IS NOT NULL AND s.id = $1::integer)
       OR
       ($1::integer IS NULL AND $2::text <> '' AND s.slug = $2::text)
     )
     LIMIT 1`,
    [hasSalonId ? id : null, slug]
  );

  if (result.rowCount === 0) {
    throw createMarketContextError(
      "TENANT_MARKET_CONTEXT_NOT_FOUND",
      "Tenant MarketContext binding was not found",
      404
    );
  }

  return result.rows[0];
}

async function readConfiguredDefaultMarketCode(db) {
  const result = await db.query(
    `SELECT value
     FROM public.platform_config
     WHERE key = 'default_market_code'
     LIMIT 1`
  );

  const value = normalizeCode(result.rows[0]?.value);
  if (!value) {
    throw createMarketContextError(
      "DEFAULT_MARKET_NOT_CONFIGURED",
      "platform_config.default_market_code is not configured",
      500
    );
  }

  return value;
}

async function readMarketRow(db, marketCode) {
  const code = normalizeCode(marketCode);
  const result = await db.query(
    `SELECT
       m.id AS market_id,
       m.code AS market_code,
       m.country_code,
       m.default_locale,
       m.supported_locales,
       m.default_currency,
       m.supported_currencies,
       m.default_timezone,
       m.country_pack_code,
       m.country_pack_version,
       m.active AS market_active
     FROM public.markets m
     WHERE m.code = $1
     LIMIT 1`,
    [code]
  );

  if (result.rowCount === 0) {
    throw createMarketContextError(
      "MARKET_NOT_FOUND",
      `Market not found: ${code}`,
      404
    );
  }

  return {
    ...result.rows[0],
    salon_id: null,
    salon_slug: null,
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
}

async function readCapabilities(db, marketId) {
  const result = await db.query(
    `SELECT capability_code, enabled, config_json
     FROM public.market_capabilities
     WHERE market_id = $1
     ORDER BY capability_code`,
    [marketId]
  );

  return result.rows.map((row) => ({
    code: normalizeText(row.capability_code),
    enabled: row.enabled === true,
    config: row.config_json && typeof row.config_json === "object" ? row.config_json : {},
  }));
}

async function readProviderBindings(db, marketId) {
  const result = await db.query(
    `SELECT provider_type, provider_code, enabled, priority, profile_code, config_json
     FROM public.market_provider_bindings
     WHERE market_id = $1
     ORDER BY provider_type, priority, provider_code`,
    [marketId]
  );

  return result.rows.map((row) => ({
    type: normalizeText(row.provider_type),
    code: normalizeText(row.provider_code),
    enabled: row.enabled === true,
    priority: Number(row.priority),
    profile_code: normalizeText(row.profile_code) || null,
    config: row.config_json && typeof row.config_json === "object" ? row.config_json : {},
  }));
}

function bindingGroup(type, profileCode, providerBindings) {
  return {
    profile_code: normalizeText(profileCode) || null,
    providers: providerBindings.filter((binding) => binding.type === type),
  };
}

async function resolveMarketContext({
  db,
  salonId = null,
  salonSlug = "",
  marketCode = "",
  requestedLocale = "",
} = {}) {
  if (!db || typeof db.query !== "function") {
    throw createMarketContextError(
      "MARKET_CONTEXT_DB_REQUIRED",
      "A database handle with query() is required",
      500
    );
  }

  const numericSalonId = Number(salonId);
  const hasTenantSelector =
    (salonId !== null &&
      salonId !== undefined &&
      Number.isInteger(numericSalonId) &&
      numericSalonId > 0) ||
    Boolean(normalizeText(salonSlug));

  let sourceRow;
  if (hasTenantSelector) {
    sourceRow = await readTenantMarketRow(db, { salonId, salonSlug });
  } else {
    const selectedMarketCode =
      normalizeCode(marketCode) || (await readConfiguredDefaultMarketCode(db));
    sourceRow = await readMarketRow(db, selectedMarketCode);
  }

  if (sourceRow.market_active !== true) {
    throw createMarketContextError(
      "MARKET_INACTIVE",
      `Market is not active: ${normalizeCode(sourceRow.market_code)}`,
      409
    );
  }

  const pack = getCountryPack(
    sourceRow.country_pack_code,
    sourceRow.country_pack_version
  );

  if (normalizeCode(pack.country_code) !== normalizeCode(sourceRow.country_code)) {
    throw createMarketContextError(
      "COUNTRY_PACK_MARKET_MISMATCH",
      "CountryPack country does not match Market country",
      500
    );
  }

  const supportedLocales = uniqueStrings(sourceRow.supported_locales);
  const supportedCurrencies = uniqueStrings(sourceRow.supported_currencies).map(normalizeCode);
  const locale = normalizeLocaleChoice(
    requestedLocale,
    sourceRow.locale_override,
    sourceRow.default_locale,
    supportedLocales
  );
  const currencyCode = normalizeCurrencyChoice(
    sourceRow.currency_override,
    sourceRow.default_currency,
    supportedCurrencies
  );
  const timezone = normalizeTimezoneChoice(
    sourceRow.timezone_override,
    sourceRow.city_timezone,
    sourceRow.default_timezone
  );

  const capabilities = await readCapabilities(db, sourceRow.market_id);
  const providerBindings = await readProviderBindings(db, sourceRow.market_id);

  return deepFreeze({
    market_id: Number(sourceRow.market_id),
    market_code: normalizeCode(sourceRow.market_code),
    country_code: normalizeCode(sourceRow.country_code),
    city_id: sourceRow.city_id == null ? null : Number(sourceRow.city_id),
    city_slug: normalizeText(sourceRow.city_slug) || null,
    locale,
    currency_code: currencyCode,
    timezone,
    phone_country_code: pack.phone_country_code,
    default_phone_region: pack.default_phone_region,
    country_pack_code: normalizeCode(sourceRow.country_pack_code),
    country_pack_version: normalizeText(sourceRow.country_pack_version),
    supported_locales: supportedLocales,
    supported_currencies: supportedCurrencies,
    capabilities,
    payment_bindings: bindingGroup(
      "payment",
      sourceRow.payment_profile_code,
      providerBindings
    ),
    payout_bindings: bindingGroup("payout", null, providerBindings),
    notification_bindings: bindingGroup(
      "notification",
      sourceRow.notification_profile_code,
      providerBindings
    ),
    identity_bindings: bindingGroup("identity", null, providerBindings),
    fiscal_bindings: bindingGroup(
      "fiscal",
      sourceRow.fiscal_profile_code,
      providerBindings
    ),
  });
}

function resolveHistoricalCurrencyCode(record) {
  const currencyCode = normalizeCode(record?.currency_code ?? record?.currency);

  if (!/^[A-Z]{3}$/.test(currencyCode)) {
    throw createMarketContextError(
      "HISTORICAL_RECORD_CURRENCY_REQUIRED",
      "Historical monetary record must carry its own currency",
      409
    );
  }

  return currencyCode;
}

export {
  createMarketContextError,
  deepFreeze,
  isIanaTimeZone,
  resolveHistoricalCurrencyCode,
  resolveMarketContext,
};
