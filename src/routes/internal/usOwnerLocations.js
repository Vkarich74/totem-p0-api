// TOTEM US-05 — owner-only US location draft management.
// Isolated US market only. Does not activate locations, providers or payments.
// Registered in salons router which supplies existing authorization & billing guards.
import express from "express";

const FIELDS = new Set([
  "location_code", "state_code", "city_name", "street_line1",
  "street_line2", "postal_code", "timezone_name", "is_primary",
]);

function problem(code, status = 400) {
  const e = new Error(code);
  e.code = code;
  e.statusCode = status;
  return e;
}

function normalizeDraft(raw, { update = false } = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) ||
      Object.keys(raw).some(key => !FIELDS.has(key))) {
    throw problem("US_LOCATION_FIELDS_INVALID");
  }
  const location_code = String(raw.location_code || "").trim();
  if (!update && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(location_code)) {
    throw problem("US_LOCATION_CODE_INVALID");
  }
  if (update && Object.hasOwn(raw, "location_code")) {
    throw problem("US_LOCATION_CODE_IMMUTABLE");
  }
  const state_code = String(raw.state_code || "").trim();
  const city_name = String(raw.city_name || "").trim();
  const street_line1 = String(raw.street_line1 || "").trim();
  const street_line2 = String(raw.street_line2 || "").trim();
  const postal_code = String(raw.postal_code || "").trim();
  const timezone_name = String(raw.timezone_name || "").trim();

  if (!/^[A-Z]{2}$/.test(state_code) ||
      city_name.length < 1 || city_name.length > 120 ||
      street_line1.length < 3 || street_line1.length > 220 ||
      street_line2.length > 220 ||
      !/^[0-9]{5}(?:-[0-9]{4})?$/.test(postal_code) ||
      timezone_name.length < 1 || timezone_name.length > 100 ||
      typeof raw.is_primary !== "boolean") {
    throw problem("US_LOCATION_ADDRESS_INVALID");
  }
  if (timezone_name === "UTC" || timezone_name === "Etc/UTC") {
    throw problem("US_LOCATION_IANA_REQUIRED");
  }
  return {
    location_code, state_code, city_name, street_line1, street_line2,
    postal_code, timezone_name, is_primary: raw.is_primary,
  };
}

async function ownerContext(db, req, {
  hasSalonOwnership, ensureSalonWriteAllowed, write = false,
}) {
  if (!req.auth || req.auth.role !== "salon_admin") {
    throw problem("US_OWNER_AUTH_REQUIRED", 401);
  }
  const slug = String(req.params.slug || "").trim();
  if (!slug) throw problem("SALON_SLUG_REQUIRED");
  const salon = await db.query(
    `SELECT s.id, s.slug, m.active AS market_active, m.code AS market_code
       FROM public.salons s
       JOIN public.tenant_market_settings t ON t.salon_id=s.id
       JOIN public.markets m ON m.id=t.market_id
      WHERE s.slug=$1 AND m.code='US' AND m.country_code='US'
        AND m.default_currency='USD' AND m.country_pack_code='US'
        AND m.country_pack_version='1'
      LIMIT 1`,
    [slug]
  );
  if (!salon.rows.length) throw problem("US_SALON_NOT_FOUND", 404);
  const salonId = Number(salon.rows[0].id);
  if (!hasSalonOwnership(req, salonId)) throw problem("US_OWNER_FORBIDDEN", 403);
  // US06-SEC-001: identity.salons may contain an INDIRECT salon through a
  // shared master: owner_salon(KG) -> master_salon(US). Never authorize
  // owner writes/reads using a cross-salon inferred identity alone.
  // Require direct active owner-salon relation even for GET.
  const directOwner = await db.query(
    "SELECT 1 FROM public.owner_salon WHERE owner_id=$1 AND salon_id=$2 AND status='active' LIMIT 1",
    [String(req.auth.user_id), salonId]
  );
  if (directOwner.rows.length !== 1) throw problem("US_OWNER_FORBIDDEN", 403);
  if (write) await ensureSalonWriteAllowed(db, salonId);
  return { salonId, marketActive: salon.rows[0].market_active === true };
}

async function catalogs(db) {
  const [states, timezones] = await Promise.all([
    db.query(`SELECT code,name_en,kind FROM public.us_states
              WHERE country_code='US' ORDER BY name_en`),
    db.query(`SELECT name FROM public.us_timezones ORDER BY name`),
  ]);
  if (states.rows.length !== 51 || timezones.rows.length !== 29) {
    throw problem("US_LOCATION_CATALOG_INCOMPLETE", 503);
  }
  return {
    states: states.rows,
    timezones: timezones.rows.map(row => row.name),
  };
}

async function checkCatalogKeys(db, draft) {
  const valid = await db.query(
    `SELECT EXISTS(SELECT 1 FROM public.us_states
                     WHERE code=$1 AND country_code='US') AS state_ok,
            EXISTS(SELECT 1 FROM public.us_timezones
                     WHERE name=$2) AS timezone_ok`,
    [draft.state_code, draft.timezone_name]
  );
  if (!valid.rows[0]?.state_ok) throw problem("US_STATE_UNKNOWN");
  if (!valid.rows[0]?.timezone_ok) throw problem("US_TIMEZONE_UNKNOWN");
}

function locationDto(row) {
  return {
    location_code: row.location_code,
    state_code: row.state_code,
    city_name: row.city_name,
    street_line1: row.street_line1,
    street_line2: row.street_line2 || "",
    postal_code: row.postal_code,
    timezone_name: row.timezone_name,
    is_primary: row.is_primary === true,
    enabled: row.enabled === true,
  };
}

function httpError(error, res) {
  if (error?.code === "23505") {
    return res.status(409).json({ ok:false, error:"US_LOCATION_DUPLICATE" });
  }
  if (error?.code === "23503" || error?.code === "23514") {
    return res.status(409).json({ ok:false, error:"US_LOCATION_INTEGRITY_LOCKED" });
  }
  if (error?.code === "BILLING_BLOCKED") {
    return res.status(403).json({ ok:false, error:"BILLING_BLOCKED" });
  }
  if (Number.isInteger(error?.statusCode)) {
    return res.status(error.statusCode).json({ ok:false, error:error.code });
  }
  console.error("US_OWNER_LOCATION_FAILED", error?.code || "UNKNOWN");
  return res.status(500).json({ ok:false, error:"US_OWNER_LOCATION_FAILED" });
}

export function buildUsOwnerLocationsRouter(pool, {
  hasSalonOwnership, ensureSalonWriteAllowed,
}) {
  if (!pool || typeof hasSalonOwnership !== "function" ||
      typeof ensureSalonWriteAllowed !== "function") {
    throw new Error("US_OWNER_LOCATION_GUARDS_REQUIRED");
  }
  const router = express.Router();
  const guards = { hasSalonOwnership, ensureSalonWriteAllowed };

  router.get("/salons/:slug/us-locations", async (req, res) => {
    try {
      const { salonId, marketActive } = await ownerContext(pool, req, guards);
      const [catalog, list] = await Promise.all([
        catalogs(pool),
        pool.query(`SELECT location_code,state_code,city_name,street_line1,
                           street_line2,postal_code,timezone_name,is_primary,enabled
                      FROM public.us_salon_locations
                     WHERE salon_id=$1 ORDER BY is_primary DESC,location_code`,
                   [salonId]),
      ]);
      return res.json({
        ok: true, market_code: "US", currency_code: "USD", market_active: marketActive,
        locations: list.rows.map(locationDto),
        states: catalog.states, timezones: catalog.timezones,
        activation_allowed: false,
      });
    } catch (error) { return httpError(error, res); }
  });

  async function saveLocation(req, res, isUpdate) {
    const db = await pool.connect();
    try {
      const draft = normalizeDraft(req.body, { update: isUpdate });
      await db.query("BEGIN");
      const { salonId } = await ownerContext(db, req, {
        ...guards, write: true,
      });
      await db.query("SELECT id FROM public.salons WHERE id=$1 FOR UPDATE", [salonId]);
      await checkCatalogKeys(db, draft);
      if (isUpdate) {
        const code = String(req.params.location_code || "").trim();
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(code)) {
          throw problem("US_LOCATION_CODE_INVALID");
        }
        const locked = await db.query(
          `SELECT id, enabled FROM public.us_salon_locations
            WHERE salon_id=$1 AND location_code=$2 FOR UPDATE`,
          [salonId, code]
        );
        if (!locked.rows.length) throw problem("US_LOCATION_NOT_FOUND",404);
        // Never alter a location whose booked historical times depend on it.
        const history = await db.query(
          "SELECT 1 FROM public.us_booking_location_links WHERE location_id=$1 LIMIT 1",
          [locked.rows[0].id]
        );
        if (history.rows.length) throw problem("US_LOCATION_BOOKING_HISTORY_LOCKED",409);
        if (locked.rows[0].enabled) throw problem("US_LOCATION_ACTIVE_LOCKED",409);
      }
      if (draft.is_primary) {
        await db.query(
          "UPDATE public.us_salon_locations SET is_primary=false,updated_at=now() WHERE salon_id=$1 AND is_primary=true",
          [salonId]
        );
      }
      const args = [
        salonId, draft.state_code, draft.city_name, draft.street_line1,
        draft.street_line2 || null, draft.postal_code,
        draft.timezone_name, draft.is_primary,
      ];
      let saved;
      if (isUpdate) {
        saved = await db.query(
          `UPDATE public.us_salon_locations
              SET state_code=$2,city_name=$3,street_line1=$4,
                  street_line2=$5,postal_code=$6,timezone_name=$7,
                  is_primary=$8,updated_at=now()
            WHERE salon_id=$1 AND location_code=$9 AND enabled=false
            RETURNING location_code,state_code,city_name,street_line1,
                      street_line2,postal_code,timezone_name,is_primary,enabled`,
          [...args, req.params.location_code]
        );
      } else {
        saved = await db.query(
          `INSERT INTO public.us_salon_locations
             (salon_id,location_code,state_code,city_name,street_line1,
              street_line2,postal_code,timezone_name,is_primary,enabled)
           VALUES ($1,$9,$2,$3,$4,$5,$6,$7,$8,false)
           RETURNING location_code,state_code,city_name,street_line1,
                     street_line2,postal_code,timezone_name,is_primary,enabled`,
          [...args, draft.location_code]
        );
      }
      if (saved.rows.length !== 1) throw problem("US_LOCATION_SAVE_FAILED",409);
      await db.query("COMMIT");
      return res.status(isUpdate ? 200 : 201).json({
        ok:true, location:locationDto(saved.rows[0]),
        activation_allowed:false,
      });
    } catch (error) {
      try { await db.query("ROLLBACK"); } catch {}
      return httpError(error,res);
    } finally { db.release(); }
  }

  router.post("/salons/:slug/us-locations", (req,res)=>saveLocation(req,res,false));
  router.put("/salons/:slug/us-locations/:location_code",
             (req,res)=>saveLocation(req,res,true));
  return router;
}
