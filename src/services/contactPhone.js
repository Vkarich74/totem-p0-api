import parsePhoneNumber from "libphonenumber-js/max";
import { KG_COUNTRY_PACK } from "../market-context/country-packs/KG.js";
import { US_COUNTRY_PACK } from "../market-context/country-packs/US.js";
import { resolveBusinessMarketContext } from "../market-context/BusinessContext.js";

function rejectPhone(error) {
  return { ok: false, error };
}

/**
 * Contact phones are independent from the business's MarketContext.
 * Only national numbers may receive a caller-supplied defaultCountry.
 */
export function normalizeContactPhone(value, { defaultCountry = "", required = true } = {}) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return required ? rejectPhone("PHONE_REQUIRED") : { ok: true, phone: null };
  }

  // Do not allow extensions, letters, second '+' signs or partial extraction.
  if (!/^\+?[0-9\s().\-\u00a0\u202f]+$/u.test(raw)) {
    return rejectPhone("PHONE_INVALID_FORMAT");
  }

  const compact = raw.replace(/[\s().\-\u00a0\u202f]/gu, "");
  if (!/^\+?[0-9]+$/.test(compact)) {
    return rejectPhone("PHONE_INVALID_FORMAT");
  }

  const international = compact.startsWith("+");
  const country = String(defaultCountry || "").trim().toUpperCase();
  if (!international && !/^[A-Z]{2}$/.test(country)) {
    return rejectPhone("PHONE_COUNTRY_CODE_REQUIRED");
  }

  let parsed = null;
  try {
    parsed = international
      ? parsePhoneNumber(compact, { extract: false })
      : parsePhoneNumber(compact, { defaultCountry: country, extract: false });
  } catch {
    // Invalid numbers fall through to the narrow legacy KG compatibility rule.
  }
  if (parsed?.isValid() && /^\+[1-9][0-9]{1,14}$/.test(parsed.number)) {
    return { ok: true, phone: parsed.number };
  }

  // Preserve the verified historical KG +99622... acceptance rule.
  // For national KG numbers, the region must have been explicitly resolved.
  if ((international && compact.startsWith("+996")) || (!international && country === "KG")) {
    const kg = KG_COUNTRY_PACK.normalizeMobilePhone(compact);
    if (kg.ok) {
      return { ok: true, phone: kg.phone };
    }
  }

  return rejectPhone("PHONE_INVALID_FORMAT");
}

/**
 * MarketContext supplies a national-number parse hint ONLY if necessary.
 * It is never selected, changed or rebound according to the phone country.
 */
export async function normalizeContactPhoneForBusiness(db, value, { marketCode = "", required = true } = {}) {
  // A +1 E.164 number can belong to Canada or the Caribbean. US onboarding
  // must use the strict CountryPack rather than accepting any NANP number.
  if (String(marketCode || "").trim().toUpperCase() === "US") {
    if (!String(value ?? "").trim() && !required) return { ok: true, phone: null };
    return US_COUNTRY_PACK.normalizeBusinessPhone(String(value ?? ""));
  }
  const international = normalizeContactPhone(value, { required });
  if (international.ok || international.error !== "PHONE_COUNTRY_CODE_REQUIRED") {
    return international;
  }

  const context = await resolveBusinessMarketContext(db, { marketCode });
  return normalizeContactPhone(value, {
    defaultCountry: context.default_phone_region || context.country_code,
    required,
  });
}
