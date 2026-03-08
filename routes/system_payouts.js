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

    const b = await client.query(
      `SELECT id, status FROM bookings WHERE id=$1 FOR UPDATE`,
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

    const exists = await client.query(
      `SELECT id FROM payouts WHERE booking_id=$1`,
      [booking_id]
    );

    if (exists.rowCount) {
      await client.query("ROLLBACK");
      return res.json({ ok: true, noop: true, payout_id: exists.rows[0].id });
    }

    let payment = await client.query(
      `SELECT id, amount FROM payments
       WHERE booking_id=$1 AND is_active=true AND status='confirmed'
       LIMIT 1`,
      [booking_id]
    );

    if (!payment.rowCount) {
      const amount = 0;

      const pIns = await client.query(
        `
        INSERT INTO payments
          (booking_id, amount, provider, status, is_active)
        VALUES
          ($1, $2, 'system', 'confirmed', true)
        RETURNING id, amount
        `,
        [booking_id, amount]
      );
      payment = { rows: [pIns.rows[0]], rowCount: 1 };
    }

    const gross = payment.rows[0].amount;
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
        payment.rows[0].id,
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

// ------------------------------------------------------
// POST /system/payouts/commit
// Body: { payout_id: string }
// ------------------------------------------------------
router.post("/commit", async (req, res) => {

  const { payout_id } = req.body;
  if (!payout_id) return res.status(400).json({ error: "payout_id_required" });

  const client = await pool.connect();

  try {

    await client.query("BEGIN");

    const payout = await client.query(
      `
      SELECT
        p.*,
        b.salon_id
      FROM payouts p
      JOIN bookings b ON b.id=p.booking_id
      WHERE p.id=$1
      FOR UPDATE
      `,
      [payout_id]
    );

    if (!payout.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "payout_not_found" });
    }

    const p = payout.rows[0];

    if (p.status === "executed") {
      await client.query("ROLLBACK");
      return res.json({ ok: true, noop: true, payout_id: p.id });
    }

    const wallet = await client.query(
      `
      SELECT id
      FROM totem_test.wallets
      WHERE owner_type='salon'
      AND owner_id=$1
      LIMIT 1
      `,
      [p.salon_id]
    );

    if (!wallet.rowCount) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "wallet_not_found" });
    }

    const walletId = wallet.rows[0].id;

    // WALLET BALANCE CHECK
    const balance = await client.query(
      `
      SELECT computed_balance_cents
      FROM totem_test.v_wallet_balance_computed
      WHERE wallet_id=$1
      `,
      [walletId]
    );

    const currentBalance = balance.rowCount
      ? Number(balance.rows[0].computed_balance_cents)
      : 0;

    if (currentBalance < Number(p.provider_amount)) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "INSUFFICIENT_WALLET_BALANCE",
        balance: currentBalance,
        required: p.provider_amount
      });
    }

    await client.query(
      `
      INSERT INTO totem_test.ledger_entries
        (wallet_id, direction, amount_cents, reference_type, reference_id)
      VALUES
        ($1,'debit',$2,'payout',$3)
      `,
      [walletId, p.provider_amount, String(p.id)]
    );

    await client.query(
      `
      UPDATE payouts
      SET status='executed'
      WHERE id=$1
      `,
      [payout_id]
    );

    await client.query("COMMIT");

    res.json({
      ok: true,
      payout_id: p.id,
      debited: p.provider_amount
    });

  } catch (e) {

    await client.query("ROLLBACK");
    console.error("[SYSTEM PAYOUT COMMIT]", e);

    res.status(500).json({
      error: "payout_commit_failed"
    });

  } finally {

    client.release();

  }

});

export default router;