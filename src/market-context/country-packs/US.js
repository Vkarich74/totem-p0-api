import parsePhoneNumber from "libphonenumber-js/max";

// USPS Publication 28, Appendix B: 50 states and District of Columbia.
// U.S. territories/possessions are NOT silently treated as states.
const US_STATE_CODES = Object.freeze([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL",
  "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME",
  "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH",
  "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI",
  "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
]);

const US_STATE_SET = new Set(US_STATE_CODES);

function normalizeUsBusinessPhone(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return { ok: false, error: "PHONE_REQUIRED" };

  // Reject extensions, embedded text, multiple '+' characters and other
  // unsupported syntax. Full NANP country validation follows this check.
  if (!/^\+?[0-9\s().-]+$/.test(raw)) {
    return { ok: false, error: "INVALID_US_PHONE" };
  }

  const compact = raw.replace(/[\s().-]/g, "");
  if (!/^\+?[0-9]+$/.test(compact)) {
    return { ok: false, error: "INVALID_US_PHONE" };
  }

  // A domestic 11-digit NANP phone starts with 1. Parsing the explicit +1
  // still MUST establish the actual country (Canada/Caribbean also use +1).
  const input = /^1[0-9]{10}$/.test(compact) ? `+${compact}` : compact;
  let parsed = null;
  try {
    parsed = parsePhoneNumber(input, {
      defaultCountry: "US",
      extract: false,
    });
  } catch {
    return { ok: false, error: "INVALID_US_PHONE" };
  }

  if (!parsed || parsed.country !== "US" || !parsed.isValid() || parsed.ext) {
    return { ok: false, error: "INVALID_US_PHONE" };
  }

  return { ok: true, phone: parsed.number };
}

function normalizeUsStateCode(value) {
  const code = String(value ?? "").trim().toUpperCase();
  if (!US_STATE_SET.has(code)) {
    return { ok: false, error: "INVALID_US_STATE" };
  }
  return { ok: true, state_code: code };
}

function normalizeUsZipCode(value) {
  const text = String(value ?? "").trim();
  if (!/^[0-9]{5}(?:-?[0-9]{4})?$/.test(text)) {
    return { ok: false, error: "INVALID_US_ZIP" };
  }

  const postalCode = text.length === 9
    ? `${text.slice(0, 5)}-${text.slice(5)}`
    : text;
  return { ok: true, postal_code: postalCode };
}

const US_COUNTRY_PACK = Object.freeze({
  code: "US",
  version: "1",
  country_code: "US",
  phone_country_code: "+1",
  default_phone_region: "US",
  default_locale: "en-US",
  default_currency: "USD",

  // Schema requires a market fallback timezone. UTC is NOT a salon timezone:
  // US salon booking must stay disabled until its location-specific IANA
  // timezone is resolved and the US operational time gate is implemented.
  default_timezone: "Etc/UTC",
  requires_location_timezone: true,

  state_codes: US_STATE_CODES,
  normalizeStateCode: normalizeUsStateCode,
  normalizeZipCode: normalizeUsZipCode,
  normalizeBusinessPhone: normalizeUsBusinessPhone,

  // Compatibility with the existing CountryPack interface for booking and
  // owner contact normalization. This checks country and E.164 validity,
  // NOT SMS reachability or carrier line type.
  normalizeMobilePhone: normalizeUsBusinessPhone,
});

export { US_COUNTRY_PACK, US_STATE_CODES };
export default US_COUNTRY_PACK;
