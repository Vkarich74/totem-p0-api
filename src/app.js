import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import pkg from "pg";

import { resolveAuth } from "./middleware/resolveAuth.js";
import { resolveTenant } from "./middleware/resolveTenant.js";

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

/* ================= AUTH ================= */

app.use(resolveAuth);

function requireAuth(req, res, next) {
  if (!req.auth) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }
  next();
}

/* ================= ROOT ================= */

app.get("/", (req, res) => {
  res.status(200).send("OK");
});

/* ================= HEALTH ================= */

app.get("/health", (req, res) => {
  res.status(200).json({ ok: true });
});

/* ================= ENSURE PERSONAL SALON ================= */

app.post("/ensure-personal-salon", requireAuth, async (req, res) => {
  const pool = getPool();
  const client = await pool.connect();

  try {
    if (req.auth.role !== "master") {
      return res.status(403).json({ ok: false, error: "ONLY_MASTER_ALLOWED" });
    }

    await client.query("BEGIN");

    const masterResult = await client.query(
      "SELECT id, slug FROM masters WHERE user_id = $1 LIMIT 1",
      [req.auth.user_id]
    );

    if (masterResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, error: "MASTER_NOT_FOUND" });
    }

    const master = masterResult.rows[0];

    const existingSalon = await client.query(
      `
      SELECT s.id, s.slug
      FROM salons s
      JOIN master_salon ms ON ms.salon_id = s.id
      WHERE ms.master_id = $1
      AND s.slug = $2
      LIMIT 1
      `,
      [master.id, master.slug]
    );

    if (existingSalon.rowCount > 0) {
      await client.query("COMMIT");
      return res.status(200).json({
        ok: true,
        slug: existingSalon.rows[0].slug,
        created: false
      });
    }

    const salonInsert = await client.query(
      `
      INSERT INTO salons (slug, name)
      VALUES ($1, $2)
      RETURNING id
      `,
      [master.slug, master.slug]
    );

    const salonId = salonInsert.rows[0].id;

    await client.query(
      `
      INSERT INTO master_salon (master_id, salon_id, status)
      VALUES ($1, $2, 'active')
      `,
      [master.id, salonId]
    );

    await client.query(
      `
      INSERT INTO owner_salon (owner_id, salon_id, status)
      VALUES ($1, $2, 'active')
      `,
      [String(req.auth.user_id), salonId]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      ok: true,
      slug: master.slug,
      created: true
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("ENSURE_PERSONAL_SALON_ERROR", err.message);
    return res.status(500).json({
      ok: false,
      error: "ENSURE_FAILED"
    });
  } finally {
    client.release();
  }
});

/* ================= STAGE 2: MULTI-TENANT ================= */

app.get("/s/:slug", resolveTenant, (req, res) => {
  return res.status(200).json({ ok: true, tenant: req.tenant });
});

/* ================= STAGE 3: REAL BOOKING INSERT ================= */

app.post("/s/:slug/booking", resolveTenant, requireAuth, async (req, res) => {
  try {
    const pool = getPool();

    const {
      master_id,
      start_at,
      end_at,
      calendar_slot_id,
      request_id,
      service_id,
      price_snapshot
    } = req.body;

    if (
      !master_id ||
      !start_at ||
      !end_at ||
      !calendar_slot_id ||
      !request_id
    ) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_REQUIRED_FIELDS"
      });
    }

    const result = await pool.query(
      `
      INSERT INTO bookings (
        salon_id,
        salon_slug,
        master_id,
        start_at,
        end_at,
        request_id,
        calendar_slot_id,
        client_id,
        service_id,
        price_snapshot
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING id
      `,
      [
        req.tenant.salon_id,
        req.tenant.slug,
        master_id,
        start_at,
        end_at,
        request_id,
        calendar_slot_id,
        req.auth.user_id,
        service_id,
        price_snapshot || null
      ]
    );

    return res.status(200).json({
      ok: true,
      booking_id: result.rows[0].id
    });

  } catch (err) {
    console.error("BOOKING_INSERT_ERROR", err.message);

    if (err.code === "23505") {
      return res.status(409).json({
        ok: false,
        error: "DUPLICATE_REQUEST_ID"
      });
    }

    return res.status(500).json({
      ok: false,
      error: "BOOKING_FAILED"
    });
  }
});

/* ================= PLACEHOLDERS ================= */

app.get("/s/:slug/calendar", resolveTenant, requireAuth, async (req, res) => {
  return res.status(200).json({ ok: true, route: "CALENDAR_ACTIVE", tenant: req.tenant });
});

app.get("/s/:slug/reports", resolveTenant, requireAuth, async (req, res) => {
  return res.status(200).json({ ok: true, route: "REPORTS_ACTIVE", tenant: req.tenant });
});

app.get("/s/:slug/owner", resolveTenant, requireAuth, async (req, res) => {
  return res.status(200).json({ ok: true, route: "OWNER_ACTIVE", tenant: req.tenant });
});

/* ================= LEGACY ================= */

app.post("/bookings/v2", requireAuth, async (req, res) => {
  return res.status(200).json({
    ok: true,
    route: "BOOKING_ACTIVE",
    auth: req.auth
  });
});

/* ================= GLOBAL ERROR ================= */

app.use((err, req, res, next) => {
  console.error("GLOBAL_ERROR", err?.message);
  return res.status(500).json({
    ok: false,
    error: "INTERNAL_SERVER_ERROR"
  });
});

/* ================= PORT ================= */

const PORT = process.env.PORT || 8080;

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port:", PORT);
});