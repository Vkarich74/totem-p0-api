import parsePhoneNumber from "libphonenumber-js/max";
const KZ_COUNTRY_PACK = Object.freeze({
  code: "KZ", version: "1", country_code: "KZ",
  phone_country_code: "+7", default_phone_region: "KZ",
  default_locale: "ru-KZ", default_currency: "KZT", default_timezone: "Asia/Almaty",
  normalizeMobilePhone(value) {
    const raw = String(value || "").trim();
    if (!raw) return { ok: false, error: "PHONE_REQUIRED" };
    const compact = raw.replace(/[\s\-()]/g, "");
    if (!/^\+?[0-9]+$/.test(compact)) return { ok: false, error: "INVALID_KZ_MOBILE_PHONE" };
    const input = /^7[0-9]{10}$/.test(compact) ? "+" + compact : compact;
    const phone = parsePhoneNumber(input, { defaultCountry: "KZ", extract: false });
    if (!phone || phone.country !== "KZ" || !phone.isValid() || phone.getType() !== "MOBILE" || phone.ext) {
      return { ok: false, error: "INVALID_KZ_MOBILE_PHONE" };
    }
    return { ok: true, phone: phone.number };
  },
});
export { KZ_COUNTRY_PACK };
export default KZ_COUNTRY_PACK;
