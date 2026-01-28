import express from "express";
import db from "../db/index.js";

const router = express.Router();

// универсальный executor — БЕЗ ГАДАНИЯ
function exec(query, params) {
  if (typeof db.query === "function") {
    return db.query(query, params);
  }
  if (db.pool && typeof db.pool.query === "function") {
    return db.pool.query(query, params);
  }
  if (db.client && typeof db.client.query === "function") {
    return db.client.query(query, params);
  }
  throw new Error("NO_DB_QUERY_METHOD");
}

router.post("/payouts/preview", async (req, res) => {
  try {
    const { booking_id } = req.body;

    if (typeof booking_id !== "number") {
      return res.status(400).json({ error: "invalid_booking_id" });
    }

    // payment must be succeeded
    const paymentResult = await exec(
      `
      SELECT id, amount_total
      FROM payments
      WHERE booking_id = $1
        AND status = 'succeeded'
      ORDER BY id DESC
      LIMIT 1
      `,
      [booking_id]
    );

    if (!paymentResult.rows || paymentResult.rows.length === 0) {
      return res.status(404).json({ error: "payment_not_succeeded" });
    }

    // payout must not exist
    const payoutResult = await exec(
      `
      SELECT id
      FROM payouts
      WHERE booking_id = $1
      LIMIT 1
      `,
      [booking_id]
    );

    if (payoutResult.rows && payoutResult.rows.length > 0) {
      return res.status(409).json({ error: "already_paid" });
    }

    return res.json({
      ok: true,
      booking_id,
      amount: paymentResult.rows[0].amount_total
    });

  } catch (err) {
    console.error("PAYOUT_PREVIEW_FATAL", err);
    return res.status(500).json({
      error: "fatal",
      message: err.message
    });
  }
});

export default router;
