import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import pkg from "pg";
import crypto from "crypto";

const { Pool } = pkg;

const app = express();
app.set("trust proxy", 1);

const FRONTEND_ORIGIN =
  process.env.FRONTEND_ORIGIN || "https://totem-platform.odoo.com";

app.use(cors({ origin: FRONTEND_ORIGIN, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 1000 }));

let _pool = null;
function getPool() {
  if (_pool) return _pool;
  _pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  return _pool;
}

/* ================= AUTH CONTEXT ================= */

function resolveAuth(req, res, next) {
  const rawId = req.headers["x-user-id"];
  const rawRole = req.headers["x-role"];
  const user_id = rawId ? Number.parseInt(rawId.toString(), 10) : null;
  const role = rawRole ? rawRole.toString().trim() : null;

  if (
    Number.isInteger(user_id) &&
    user_id > 0 &&
    (role === "salon_admin" || role === "master")
  ) {
    req.auth = { user_id, role };
  } else {
    req.auth = null;
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.auth) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  next();
}

async function canAccessSalon(client, user_id, role, salon_id) {
  if (!Number.isInteger(salon_id) || salon_id <= 0) return false;

  if (role === "salon_admin") {
    const r = await client.query(
      `SELECT 1
       FROM public.owner_salon os
       WHERE os.owner_id = $1::text
         AND os.salon_id = $2
         AND os.status = 'active'
       LIMIT 1`,
      [user_id, salon_id]
    );
    return r.rowCount > 0;
  }

  if (role === "master") {
    const r = await client.query(
      `SELECT 1
       FROM public.masters m
       JOIN public.master_salon ms ON ms.master_id = m.id
       WHERE m.user_id = $1
         AND ms.salon_id = $2
         AND ms.status = 'active'
       LIMIT 1`,
      [user_id, salon_id]
    );
    return r.rowCount > 0;
  }

  return false;
}

async function getBookingSalonId(client, bookingId) {
  const r = await client.query(
    `SELECT salon_id FROM public.bookings WHERE id = $1 LIMIT 1`,
    [bookingId]
  );
  if (!r.rows.length) return null;
  return Number.parseInt(String(r.rows[0].salon_id), 10);
}

async function enforceBookingSalonAccess(client, auth, bookingId) {
  const salonId = await getBookingSalonId(client, bookingId);
  if (!salonId) return { ok: false, code: 404, error: "BOOKING_NOT_FOUND" };

  const allowed = await canAccessSalon(client, auth.user_id, auth.role, salonId);
  if (!allowed) return { ok: false, code: 403, error: "SALON_ACCESS_DENIED" };

  return { ok: true };
}

async function ensureMasterAllowedForBooking(client, auth, salon_id, master_id) {
  if (!Number.isInteger(master_id) || master_id <= 0) {
    return { ok: false, code: 400, error: "INVALID_MASTER_ID" };
  }

  if (auth.role === "master") {
    // master can only book for himself
    const r = await client.query(
      `SELECT 1
       FROM public.masters m
       WHERE m.id = $1
         AND m.user_id = $2
       LIMIT 1`,
      [master_id, auth.user_id]
    );
    if (r.rowCount === 0) return { ok: false, code: 403, error: "MASTER_ID_MISMATCH" };
    return { ok: true };
  }

  // salon_admin: master must be active in this salon
  const r = await client.query(
    `SELECT 1
     FROM public.master_salon ms
     WHERE ms.master_id = $1
       AND ms.salon_id = $2
       AND ms.status = 'active'
     LIMIT 1`,
    [master_id, salon_id]
  );
  if (r.rowCount === 0) return { ok: false, code: 400, error: "MASTER_NOT_IN_SALON" };
  return { ok: true };
}

function parseIsoDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

app.use(resolveAuth);

/* ================= HEALTH ================= */

app.get("/health", (req, res) => res.json({ ok: true }));

/* ================= BOOKING ENGINE V2 =================
   slot -> booking (idempotency by request_id = Idempotency-Key)
   Required booking columns: salon_id, salon_slug, master_id, start_at, end_at, request_id, calendar_slot_id
   Also: service_id (enforced by DB trigger on INSERT), price_snapshot filled by DB trigger
*/

app.post("/bookings/v2", requireAuth, async (req, res) => {
  const pool = getPool();

  const idempotencyKey = req.headers["idempotency-key"];
  if (!idempotencyKey) {
    return res.status(400).json({ ok: false, error: "IDEMPOTENCY_KEY_REQUIRED" });
  }

  const {
    salon_id,
    salon_slug,
    master_id,
    service_id,
    start_at,
    end_at,
    client_id
  } = req.body || {};

  const salonId = Number.parseInt(String(salon_id), 10);
  const masterId = Number.parseInt(String(master_id), 10);
  const serviceId = Number.parseInt(String(service_id), 10);

  if (!Number.isInteger(salonId) || salonId <= 0) {
    return res.status(400).json({ ok: false, error: "INVALID_SALON_ID" });
  }
  if (!salon_slug || typeof salon_slug !== "string" || salon_slug.trim().length < 1) {
    return res.status(400).json({ ok: false, error: "SALON_SLUG_REQUIRED" });
  }
  if (!Number.isInteger(masterId) || masterId <= 0) {
    return res.status(400).json({ ok: false, error: "INVALID_MASTER_ID" });
  }
  if (!Number.isInteger(serviceId) || serviceId <= 0) {
    return res.status(400).json({ ok: false, error: "SERVICE_REQUIRED" });
  }

  const startIso = parseIsoDate(start_at);
  const endIso = parseIsoDate(end_at);
  if (!startIso || !endIso) {
    return res.status(400).json({ ok: false, error: "INVALID_TIME_RANGE" });
  }
  if (new Date(startIso) >= new Date(endIso)) {
    return res.status(400).json({ ok: false, error: "INVALID_TIME_RANGE" });
  }

  const client = await pool.connect();

  try {
    // Guard: user can access salon
    const allowedSalon = await canAccessSalon(client, req.auth.user_id, req.auth.role, salonId);
    if (!allowedSalon) return res.status(403).json({ ok: false, error: "SALON_ACCESS_DENIED" });

    // Guard: master validity (master role must match himself, salon_admin must pick active master in salon)
    const masterGate = await ensureMasterAllowedForBooking(client, req.auth, salonId, masterId);
    if (!masterGate.ok) return res.status(masterGate.code).json({ ok: false, error: masterGate.error });

    await client.query("BEGIN");

    // Idempotency: if booking already exists for this request_id, return it
    const existingBooking = await client.query(
      `SELECT *
       FROM public.bookings
       WHERE request_id = $1
       LIMIT 1`,
      [idempotencyKey]
    );
    if (existingBooking.rows.length) {
      await client.query("COMMIT");
      return res.json({ ok: true, booking: existingBooking.rows[0], idempotent: true });
    }

    // Create calendar slot (enforced no-overlap by EXCLUDE indexes)
    // calendar_slots.status_check allows only reserved/cancelled/completed
    const slotRes = await client.query(
      `INSERT INTO public.calendar_slots (master_id, salon_id, start_at, end_at, status, request_id)
       VALUES ($1,$2,$3,$4,'reserved',$5)
       RETURNING id`,
      [masterId, salonId, startIso, endIso, idempotencyKey]
    );
    const calendarSlotId = slotRes.rows[0].id;

    // Create booking (DB trigger will validate service & fill price_snapshot)
    const bookingRes = await client.query(
      `INSERT INTO public.bookings
         (salon_id, salon_slug, master_id, start_at, end_at, status, request_id, calendar_slot_id, client_id, service_id)
       VALUES
         ($1,$2,$3,$4,$5,'reserved',$6,$7,$8,$9)
       RETURNING *`,
      [salonId, salon_slug.trim(), masterId, startIso, endIso, idempotencyKey, calendarSlotId, client_id ?? null, serviceId]
    );

    await client.query("COMMIT");
    return res.json({ ok: true, booking: bookingRes.rows[0] });

  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}

    // Map common DB constraint signals
    const code = err?.code;
    const constraint = err?.constraint;
    const msg = (err?.message || "").toString();

    console.error("BOOKING_V2_CREATE_ERROR:", {
      message: err?.message,
      code: err?.code,
      detail: err?.detail,
      constraint: err?.constraint,
      stack: err?.stack
    });

    // Exclusion violation (overlap) often = 23P01
    if (code === "23P01") return res.status(409).json({ ok: false, error: "SLOT_UNAVAILABLE" });

    // Unique violation for request_id
    if (code === "23505" && (constraint === "calendar_request_id_uidx" || constraint === "calendar_slots_request_id_uq" || msg.includes("request_id"))) {
      // idempotency race: return existing booking if created
      try {
        const r = await pool.query(
          `SELECT * FROM public.bookings WHERE request_id=$1 LIMIT 1`,
          [idempotencyKey]
        );
        if (r.rows.length) return res.json({ ok: true, booking: r.rows[0], idempotent: true });
      } catch {}
      return res.status(409).json({ ok: false, error: "IDEMPOTENCY_CONFLICT" });
    }

    // Trigger exceptions from enforce_booking_service_insert()
    if (msg.includes("SERVICE_REQUIRED")) return res.status(400).json({ ok: false, error: "SERVICE_REQUIRED" });
    if (msg.includes("SERVICE_NOT_FOUND")) return res.status(400).json({ ok: false, error: "SERVICE_NOT_FOUND" });
    if (msg.includes("SERVICE_INACTIVE")) return res.status(400).json({ ok: false, error: "SERVICE_INACTIVE" });
    if (msg.includes("SERVICE_SALON_MISMATCH")) return res.status(400).json({ ok: false, error: "SERVICE_SALON_MISMATCH" });

    return res.status(400).json({ ok: false, error: "CREATE_BOOKING_FAILED" });
  } finally {
    client.release();
  }
});

/* ================= CONFIRM ================= */

app.post("/bookings/:id/confirm", requireAuth, async (req, res) => {
  const pool = getPool();
  const bookingId = Number.parseInt(req.params.id, 10);
  const idempotencyKey = req.headers["idempotency-key"];

  if (!idempotencyKey)
    return res.status(400).json({ ok: false, error: "IDEMPOTENCY_KEY_REQUIRED" });

  const client = await pool.connect();

  try {
    const gate = await enforceBookingSalonAccess(client, req.auth, bookingId);
    if (!gate.ok) return res.status(gate.code).json({ ok: false, error: gate.error });

    await client.query("BEGIN");

    await client.query(
      `UPDATE public.bookings SET status='confirmed' WHERE id=$1`,
      [bookingId]
    );

    await client.query("COMMIT");
    return res.json({ ok: true, status: "confirmed" });

  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}

    console.error("CONFIRM_ERROR:", {
      message: err?.message,
      code: err?.code,
      detail: err?.detail,
      constraint: err?.constraint,
      stack: err?.stack
    });

    return res.status(400).json({ ok: false, error: "CONFIRM_FAILED" });
  } finally {
    client.release();
  }
});

/* ================= CANCEL ================= */

app.post("/bookings/:id/cancel", requireAuth, async (req, res) => {
  const pool = getPool();
  const bookingId = Number.parseInt(req.params.id, 10);
  const idempotencyKey = req.headers["idempotency-key"];

  if (!idempotencyKey)
    return res.status(400).json({ ok: false, error: "IDEMPOTENCY_KEY_REQUIRED" });

  const client = await pool.connect();

  try {
    const gate = await enforceBookingSalonAccess(client, req.auth, bookingId);
    if (!gate.ok) return res.status(gate.code).json({ ok: false, error: gate.error });

    await client.query("BEGIN");

    await client.query(
      `UPDATE public.bookings SET status='canceled' WHERE id=$1`,
      [bookingId]
    );

    await client.query("COMMIT");
    return res.json({ ok: true, status: "canceled" });

  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}

    console.error("CANCEL_ERROR:", {
      message: err?.message,
      code: err?.code,
      detail: err?.detail,
      constraint: err?.constraint,
      stack: err?.stack
    });

    return res.status(400).json({ ok: false, error: "CANCEL_FAILED" });
  } finally {
    client.release();
  }
});

/* ================= SERVICES V2 ================= */

app.post("/services", requireAuth, async (req, res) => {
  if (req.auth.role !== "salon_admin")
    return res.status(403).json({ ok: false, error: "ROLE_FORBIDDEN" });

  const { salon_id, name, duration_min, price } = req.body;

  if (!salon_id || !name || !duration_min || price === undefined)
    return res.status(400).json({ ok: false, error: "INVALID_PAYLOAD" });

  const pool = getPool();
  const client = await pool.connect();

  try {
    const allowed = await canAccessSalon(client, req.auth.user_id, req.auth.role, salon_id);
    if (!allowed)
      return res.status(403).json({ ok: false, error: "SALON_ACCESS_DENIED" });

    const r = await client.query(
      `INSERT INTO public.services_v2 (salon_id, name, duration_min, price)
       VALUES ($1,$2,$3,$4)
       RETURNING *`,
      [salon_id, name, duration_min, price]
    );

    return res.json({ ok: true, service: r.rows[0] });

  } catch (err) {
    return res.status(400).json({ ok: false, error: "CREATE_SERVICE_FAILED" });
  } finally {
    client.release();
  }
});

app.get("/services/:salonId", requireAuth, async (req, res) => {
  const salonId = parseInt(req.params.salonId, 10);

  const pool = getPool();
  const client = await pool.connect();

  try {
    const allowed = await canAccessSalon(client, req.auth.user_id, req.auth.role, salonId);
    if (!allowed)
      return res.status(403).json({ ok: false, error: "SALON_ACCESS_DENIED" });

    const r = await client.query(
      `SELECT * FROM public.services_v2
       WHERE salon_id=$1 AND is_active=true`,
      [salonId]
    );

    return res.json({ ok: true, services: r.rows });

  } finally {
    client.release();
  }
});

app.patch("/services/:id", requireAuth, async (req, res) => {
  if (req.auth.role !== "salon_admin")
    return res.status(403).json({ ok: false, error: "ROLE_FORBIDDEN" });

  const serviceId = parseInt(req.params.id, 10);
  const { name, duration_min, price } = req.body;

  const pool = getPool();
  const client = await pool.connect();

  try {
    const s = await client.query(
      `SELECT salon_id FROM public.services_v2 WHERE id=$1`,
      [serviceId]
    );

    if (!s.rows.length)
      return res.status(404).json({ ok: false, error: "SERVICE_NOT_FOUND" });

    const salonId = s.rows[0].salon_id;

    const allowed = await canAccessSalon(client, req.auth.user_id, req.auth.role, salonId);
    if (!allowed)
      return res.status(403).json({ ok: false, error: "SALON_ACCESS_DENIED" });

    await client.query(
      `UPDATE public.services_v2
       SET name=$1, duration_min=$2, price=$3
       WHERE id=$4`,
      [name, duration_min, price, serviceId]
    );

    return res.json({ ok: true });

  } catch {
    return res.status(400).json({ ok: false, error: "UPDATE_FAILED" });
  } finally {
    client.release();
  }
});

app.post("/services/:id/deactivate", requireAuth, async (req, res) => {
  if (req.auth.role !== "salon_admin")
    return res.status(403).json({ ok: false, error: "ROLE_FORBIDDEN" });

  const serviceId = parseInt(req.params.id, 10);

  const pool = getPool();
  const client = await pool.connect();

  try {
    const s = await client.query(
      `SELECT salon_id FROM public.services_v2 WHERE id=$1`,
      [serviceId]
    );

    if (!s.rows.length)
      return res.status(404).json({ ok: false, error: "SERVICE_NOT_FOUND" });

    const salonId = s.rows[0].salon_id;

    const allowed = await canAccessSalon(client, req.auth.user_id, req.auth.role, salonId);
    if (!allowed)
      return res.status(403).json({ ok: false, error: "SALON_ACCESS_DENIED" });

    await client.query(
      `UPDATE public.services_v2
       SET is_active=false
       WHERE id=$1`,
      [serviceId]
    );

    return res.json({ ok: true });

  } finally {
    client.release();
  }
});

const PORT = 8080;
app.listen(PORT, () => {
  console.log("Server running on port:", PORT);
});
