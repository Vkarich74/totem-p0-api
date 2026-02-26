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

/* ================= MY SALONS ================= */

app.get("/my-salons", requireAuth, async (req, res) => {
  try {
    const pool = getPool();
    const userId = req.auth.user_id;
    const role = req.auth.role;

    let salons = [];

    if (role === "master") {
      const result = await pool.query(
        `
        SELECT s.id AS salon_id, s.slug, ms.status
        FROM masters m
        JOIN master_salon ms ON ms.master_id = m.id
        JOIN salons s ON s.id = ms.salon_id
        WHERE m.user_id = $1
        `,
        [userId]
      );

      salons = result.rows.map((r) => ({
        salon_id: r.salon_id,
        slug: r.slug,
        role: "master",
        status: r.status
      }));
    }

    if (role === "owner") {
      const result = await pool.query(
        `
        SELECT s.id AS salon_id, s.slug, os.status
        FROM owner_salon os
        JOIN salons s ON s.id = os.salon_id
        WHERE os.owner_id = $1
        `,
        [String(userId)]
      );

      salons = salons.concat(
        result.rows.map((r) => ({
          salon_id: r.salon_id,
          slug: r.slug,
          role: "owner",
          status: r.status
        }))
      );
    }

    return res.status(200).json({
      ok: true,
      user_id: userId,
      salons
    });
  } catch (err) {
    console.error("MY_SALONS_ERROR", err.message);
    return res.status(500).json({
      ok: false,
      error: "MY_SALONS_FAILED"
    });
  }
});

/* ================= DEFAULT SALON ================= */

app.patch("/me/default-salon", requireAuth, async (req, res) => {
  try {
    const pool = getPool();
    const userId = req.auth.user_id;
    const userIdText = String(userId);

    const slug = String(req.body?.slug || "").trim();
    if (!slug) {
      return res.status(400).json({ ok: false, error: "SLUG_REQUIRED" });
    }

    const access = await pool.query(
      `
      SELECT 1
      FROM masters m
      JOIN master_salon ms ON ms.master_id = m.id
      JOIN salons s ON s.id = ms.salon_id
      WHERE m.user_id = $1 AND s.slug = $2 AND ms.status = 'active'
      UNION
      SELECT 1
      FROM owner_salon os
      JOIN salons s ON s.id = os.salon_id
      WHERE os.owner_id = $3 AND s.slug = $2 AND os.status = 'active'
      LIMIT 1
      `,
      [userId, slug, userIdText]
    );

    if (access.rowCount === 0) {
      return res.status(403).json({ ok: false, error: "SLUG_NOT_ALLOWED" });
    }

    await pool.query(
      `
      INSERT INTO user_default_salon (user_id, default_salon_slug)
      VALUES ($1, $2)
      ON CONFLICT (user_id)
      DO UPDATE SET
        default_salon_slug = EXCLUDED.default_salon_slug,
        updated_at = now()
      `,
      [userId, slug]
    );

    return res.status(200).json({ ok: true, default_salon_slug: slug });
  } catch (err) {
    console.error("DEFAULT_SALON_ERROR", err.message);
    return res.status(500).json({ ok: false, error: "DEFAULT_SALON_FAILED" });
  }
});

/* ================= STAGE 4: CREATE PAYMENT INTENT ================= */

app.post("/s/:slug/payment-intent", resolveTenant, requireAuth, async (req, res) => {
  try {
    const pool = getPool();
    const { booking_id } = req.body;

    if (!booking_id) {
      return res.status(400).json({ ok: false, error: "BOOKING_ID_REQUIRED" });
    }

    const bookingRes = await pool.query(
      `
      SELECT id, price_snapshot, status
      FROM bookings
      WHERE id = $1 AND salon_id = $2
      `,
      [booking_id, req.tenant.salon_id]
    );

    if (bookingRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: "BOOKING_NOT_FOUND" });
    }

    const booking = bookingRes.rows[0];

    if (booking.status !== "reserved") {
      return res.status(400).json({ ok: false, error: "BOOKING_NOT_PAYABLE" });
    }

    if (!booking.price_snapshot) {
      return res.status(400).json({ ok: false, error: "NO_PRICE_SNAPSHOT" });
    }

    const intent = await pool.query(
      `
      INSERT INTO payment_intents (booking_id, request_id, amount, currency, status)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING intent_id
      `,
      [
        booking_id,
        booking_id,
        booking.price_snapshot,
        "KGS",
        "created"
      ]
    );

    return res.status(200).json({
      ok: true,
      intent_id: intent.rows[0].intent_id
    });

  } catch (err) {
    console.error("CREATE_PAYMENT_INTENT_ERROR", err.message);
    return res.status(500).json({ ok: false, error: "INTENT_FAILED" });
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

    if (!master_id || !start_at || !end_at || !calendar_slot_id || !request_id) {
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