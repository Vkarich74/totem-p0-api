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

  if (Number.isInteger(user_id) && user_id > 0 && (role === "salon_admin" || role === "master")) {
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

app.use(resolveAuth);

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

app.get("/health", (req, res) => res.json({ ok: true }));

const PORT = 8080;
app.listen(PORT, () => {
  console.log("Server running on port:", PORT);
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



/* ================= CREATE BOOKING ================= */

app.post("/bookings", requireAuth, async (req, res) => {

  const { salon_id, service_id } = req.body;

  if (!salon_id || !service_id)
    return res.status(400).json({ ok: false, error: "SERVICE_REQUIRED" });

  const pool = getPool();
  const client = await pool.connect();

  try {
    const allowed = await canAccessSalon(
      client,
      req.auth.user_id,
      req.auth.role,
      salon_id
    );

    if (!allowed)
      return res.status(403).json({ ok: false, error: "SALON_ACCESS_DENIED" });

    const r = await client.query(
      `INSERT INTO public.bookings (salon_id, service_id, status)
       VALUES ($1,$2,'reserved')
       RETURNING *`,
      [salon_id, service_id]
    );

    return res.json({ ok: true, booking: r.rows[0] });

  } catch (err) {
    return res.status(400).json({ ok: false, error: "CREATE_BOOKING_FAILED" });
  } finally {
    client.release();
  }
});
