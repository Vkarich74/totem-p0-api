// US-04: public locations catalog for an ACTIVE US tenant only.
// Mounted after resolveTenant and public availability access guard.
// No KG/KZ fallback; location records are read-only on this endpoint.
import { pool } from "../db.js";

export async function publicUsLocationCatalog(req, res) {
  const tenantSalonId = Number(req.tenant?.salon_id);
  const marketContext = req.market_context;

  if (!Number.isSafeInteger(tenantSalonId) || tenantSalonId <= 0) {
    return res.status(400).json({ ok: false, error: "TENANT_REQUIRED" });
  }
  if (marketContext?.market_code !== "US" ||
      marketContext?.country_code !== "US" ||
      marketContext?.currency_code !== "USD" ||
      marketContext?.country_pack_code !== "US" ||
      marketContext?.country_pack_version !== "1") {
    return res.status(404).json({ ok: false, error: "US_MARKET_ONLY" });
  }

  try {
    const states = await pool.query(
      `SELECT code, name_en, kind
         FROM public.us_states
        WHERE country_code = 'US'
        ORDER BY name_en, code`
    );
    if (states.rows.length !== 51 ||
        states.rows.filter(row => row.kind === "state").length !== 50 ||
        states.rows.filter(row => row.kind === "federal_district").length !== 1) {
      return res.status(503).json({ ok: false, error: "US_STATES_CATALOG_UNAVAILABLE" });
    }

    const locations = await pool.query(
      `SELECT l.id, l.location_code, l.state_code, l.city_name,
              l.street_line1, l.street_line2, l.postal_code,
              l.timezone_name, l.is_primary
         FROM public.us_salon_locations l
         JOIN public.us_timezones z ON z.name = l.timezone_name
        WHERE l.salon_id = $1 AND l.enabled = true
        ORDER BY l.is_primary DESC, l.city_name, l.location_code`,
      [tenantSalonId]
    );

    return res.json({
      ok: true,
      market_code: "US",
      currency_code: "USD",
      locale: "en-US",
      phone_country_code: "+1",
      states: states.rows,
      locations: locations.rows.map(row => ({
        location_code: row.location_code,
        state_code: row.state_code,
        city_name: row.city_name,
        street_line1: row.street_line1,
        street_line2: row.street_line2 || "",
        postal_code: row.postal_code,
        timezone: row.timezone_name,
        is_primary: row.is_primary === true,
      })),
    });
  } catch (error) {
    console.error("US_PUBLIC_LOCATION_CATALOG_ERROR", error?.code || "UNKNOWN");
    return res.status(503).json({ ok: false, error: "US_LOCATIONS_UNAVAILABLE" });
  }
}
