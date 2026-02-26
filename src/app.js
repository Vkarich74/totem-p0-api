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

app.get("/health", (req, res) => {
  res.status(200).json({ ok: true });
});

/* ================= REFUND ENDPOINT ================= */

app.post("/s/:slug/refund", resolveTenant, requireAuth, async (req, res) => {
  const client = await getPool().connect();

  try {
    const { payment_id } = req.body;

    if (!payment_id) {
      return res.status(400).json({ ok: false, error: "PAYMENT_ID_REQUIRED" });
    }

    await client.query("BEGIN");

    const paymentRes = await client.query(
      `
      SELECT p.id
      FROM payments p
      JOIN bookings b ON b.id = p.booking_id
      WHERE p.id = $1
        AND b.salon_id = $2
      FOR UPDATE
      `,
      [payment_id, req.tenant.salon_id]
    );

    if (paymentRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, error: "PAYMENT_NOT_FOUND" });
    }

    const refundRes = await client.query(
      `
      SELECT id, status
      FROM payment_refunds
      WHERE payment_id = $1
      FOR UPDATE
      `,
      [payment_id]
    );

    if (refundRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ ok: false, error: "REFUND_NOT_EXISTS" });
    }

    if (refundRes.rows[0].status === "succeeded") {
      await client.query("ROLLBACK");
      return res.status(400).json({ ok: false, error: "REFUND_ALREADY_SUCCEEDED" });
    }

    await client.query(
      `
      UPDATE payment_refunds
      SET status = 'succeeded'
      WHERE payment_id = $1
      `,
      [payment_id]
    );

    await client.query("COMMIT");

    return res.status(200).json({ ok: true });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("REFUND_ERROR", err.message);
    return res.status(500).json({ ok: false, error: "REFUND_FAILED" });
  } finally {
    client.release();
  }
});

/* ================= PORT ================= */

const PORT = process.env.PORT || 8080;

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port:", PORT);
});