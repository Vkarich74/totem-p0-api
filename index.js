// index.js — DATA_HARDENING PATCH
import express from "express";
import crypto from "crypto";

import publicRoutes from "./routes/public.js";
import ownerRoutes from "./routes/owner.js";
import db from "./db.js";

const app = express();

/* ===== CORS ===== */
const ALLOWED_ORIGINS = ["https://totem-platform.odoo.com"];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-System-Token"
  );
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; }
}));

/* ===== HEALTH ===== */
app.get("/health", (_, res) => res.json({ ok: true }));

/* ===== ROUTES ===== */
app.use("/public", publicRoutes);
app.use("/owner", ownerRoutes);

/* ===== SIGNATURE ===== */
function verifySignature(rawBody, signature, secret) {
  const digest = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  if (!signature || signature.length !== digest.length) return false;
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

/* ===== PAYMENT WEBHOOK ===== */
async function paymentWebhookHandler(req, res) {
  try {
    const secret = process.env.PAYMENT_WEBHOOK_SECRET || "";
    const signature = req.headers["x-payment-signature"];
    if (!secret || !verifySignature(req.rawBody, signature, secret)) {
      return res.status(400).json({ error: "INVALID_SIGNATURE" });
    }

    const { event, booking_id, amount, currency, provider } = req.body || {};
    if (!event || !booking_id || !amount || !currency) {
      return res.status(400).json({ error: "INVALID_INPUT" });
    }

    if (currency !== "KGS") {
      return res.status(400).json({ error: "INVALID_CURRENCY" });
    }

    const total = Number(amount.total);
    if (!Number.isInteger(total) || total < 0) {
      return res.status(400).json({ error: "INVALID_AMOUNT" });
    }

    const booking = await db.get(
      "SELECT id, status FROM bookings WHERE id = $1",
      [booking_id]
    );
    if (!booking) {
      return res.status(404).json({ error: "BOOKING_NOT_FOUND" });
    }

    const targetStatus =
      event === "payment.succeeded" ? "paid" : "payment_failed";

    if (booking.status === targetStatus) {
      return res.json({ ok: true });
    }

    await db.run(
      `INSERT INTO payments (booking_id, provider, status, amount, currency, created_at)
       VALUES ($1,$2,$3,$4,$5,datetime('now'))`,
      [booking_id, provider || "unknown", targetStatus === "paid" ? "succeeded" : "failed", total, currency]
    );

    await db.run(
      "UPDATE bookings SET status = $1 WHERE id = $2",
      [targetStatus, booking_id]
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error("[PAYMENT_WEBHOOK_ERROR]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
}

app.post("/system/payment/webhook", paymentWebhookHandler);

/* ===== STUB ===== */
app.post("/system/payment/stub", async (req, res) => {
  const payload = {
    event: req.body.result === "success" ? "payment.succeeded" : "payment.failed",
    booking_id: req.body.booking_id,
    amount: { total: 0 },
    currency: "KGS",
    provider: "stub"
  };
  const rawBody = Buffer.from(JSON.stringify(payload));
  const signature = crypto
    .createHmac("sha256", process.env.PAYMENT_WEBHOOK_SECRET || "")
    .update(rawBody).digest("hex");

  await paymentWebhookHandler(
    { rawBody, body: payload, headers: { "x-payment-signature": signature } },
    res
  );
});

/* ===== 404 ===== */
app.use((_, res) => res.status(404).json({ error: "not_found" }));

/* ===== START ===== */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`TOTEM API listening on ${PORT}`));
