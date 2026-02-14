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

/* ================= INTEGRITY HEALTH ================= */

app.get("/integrity/health", async (req, res) => {
  const pool = getPool();
  const client = await pool.connect();

  try {
    const r = await client.query(`
      SELECT COUNT(*)::int AS violations
      FROM public.v_financial_integrity_check
    `);

    const violations = r.rows[0].violations;

    if (violations === 0) {
      return res.json({
        ok: true,
        status: "ok",
        integrity_rows: 0,
        checked_at: new Date().toISOString()
      });
    }

    return res.status(500).json({
      ok: false,
      status: "broken",
      integrity_rows: violations,
      checked_at: new Date().toISOString()
    });

  } catch (err) {
    console.error("INTEGRITY_HEALTH_ERROR:", err);
    return res.status(500).json({
      ok: false,
      status: "error",
      error: "INTEGRITY_CHECK_FAILED"
    });
  } finally {
    client.release();
  }
});

/* ================= BOOKING ENGINE V2 ================= */

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

  if (!Number.isInteger(salonId) || salonId <= 0)
    return res.status(400).json({ ok: false, error: "INVALID_SALON_ID" });

  if (!Number.isInteger(masterId) || masterId <= 0)
    return res.status(400).json({ ok: false, error: "INVALID_MASTER_ID" });

  if (!Number.isInteger(serviceId) || serviceId <= 0)
    return res.status(400).json({ ok: false, error: "SERVICE_REQUIRED" });

  const startIso = parseIsoDate(start_at);
  const endIso = parseIsoDate(end_at);

  if (!startIso || !endIso || new Date(startIso) >= new Date(endIso))
    return res.status(400).json({ ok: false, error: "INVALID_TIME_RANGE" });

  const client = await pool.connect();

  try {
    const allowedSalon = await canAccessSalon(client, req.auth.user_id, req.auth.role, salonId);
    if (!allowedSalon)
      return res.status(403).json({ ok: false, error: "SALON_ACCESS_DENIED" });

    const masterGate = await ensureMasterAllowedForBooking(client, req.auth, salonId, masterId);
    if (!masterGate.ok)
      return res.status(masterGate.code).json({ ok: false, error: masterGate.error });

    await client.query("BEGIN");

    const existingBooking = await client.query(
      `SELECT * FROM public.bookings WHERE request_id = $1 LIMIT 1`,
      [idempotencyKey]
    );

    if (existingBooking.rows.length) {
      await client.query("COMMIT");
      return res.json({ ok: true, booking: existingBooking.rows[0], idempotent: true });
    }

    const slotRes = await client.query(
      `INSERT INTO public.calendar_slots (master_id, salon_id, start_at, end_at, status, request_id)
       VALUES ($1,$2,$3,$4,'reserved',$5)
       RETURNING id`,
      [masterId, salonId, startIso, endIso, idempotencyKey]
    );

    const calendarSlotId = slotRes.rows[0].id;

    const bookingRes = await client.query(
      `INSERT INTO public.bookings
       (salon_id, salon_slug, master_id, start_at, end_at, status, request_id, calendar_slot_id, client_id, service_id)
       VALUES ($1,$2,$3,$4,$5,'reserved',$6,$7,$8,$9)
       RETURNING *`,
      [salonId, salon_slug?.trim(), masterId, startIso, endIso, idempotencyKey, calendarSlotId, client_id ?? null, serviceId]
    );

    await client.query("COMMIT");
    return res.json({ ok: true, booking: bookingRes.rows[0] });

  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    return res.status(400).json({ ok: false, error: "CREATE_BOOKING_FAILED" });
  } finally {
    client.release();
  }
});

/* ================= PORT ================= */

const PORT = 8080;
app.listen(PORT, () => {
  console.log("Server running on port:", PORT);
});
