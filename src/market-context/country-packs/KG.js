const KG_COUNTRY_PACK = Object.freeze({
  code: "KG",
  version: "1",
  country_code: "KG",
  phone_country_code: "+996",
  default_phone_region: "KG",
  default_locale: "ru-KG",
  default_currency: "KGS",
  default_timezone: "Asia/Bishkek",
  normalizeMobilePhone(value) {
    const raw = String(value || "").trim();
    const compact = raw.replace(/[\s\-()]/g, "");

    if (!compact) {
      return { ok: false, error: "PHONE_REQUIRED" };
    }

    let canonical = compact;

    if (/^996[0-9]{9}$/.test(compact)) {
      canonical = `+${compact}`;
    } else if (/^0[0-9]{9}$/.test(compact)) {
      canonical = `+996${compact.slice(1)}`;
    }

    if (!/^\+996[579][0-9]{8}$/.test(canonical)) {
      return { ok: false, error: "INVALID_KG_MOBILE_PHONE" };
    }

    return { ok: true, phone: canonical };
  },
});

export { KG_COUNTRY_PACK };
export default KG_COUNTRY_PACK;
