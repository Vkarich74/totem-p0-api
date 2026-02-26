import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import crypto from "crypto";
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

/* ================= OBSERVABILITY ================= */

// request_id + latency + structured logging
app.use((req, res, next) => {
  const start = Date.now();
  const requestId = crypto.randomUUID();

  req.request_id = requestId;
  res.setHeader("x-request-id", requestId);

  res.on("finish", () => {
    const latency = Date.now() - start;

    const log = {
      ts: new Date().toISOString(),
      request_id: requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      latency_ms: latency,
      tenant_slug: req.params?.slug || null,
      user_id: req.auth?.user_id || null,
      ip: req.ip
    };

    console.log(JSON.stringify(log));
  });

  next();
});

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
          p.id AS payment_id,
          p.amount,
          p.status AS payment_status,
          p.is_active,
          p.created_at AS payment_created_at,
          p.updated_at AS payment_updated_at,

          b.id AS booking_id,
          b.salon_id,
          b.salon_slug,
          b.master_id,
          b.status AS booking_status,
          b.request_id,
          b.price_snapshot,
          b.start_at,
          b.end_at,
          b.created_at AS booking_created_at,

          po.id AS payout_id,
          po.status AS payout_status,
          po.gross_amount,
          po.platform_fee,
          po.provider_amount,
          po.settlement_period_id,
          po.payout_batch_id,
          po.created_at AS payout_created_at,

          sp.id AS period_id,
          sp.status AS period_status,
          sp.period_start,
          sp.period_end,
          sp.closed_at,

          sb.id AS batch_id,
          sb.status AS batch_status,
          sb.total_gross,
          sb.total_platform_fee,
          sb.total_provider_amount,
          sb.paid_at,
          sb.created_at AS batch_created_at,

          pr.id AS refund_id,
          pr.status AS refund_status,
          pr.amount AS refund_amount,
          pr.created_at AS refund_created_at,
          pr.updated_at AS refund_updated_at,
          pr.finalized_at
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
        ORDER BY created_at ASC
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