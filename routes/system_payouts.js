// routes/system_payouts.js
// Execute payouts for completed bookings
// AUTH: X-System-Token

import express from "express";
import { pool } from "../db/index.js";

const router = express.Router();

// auth
router.use((req, res, next) => {
  const token = req.header("X-System-Token");
  if (!token || token !== process.env.SYSTEM_TOKEN) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
});

// ------------------------------------------------------
// POST /system/payouts/execute
// Body: { booking_id: number }
// ------------------------------------------------------
router.post("/execute", async (req, res) => {
  const { booking_id } = req.body;
  if (!booking_id) return res.status(400).json({ error: "booking_id_required" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // booking must be completed
    const b = await client.query(
      `SELECT status FROM bookings WHERE id=$1 FOR UPDATE`,
      [booking_id]
    );
    if (!b.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "booking_not_found" });
    }
    if (b.rows[0].status !== "completed") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "invalid_booking_status",
        currentStatus: b.rows[0].status,
      });
    }

    // active confirmed payment
    const p = await client.query(
      `SELECT id, amount FROM payments
       WHERE booking_id=$1 AND is_active=true AND status='confirmed'
       LIMIT 1`,
      [booking_id]
    );
    if (!p.rowCount) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "confirmed_payment_not_found" });
    }

    // idempotency: payout already exists
    const exists = await client.query(
      `SELECT id FROM payouts WHERE booking_id=$1`,
      [booking_id]
    );
    if (exists.rowCount) {
      await client.query("ROLLBACK");
      return res.json({ ok: true, noop: true, payout_id: exists.rows[0].id });
    }

    // simple split: 100% provider for now
    const gross = p.rows[0].amount;
    const takeRateBps = 0;
    const platformFee = 0;
    const providerAmount = gross;

    const ins = await client.query(
      `
      INSERT INTO payouts
        (booking_id, payment_id, amount, status,
         gross_amount, take_rate_bps, platform_fee, provider_amount)
      VALUES
        ($1, $2, $3, 'created', $3, $4, $5, $6)
      RETURNING id
      `,
      [
        booking_id,
        p.rows[0].id,
        gross,
        takeRateBps,
        platformFee,
        providerAmount,
      ]
    );

    await client.query("COMMIT");
    return res.json({ ok: true, payout_id: ins.rows[0].id });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("[SYSTEM PAYOUT EXECUTE]", e);
    return res.status(500).json({ error: "internal_error" });
  } finally {
    client.release();
  }
});

export default router;
