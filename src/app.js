import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import crypto from "crypto";
import pkg from "pg";

import { resolveAuth } from "./middleware/resolveAuth.js";
import { resolveTenant } from "./middleware/resolveTenant.js";
import { pool } from "./db.js";

const app = express();
app.set("trust proxy", 1);

/* ================= CORS ================= */

const allowedOrigins = [
  "https://totem-platform.odoo.com",
  "https://www.totemv.com",
  "https://totemv.com",
  "https://app.totemv.com",
  "http://localhost:5173"
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true
  })
);

app.use(express.json());
app.use(cookieParser());

/* ================= OBSERVABILITY ================= */

app.use((req, res, next) => {
  const start = Date.now();
  const requestId = crypto.randomUUID();
  req.request_id = requestId;
  res.setHeader("x-request-id", requestId);

  res.on("finish", () => {
    const latency = Date.now() - start;
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      request_id: requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      latency_ms: latency
    }));
  });

  next();
});

/* ================= ROOT ================= */

app.get("/", (req, res) => res.status(200).send("OK"));
app.get("/health", (req, res) => res.status(200).json({ ok: true }));

/* ================= PUBLIC SALON ================= */

app.get("/public/salons/:slug", resolveTenant, async (req, res) => {
  try {
    const { salon_id } = req.tenant;

    const { rows } = await pool.query(
      `
      SELECT
        id,
        slug,
        name,
        slogan,
        enabled,
        status,
        description,
        logo_url,
        cover_url,
        city,
        phone
      FROM salons
      WHERE id = $1
      `,
      [salon_id]
    );

    if (!rows.length) {
      return res.status(404).json({ ok: false });
    }

    return res.json({ ok: true, salon: rows[0] });
  } catch (err) {
    console.error("PUBLIC_SALON_RESOLVE_ERROR", err.message);
    return res.status(500).json({ ok: false });
  }
});

/* ================= METRICS ================= */

app.get("/public/salons/:slug/metrics", resolveTenant, async (req, res) => {
  try {
    const { salon_id } = req.tenant;

    // bookings_count
    const bookingsRes = await pool.query(
      `SELECT COUNT(*)::int AS bookings_count
       FROM bookings
       WHERE salon_id = $1`,
      [salon_id]
    );

    const bookings_count = bookingsRes.rows[0]?.bookings_count ?? 0;

    // revenue_total (all time, confirmed + active)
    const revenueTotalRes = await pool.query(
      `
      SELECT COALESCE(SUM(p.amount), 0)::int AS revenue_total
      FROM payments p
      JOIN bookings b ON b.id = p.booking_id
      WHERE b.salon_id = $1
        AND p.status = 'confirmed'
        AND p.is_active = true
      `,
      [salon_id]
    );

    const revenue_total = revenueTotalRes.rows[0]?.revenue_total ?? 0;

    // revenue_30d (confirmed + active, last 30 days)
    const revenue30dRes = await pool.query(
      `
      SELECT COALESCE(SUM(p.amount), 0)::int AS revenue_30d
      FROM payments p
      JOIN bookings b ON b.id = p.booking_id
      WHERE b.salon_id = $1
        AND p.status = 'confirmed'
        AND p.is_active = true
        AND p.created_at >= NOW() - INTERVAL '30 days'
      `,
      [salon_id]
    );

    const revenue_30d = revenue30dRes.rows[0]?.revenue_30d ?? 0;

    const avg_check =
      bookings_count > 0
        ? Math.round((revenue_total / bookings_count) * 100) / 100
        : 0;

    return res.json({
      ok: true,
      metrics: {
        bookings_count,
        revenue_total,
        revenue_30d,
        avg_check
      }
    });

  } catch (err) {
    console.error("PUBLIC_SALON_METRICS_ERROR", err.message);
    return res.status(500).json({ ok: false });
  }
});

/* ================= PORT ================= */

const PORT = process.env.PORT || 8080;

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port:", PORT);
});