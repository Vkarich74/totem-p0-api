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

/* ================= REFUND ================= */

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

/* ================= RECONCILIATION ================= */

app.get(
  "/s/:slug/reconciliation/:payment_id",
  resolveTenant,
  requireAuth,
  async (req, res) => {
    try {
      const pool = getPool();
      const paymentId = Number(req.params.payment_id);

      if (!Number.isInteger(paymentId) || paymentId <= 0) {
        return res.status(400).json({ ok: false, error: "INVALID_PAYMENT_ID" });
      }

      const baseRes = await pool.query(
        `
        SELECT
          p.*,
          b.id AS booking_id,
          b.salon_id,
          b.master_id,
          b.status AS booking_status,
          b.request_id,
          b.price_snapshot,
          b.start_at,
          b.end_at,
          b.created_at AS booking_created_at,

          po.id AS payout_id,
          po.provider_amount,
          po.status AS payout_status,
          po.payout_batch_id,
          po.settlement_period_id,

          sp.status AS period_status,

          sb.status AS batch_status,

          pr.id AS refund_id,
          pr.status AS refund_status,
          pr.amount AS refund_amount
        FROM payments p
        JOIN bookings b ON b.id = p.booking_id
        LEFT JOIN payouts po ON po.payment_id = p.id
        LEFT JOIN settlement_periods sp ON sp.id = po.settlement_period_id
        LEFT JOIN settlement_payout_batches sb ON sb.id = po.payout_batch_id
        LEFT JOIN payment_refunds pr ON pr.payment_id = p.id
        WHERE p.id = $1
          AND b.salon_id = $2
        `,
        [paymentId, req.tenant.salon_id]
      );

      if (baseRes.rowCount === 0) {
        return res.status(404).json({ ok: false, error: "NOT_FOUND" });
      }

      const ledgerRes = await pool.query(
        `
        SELECT *
        FROM totem_test.ledger_entries
        WHERE reference_id IN (
          SELECT id::text FROM public.payouts WHERE payment_id = $1
        )
        OR reference_id IN (
          SELECT id::text FROM public.payment_refunds WHERE payment_id = $1
        )
        ORDER BY created_at
        `,
        [paymentId]
      );

      const net = ledgerRes.rows.reduce((acc, row) => {
        const amt = Number(row.amount_cents) || 0;
        if (row.direction === "credit") return acc + amt;
        if (row.direction === "debit") return acc - amt;
        return acc;
      }, 0);

      return res.status(200).json({
        ok: true,
        chain: baseRes.rows[0],
        ledger_entries: ledgerRes.rows,
        net_delta_cents: net
      });

    } catch (err) {
      console.error("RECONCILIATION_ERROR", err.message);
      return res.status(500).json({ ok: false, error: "RECONCILIATION_FAILED" });
    }
  }
);

/* ================= PORT ================= */

const PORT = process.env.PORT || 8080;

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port:", PORT);
});