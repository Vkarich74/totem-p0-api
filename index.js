import express from "express";
import crypto from "crypto";

import publicRoutes from "./routes/public.js";
import ownerRoutes from "./routes/owner.js";
import db from "./db.js";

const app = express();

/**
 * =========================
 * CORS — Odoo SaaS allowlist
 * =========================
 */
const ALLOWED_ORIGINS = [
  "https://totem-platform.odoo.com"
];

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

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

// ===== HEALTH =====
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// ===== ROUTES =====
app.use("/public", publicRoutes);
app.use("/owner", ownerRoutes);

/**
 * ==================================================
 * SYSTEM: SIGNATURE VERIFY
 * ==================================================
 */
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

/**
 * ==================================================
 * SYSTEM: PAYMENT WEBHOOK
 * POST /system/payment/webhook
 * ==================================================
 */
async function paymentWebhookHandler(req, res) {
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

    if (
      !Number.isInteger(base) ||
      !Number.isInteger(tips) ||
      !Number.isInteger(total)
    ) {
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
      return res.json({ ok: true });
    }

    const paymentStatus =
      event === "payment.succeeded" ? "succeeded" : "failed";
    const bookingStatus =
      paymentStatus === "succeeded" ? "paid" : "payment_failed";

    await db.run(
      `INSERT INTO payments
       (payment_id, booking_id, amount_total, amount_base, amount_tips, currency, status, provider)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        payment_id,
        booking_id,
        total,
        base,
        tips,
        currency,
        paymentStatus,
        provider || null
      ]
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

app.post("/system/payment/webhook", paymentWebhookHandler);

/**
 * ==================================================
 * SYSTEM: PAYMENT PROVIDER STUB
 * POST /system/payment/stub
 * ==================================================
 */
app.post("/system/payment/stub", async (req, res) => {
  try {
    const { booking_id, result } = req.body || {};

    if (!booking_id || !["success", "failed"].includes(result)) {
      return res.status(400).json({ error: "INVALID_INPUT" });
    }

    const event =
      result === "success"
        ? "payment.succeeded"
        : "payment.failed";

    const payload = {
      event,
      payment_id: `stub_${booking_id}`,
      booking_id: Number(booking_id),
      amount: {
        base: 0,
        tips: 0,
        total: 0
      },
      currency: "KGS",
      provider: "stub",
      occurred_at: new Date().toISOString()
    };

    const rawBody = Buffer.from(JSON.stringify(payload));

    const signature = crypto
      .createHmac("sha256", process.env.PAYMENT_WEBHOOK_SECRET || "")
      .update(rawBody)
      .digest("hex");

    const fakeReq = {
      headers: {
        "x-payment-signature": signature
      },
      rawBody,
      body: payload
    };

    const fakeRes = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.data = data;
        return this;
      }
    };

    await paymentWebhookHandler(fakeReq, fakeRes);

    return res.json({
      ok: true,
      stub: true,
      forwarded_event: event
    });
  } catch (err) {
    console.error("[PAYMENT_STUB_ERROR]", err);
    return res.status(500).json({ error: "STUB_INTERNAL_ERROR" });
  }
});

// ===== 404 =====
app.use((req, res) => {
  res.status(404).json({ error: "not_found" });
});

// ===== START =====
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`TOTEM API listening on ${PORT}`);
});
