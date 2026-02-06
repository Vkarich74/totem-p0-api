import express from "express";
import crypto from "crypto";
import db from "../db.js";

const router = express.Router();

function verifySignature(rawBody, signature, secret) {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(rawBody);
  const digest = hmac.digest("hex");

  if (!signature || signature.length !== digest.length) return false;

  return crypto.timingSafeEqual(
    Buffer.from(digest),
    Buffer.from(signature)
  );
}

// путь ТОЛЬКО "/"
router.post(
  "/",
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString("utf8");
    }
  }),
  async (req, res) => {
    try {
      const secret = process.env.PAYMENT_WEBHOOK_SECRET || "";
      const signature = req.headers["x-payment-signature"];

      if (!secret || !verifySignature(req.rawBody, signature, secret)) {
        return res.status(400).json({ error: "INVALID_SIGNATURE" });
      }

      const {
        event,
        payment_id,
        booking_id,
        amount,
        currency,
        provider,
        occurred_at
      } = req.body || {};

      if (!event || !payment_id || !booking_id || !amount || !currency) {
        return res.status(400).json({ error: "INVALID_INPUT" });
      }

      if (currency !== "KGS") {
        return res.status(400).json({ error: "INVALID_CURRENCY" });
      }

      const base = Number(amount.base || 0);
      const tips = Number(amount.tips || 0);
      const total = Number(amount.total);

      if (!Number.isInteger(base) || !Number.isInteger(tips) || !Number.isInteger(total)) {
        return res.status(400).json({ error: "AMOUNT_NOT_INTEGER" });
      }
      if (base < 0 || tips < 0 || total < 0 || base + tips !== total) {
        return res.status(400).json({ error: "INVALID_AMOUNT" });
      }

      try {
        await db.run(
          `INSERT INTO payment_events (payment_id, event, occurred_at)
           VALUES ($1, $2, $3)`,
          [payment_id, event, occurred_at || new Date().toISOString()]
        );
      } catch {
        return res.status(409).json({ error: "DUPLICATE_EVENT" });
      }

      const booking = await db.get(
        `SELECT id, status FROM bookings WHERE id = $1`,
        [booking_id]
      );

      if (!booking) {
        return res.status(404).json({ error: "BOOKING_NOT_FOUND" });
      }

      if (["paid", "payment_failed", "expired"].includes(booking.status)) {
        return res.status(200).json({ ok: true });
      }

      const paymentStatus = event === "payment.succeeded" ? "succeeded" : "failed";
      const bookingStatus = paymentStatus === "succeeded" ? "paid" : "payment_failed";

      await db.run(
        `INSERT INTO payments
         (payment_id, booking_id, amount_total, amount_base, amount_tips, currency, status, provider)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [payment_id, booking_id, total, base, tips, currency, paymentStatus, provider || null]
      );

      await db.run(
        `UPDATE bookings SET status = $1 WHERE id = $2`,
        [bookingStatus, booking_id]
      );

      return res.json({ ok: true });
    } catch (err) {
      console.error("[PAYMENT_WEBHOOK_ERROR]", err);
      return res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  }
);

export default router;
