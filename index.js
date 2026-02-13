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

function requireRole(roles) {
  const set = new Set(roles);
  return (req, res, next) => {
    if (!req.auth) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
    if (!set.has(req.auth.role)) return res.status(403).json({ ok: false, error: "FORBIDDEN" });
    next();
  };
}

async function canAccessSalon(client, user_id, role, salon_id) {
  if (!Number.isInteger(salon_id) || salon_id <= 0) return false;

  if (role === "salon_admin") {
    const q = `
      SELECT 1
      FROM public.owner_salon os
      WHERE os.owner_id = $1::text
        AND os.salon_id = $2
        AND os.status = 'active'
      LIMIT 1
    `;
    const r = await client.query(q, [user_id, salon_id]);
    return r.rowCount > 0;
  }

  if (role === "master") {
    const q = `
      SELECT 1
      FROM public.masters m
      JOIN public.master_salon ms ON ms.master_id = m.id
      WHERE m.user_id = $1
        AND ms.salon_id = $2
        AND ms.status = 'active'
      LIMIT 1
    `;
    const r = await client.query(q, [user_id, salon_id]);
    return r.rowCount > 0;
  }

  return false;
}

function requireSalonAccessFromParam(paramName) {
  return async (req, res, next) => {
    const salon_id = Number.parseInt((req.params[paramName] || "").toString(), 10);
    if (!req.auth) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });

    const pool = getPool();
    const client = await pool.connect();
    try {
      const ok = await canAccessSalon(client, req.auth.user_id, req.auth.role, salon_id);
      if (!ok) return res.status(403).json({ ok: false, error: "SALON_ACCESS_DENIED" });
      next();
    } catch (e) {
      console.error("SALON_ACCESS_CHECK_ERROR:", e);
      return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
    } finally {
      client.release();
    }
  };
}

async function getBookingSalonId(client, bookingId) {
  const q = `SELECT salon_id FROM public.bookings WHERE id = $1 LIMIT 1`;
  const r = await client.query(q, [bookingId]);
  if (!r.rows.length) return null;
  const v = r.rows[0].salon_id;
  const n = Number.parseInt(String(v), 10);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

async function enforceBookingSalonAccess(client, auth, bookingId) {
  const salonId = await getBookingSalonId(client, bookingId);
  if (!salonId) return { ok: false, code: 404, error: "BOOKING_NOT_FOUND" };

  const allowed = await canAccessSalon(client, auth.user_id, auth.role, salonId);
  if (!allowed) return { ok: false, code: 403, error: "SALON_ACCESS_DENIED" };

  return { ok: true, salon_id: salonId };
}

app.use(resolveAuth);

/* ================= ROUTES ================= */

app.get("/auth/resolve", (req, res) => {
  res.json({ ok: true, auth: req.auth });
});

app.get("/owner/ping", requireAuth, requireRole(["salon_admin"]), (req, res) => {
  res.json({ ok: true, user_id: req.auth.user_id, role: req.auth.role });
});

app.get("/owner/salons/:salonId/ping",
  requireAuth,
  requireRole(["salon_admin"]),
  requireSalonAccessFromParam("salonId"),
  (req, res) => res.json({ ok: true, salon_id: Number.parseInt(req.params.salonId, 10) })
);

app.get("/master/salons/:salonId/ping",
  requireAuth,
  requireRole(["master"]),
  requireSalonAccessFromParam("salonId"),
  (req, res) => res.json({ ok: true, salon_id: Number.parseInt(req.params.salonId, 10) })
);

/* ================= ACTOR HELPERS (kept simple) ================= */

function readActorFromHeaders(req) {
  const rawType =
    (req.headers["x-actor-type"] || req.headers["actor-type"] || "system")
      .toString()
      .trim()
      .toLowerCase();

  if (!["owner", "master", "system"].includes(rawType)) {
    return { ok: false, error: "INVALID_ACTOR_TYPE" };
  }

  const actorIdHeader = req.headers["x-actor-id"] || req.headers["actor-id"];
  const sourceHeader = req.headers["x-source"] || req.headers["source"];

  const actor_id = actorIdHeader ? actorIdHeader.toString().trim() : "";
  const source = sourceHeader ? sourceHeader.toString().trim() : "api";

  return { ok: true, actor_type: rawType, actor_id, source };
}

async function setActorLocals(client, actor) {
  const safeType = actor.actor_type.replace(/'/g, "");
  const safeId = (actor.actor_id || "").replace(/'/g, "");
  const safeSource = (actor.source || "api").replace(/'/g, "");

  await client.query(`SET LOCAL app.actor_type = '${safeType}'`);
  await client.query(`SET LOCAL app.actor_id = '${safeId}'`);
  await client.query(`SET LOCAL app.source = '${safeSource}'`);
}

/* ================= CONFIRM BOOKING (NOW GATED) ================= */

app.post("/bookings/:id/confirm", requireAuth, async (req, res) => {
  const pool = getPool();
  const bookingId = Number.parseInt(req.params.id, 10);
  const idempotencyKey = req.headers["idempotency-key"];

  if (!Number.isInteger(bookingId) || bookingId <= 0) {
    return res.status(400).json({ ok: false, error: "INVALID_BOOKING_ID" });
  }
  if (!idempotencyKey) {
    return res.status(400).json({ ok: false, error: "IDEMPOTENCY_KEY_REQUIRED" });
  }

  const actor = readActorFromHeaders(req);
  if (!actor.ok) return res.status(400).json({ ok: false, error: actor.error });

  const requestHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(req.body || {}))
    .digest("hex");

  const client = await pool.connect();

  try {
    // gate by booking.salon_id
    const gate = await enforceBookingSalonAccess(client, req.auth, bookingId);
    if (!gate.ok) return res.status(gate.code).json({ ok: false, error: gate.error });

    const existing = await client.query(
      `SELECT request_hash, response_code, response_body
       FROM public.api_idempotency_keys
       WHERE idempotency_key=$1
       LIMIT 1`,
      [idempotencyKey]
    );

    if (existing.rows.length) {
      const row = existing.rows[0];
      if (row.request_hash !== requestHash)
        return res.status(409).json({ ok: false, error: "IDEMPOTENCY_KEY_CONFLICT" });

      return res.status(row.response_code).json(row.response_body);
    }

    await client.query("BEGIN");
    await setActorLocals(client, actor);

    await client.query(
      `INSERT INTO public.api_idempotency_keys (idempotency_key, endpoint, request_hash)
       VALUES ($1,'confirm_booking',$2)`,
      [idempotencyKey, requestHash]
    );

    await client.query(
      `UPDATE public.bookings
       SET status='confirmed'
       WHERE id=$1`,
      [bookingId]
    );

    const response = { ok: true, status: "confirmed" };

    await client.query(
      `UPDATE public.api_idempotency_keys
       SET response_code=200, response_body=$2
       WHERE idempotency_key=$1`,
      [idempotencyKey, response]
    );

    await client.query("COMMIT");
    return res.json(response);

  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("CONFIRM_ERROR:", err);
    return res.status(400).json({ ok: false, error: "CONFIRM_FAILED" });
  } finally {
    client.release();
  }
});

/* ================= CANCEL BOOKING (NOW GATED) ================= */

app.post("/bookings/:id/cancel", requireAuth, async (req, res) => {
  const pool = getPool();
  const bookingId = Number.parseInt(req.params.id, 10);
  const idempotencyKey = req.headers["idempotency-key"];

  if (!Number.isInteger(bookingId) || bookingId <= 0) {
    return res.status(400).json({ ok: false, error: "INVALID_BOOKING_ID" });
  }
  if (!idempotencyKey) {
    return res.status(400).json({ ok: false, error: "IDEMPOTENCY_KEY_REQUIRED" });
  }

  const actor = readActorFromHeaders(req);
  if (!actor.ok) return res.status(400).json({ ok: false, error: actor.error });

  const requestHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(req.body || {}))
    .digest("hex");

  const client = await pool.connect();

  try {
    // gate by booking.salon_id
    const gate = await enforceBookingSalonAccess(client, req.auth, bookingId);
    if (!gate.ok) return res.status(gate.code).json({ ok: false, error: gate.error });

    const existing = await client.query(
      `SELECT request_hash, response_code, response_body
       FROM public.api_idempotency_keys
       WHERE idempotency_key=$1
       LIMIT 1`,
      [idempotencyKey]
    );

    if (existing.rows.length) {
      const row = existing.rows[0];
      if (row.request_hash !== requestHash)
        return res.status(409).json({ ok: false, error: "IDEMPOTENCY_KEY_CONFLICT" });

      return res.status(row.response_code).json(row.response_body);
    }

    await client.query("BEGIN");
    await setActorLocals(client, actor);

    await client.query(
      `INSERT INTO public.api_idempotency_keys (idempotency_key, endpoint, request_hash)
       VALUES ($1,'cancel_booking',$2)`,
      [idempotencyKey, requestHash]
    );

    await client.query(
      `UPDATE public.bookings
       SET status='canceled'
       WHERE id=$1`,
      [bookingId]
    );

    const response = { ok: true, status: "canceled" };

    await client.query(
      `UPDATE public.api_idempotency_keys
       SET response_code=200, response_body=$2
       WHERE idempotency_key=$1`,
      [idempotencyKey, response]
    );

    await client.query("COMMIT");
    return res.json(response);

  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("CANCEL_ERROR:", err);
    return res.status(400).json({ ok: false, error: "CANCEL_FAILED" });
  } finally {
    client.release();
  }
});

/* ================= HEALTH ================= */

app.get("/health", (req, res) => res.json({ ok: true }));

const PORT = 8080;
app.listen(PORT, () => {
  console.log("Server running on port:", PORT);
});
