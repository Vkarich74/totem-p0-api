import { getCountryPack } from "./CountryPackRegistry.js";
import { resolveMarketContext } from "./MarketContextResolver.js";

function normalizeCurrencyCode(value) {
  const code = String(value ?? "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

function requireCurrencyCode(value, errorCode = "CURRENCY_REQUIRED") {
  const code = normalizeCurrencyCode(value);
  if (code) return code;

  const error = new Error("A valid ISO 4217 currency code is required");
  error.code = errorCode;
  error.statusCode = 400;
  throw error;
}

async function resolveBusinessMarketContext(db, selector = {}) {
  return resolveMarketContext({
    db,
    salonId: selector.salonId ?? null,
    salonSlug: selector.salonSlug ?? "",
    marketCode: selector.marketCode ?? "",
    requestedLocale: selector.requestedLocale ?? "",
  });
}

async function ensureSalonMarketBinding(db, { salonId, marketCode = "" } = {}) {
  const id = Number(salonId);
  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error("Valid salon id is required");
    error.code = "TENANT_ID_REQUIRED";
    error.statusCode = 400;
    throw error;
  }

  const requestedCode = String(marketCode || "").trim().toUpperCase();
  const seedContext = await resolveBusinessMarketContext(db, { marketCode: requestedCode });
  await db.query(
    `INSERT INTO public.tenant_market_settings (salon_id, market_id)
     VALUES ($1, $2)
     ON CONFLICT (salon_id) DO NOTHING`,
    [id, seedContext.market_id]
  );

  const resolved = await resolveBusinessMarketContext(db, { salonId: id });
  if (requestedCode && resolved.market_code !== requestedCode) {
    const error = new Error("Existing tenant market binding conflicts with requested market");
    error.code = "TENANT_MARKET_CONFLICT";
    error.statusCode = 409;
    throw error;
  }
  return resolved;
}

async function resolveOperationCurrency(db, selector = {}) {
  const context = await resolveBusinessMarketContext(db, selector);
  return requireCurrencyCode(context.currency_code, "MARKET_CURRENCY_REQUIRED");
}

async function resolveBusinessTimezone(db, selector = {}) {
  const context = await resolveBusinessMarketContext(db, selector);
  const timezone = String(context.timezone || "").trim();
  if (!timezone) {
    const error = new Error("Business timezone is required");
    error.code = "MARKET_TIMEZONE_REQUIRED";
    error.statusCode = 409;
    throw error;
  }
  return timezone;
}

async function normalizePhoneForMarket(db, value, selector = {}) {
  const context = await resolveBusinessMarketContext(db, selector);
  const pack = getCountryPack(context.country_pack_code, context.country_pack_version);
  if (typeof pack.normalizeMobilePhone !== "function") {
    const error = new Error("CountryPack phone normalizer is required");
    error.code = "COUNTRY_PACK_PHONE_NORMALIZER_REQUIRED";
    error.statusCode = 500;
    throw error;
  }
  return pack.normalizeMobilePhone(value);
}


async function resolveOwnerMarketContext(db, { ownerType, ownerId } = {}) {
  const type = String(ownerType || "").trim().toLowerCase();
  const id = Number(ownerId);
  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error("Valid owner id is required");
    error.code = "OWNER_ID_REQUIRED";
    error.statusCode = 400;
    throw error;
  }

  if (type === "salon") {
    return resolveBusinessMarketContext(db, { salonId: id });
  }

  if (type === "master") {
    const result = await db.query(
      `SELECT DISTINCT ms.salon_id
       FROM public.master_salon ms
       JOIN public.tenant_market_settings tms ON tms.salon_id = ms.salon_id
       JOIN public.markets m ON m.id = tms.market_id
       WHERE ms.master_id = $1
         AND ms.status = 'active'
         AND m.active = true
       ORDER BY ms.salon_id`,
      [id]
    );
    const contexts = [];
    for (const row of result.rows) {
      contexts.push(await resolveBusinessMarketContext(db, { salonId: row.salon_id }));
    }
    const unique = new Map(
      contexts.map((context) => [
        [context.market_code, context.currency_code, context.timezone, context.locale].join("|"),
        context,
      ])
    );
    if (unique.size === 1) return [...unique.values()][0];

    const error = new Error(
      unique.size > 1
        ? "Owner is bound to multiple business market contexts"
        : "Owner market context was not found"
    );
    error.code = unique.size > 1 ? "OWNER_MARKET_CONTEXT_AMBIGUOUS" : "OWNER_MARKET_CONTEXT_NOT_FOUND";
    error.statusCode = 409;
    throw error;
  }

  if (type === "platform" || type === "system") {
    return resolveBusinessMarketContext(db);
  }

  const error = new Error("Unsupported owner type");
  error.code = "OWNER_TYPE_INVALID";
  error.statusCode = 400;
  throw error;
}

async function normalizePhoneForOwner(db, value, owner = {}) {
  const context = await resolveOwnerMarketContext(db, owner);
  const pack = getCountryPack(context.country_pack_code, context.country_pack_version);
  if (typeof pack.normalizeMobilePhone !== "function") {
    const error = new Error("CountryPack phone normalizer is required");
    error.code = "COUNTRY_PACK_PHONE_NORMALIZER_REQUIRED";
    error.statusCode = 500;
    throw error;
  }
  return pack.normalizeMobilePhone(value);
}

async function resolveOwnerCurrencyCode(db, { ownerType, ownerId, requestedCurrency = null } = {}) {
  if (requestedCurrency != null && String(requestedCurrency).trim() !== "") {
    return requireCurrencyCode(requestedCurrency, "OWNER_CURRENCY_INVALID");
  }

  const type = String(ownerType || "").trim().toLowerCase();
  const id = Number(ownerId);
  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error("Valid owner id is required");
    error.code = "OWNER_ID_REQUIRED";
    error.statusCode = 400;
    throw error;
  }

  const balanceResult = await db.query(
    `SELECT DISTINCT currency FROM public.money_owner_balances
     WHERE owner_type = $1 AND owner_id = $2 ORDER BY currency`,
    [type, id]
  );
  if (balanceResult.rows.length === 1) {
    return requireCurrencyCode(balanceResult.rows[0].currency, "OWNER_CURRENCY_INVALID");
  }
  if (balanceResult.rows.length > 1) {
    const error = new Error("Currency filter is required for a multi-currency owner");
    error.code = "OWNER_CURRENCY_REQUIRED";
    error.statusCode = 409;
    throw error;
  }

  const context = await resolveOwnerMarketContext(db, {
    ownerType: type,
    ownerId: id,
  });
  return requireCurrencyCode(context.currency_code, "OWNER_CURRENCY_INVALID");
}

export {
  normalizeCurrencyCode,
  requireCurrencyCode,
  resolveBusinessMarketContext,
  ensureSalonMarketBinding,
  resolveOperationCurrency,
  resolveBusinessTimezone,
  normalizePhoneForMarket,
  resolveOwnerMarketContext,
  normalizePhoneForOwner,
  resolveOwnerCurrencyCode,
};
