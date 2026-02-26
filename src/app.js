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

/* ================= RECONCILIATION ENDPOINT ================= */

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

      // 1) Base chain: payment -> booking -> payout -> batch -> refund -> period
      const baseRes = await pool.query(
        `
        SELECT
          p.id                 AS payment_id,
          p.booking_id         AS payment_booking_id,
          p.amount             AS payment_amount,
          p.provider           AS payment_provider,
          p.status             AS payment_status,
          p.is_active          AS payment_is_active,
          p.created_at         AS payment_created_at,
          p.updated_at         AS payment_updated_at,

          b.id                 AS booking_id,
          b.salon_id           AS booking_salon_id,
          b.salon_slug         AS booking_salon_slug,
          b.master_id          AS booking_master_id,
          b.status             AS booking_status,
          b.request_id         AS booking_request_id,
          b.price_snapshot     AS booking_price_snapshot,
          b.start_at           AS booking_start_at,
          b.end_at             AS booking_end_at,
          b.created_at         AS booking_created_at,
          b.updated_at         AS booking_updated_at,

          po.id                AS payout_id,
          po.status            AS payout_status,
          po.payment_id        AS payout_payment_id,
          po.booking_id        AS payout_booking_id,
          po.gross_amount      AS payout_gross_amount,
          po.platform_fee      AS payout_platform_fee,
          po.provider_amount   AS payout_provider_amount,
          po.settlement_period_id AS payout_settlement_period_id,
          po.payout_batch_id   AS payout_batch_id,
          po.created_at        AS payout_created_at,

          sp.id                AS period_id,
          sp.status            AS period_status,
          sp.period_start      AS period_start,
          sp.period_end        AS period_end,

          sb.id                AS batch_id,
          sb.status            AS batch_status,
          sb.total_gross       AS batch_total_gross,
          sb.total_platform_fee AS batch_total_platform_fee,
          sb.total_provider_amount AS batch_total_provider_amount,
          sb.paid_at           AS batch_paid_at,
          sb.created_at        AS batch_created_at,

          pr.id                AS refund_id,
          pr.status            AS refund_status,
          pr.amount            AS refund_amount,
          pr.created_at        AS refund_created_at,
          pr.updated_at        AS refund_updated_at,
          pr.finalized_at      AS refund_finalized_at
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

      const base = baseRes.rows[0];

      // 2) finance_events: for this refund_id + payment-type events for same salon/master/amount window (best-effort)
      const financeRes = await pool.query(
        `
        SELECT *
        FROM public.finance_events
        WHERE (refund_id = $1)
           OR (type = 'payment' AND salon_id = $2::text)
        ORDER BY created_at ASC
        `,
        [base.refund_id || null, String(req.tenant.salon_id)]
      );

      // 3) ledger_entries for payout and refund ids (reference_id is text)
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
        ORDER BY created_at ASC
        `,
        [paymentId]
      );

      // 4) Net delta across returned entries (credit - debit)
      const net = ledgerRes.rows.reduce((acc, row) => {
        const amt = Number(row.amount_cents) || 0;
        if (row.direction === "credit") return acc + amt;
        if (row.direction === "debit") return acc - amt;
        return acc;
      }, 0);

      return res.status(200).json({
        ok: true,
        tenant: req.tenant,
        payment_id: paymentId,
        chain: base,
        finance_events: financeRes.rows,
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