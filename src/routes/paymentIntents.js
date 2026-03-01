import crypto from "crypto";
import pkg from "pg";

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function mustInternalAuth(req) {
  const required = String(process.env.INTERNAL_API_KEY || "").trim();
  const provided = String(req.headers["x-internal-key"] || "").trim();

  if (!required)
    return { ok: false, code: 503, error: "INTERNAL_API_KEY_NOT_CONFIGURED" };

  if (!provided)
    return { ok: false, code: 401, error: "INTERNAL_KEY_REQUIRED" };

  if (provided !== required)
    return { ok: false, code: 403, error: "INTERNAL_KEY_INVALID" };

  return { ok: true };
}

function requireIdempotency(req) {
  const key = String(req.headers["idempotency-key"] || "").trim();
  if (!key)
    return { ok: false, code: 400, error: "IDEMPOTENCY_KEY_REQUIRED" };
  return { ok: true, key };
}

function randomInt31() {
  const n = crypto.randomBytes(4).readUInt32BE(0);
  return (n & 0x7fffffff) || 1;
}

/**
 * POST /internal/bookings/:id/payment-intent
 * Creates payment_intents row bound to booking.
 */
export async function createPaymentIntent(req, res) {
  const auth = mustInternalAuth(req);
  if (!auth.ok)
    return res.status(auth.code).json({ ok: false, error: auth.error });

  const idem = requireIdempotency(req);
  if (!idem.ok)
    return res.status(idem.code).json({ ok: false, error: idem.error });

  const bookingId = Number(req.params.id);

  if (!Number.isFinite(bookingId) || bookingId <= 0)
    return res.status(400).json({ ok: false, error: "BOOKING_ID_INVALID" });

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const booking = await client.query(
      `SELECT id, status, price_snapshot
         FROM public.bookings
        WHERE id = $1
        FOR UPDATE`,
      [bookingId]
    );

    if (booking.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, error: "BOOKING_NOT_FOUND" });
    }

    const status = String(booking.rows[0].status || "").trim();

    if (status !== "reserved") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        ok: false,
        error: "INVALID_STATUS",
        status,
      });
    }

    const amount = Number(booking.rows[0].price_snapshot);

    if (!Number.isFinite(amount) || amount <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ ok: false, error: "AMOUNT_REQUIRED" });
    }

    const requestId = randomInt31();

    const result = await client.query(
      `INSERT INTO public.payment_intents
       (request_id, amount, currency, status, booking_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING intent_id, status`,
      [requestId, amount, "KGS", "created", bookingId]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      ok: true,
      intent_id: result.rows[0].intent_id,
      status: result.rows[0].status,
    });

  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR",
      details: err.message,
    });
  } finally {
    client.release();
  }
}

/**
 * POST /internal/payment-intents/:intent_id/confirm
 * Confirms intent → creates payment → confirms booking
 */
export async function confirmPaymentIntent(req, res) {
  const auth = mustInternalAuth(req);
  if (!auth.ok)
    return res.status(auth.code).json({ ok: false, error: auth.error });

  const intentId = Number(req.params.intent_id);

  if (!Number.isFinite(intentId) || intentId <= 0)
    return res.status(400).json({ ok: false, error: "INTENT_ID_INVALID" });

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const intent = await client.query(
      `SELECT intent_id, booking_id, amount, status
         FROM public.payment_intents
        WHERE intent_id = $1
        FOR UPDATE`,
      [intentId]
    );

    if (intent.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, error: "PAYMENT_INTENT_NOT_FOUND" });
    }

    const row = intent.rows[0];

    if (row.status === "confirmed") {
      await client.query("ROLLBACK");
      return res.status(200).json({ ok: true, status: "already_confirmed" });
    }

    await client.query(
      `UPDATE public.payment_intents
          SET status = 'confirmed'
        WHERE intent_id = $1`,
      [intentId]
    );

    // deactivate previous active payments
    await client.query(
      `UPDATE public.payments
          SET is_active = false
        WHERE booking_id = $1
          AND is_active = true`,
      [row.booking_id]
    );

    const payInsert = await client.query(
      `INSERT INTO public.payments
       (booking_id, amount, provider, status, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [row.booking_id, row.amount, "internal", "pending", true]
    );

    const paymentId = payInsert.rows[0].id;

    await client.query(
      `UPDATE public.payments
          SET status = 'confirmed'
        WHERE id = $1`,
      [paymentId]
    );

    await client.query(
      `UPDATE public.bookings
          SET status = 'confirmed',
              confirmed_at = NOW()
        WHERE id = $1
          AND status = 'reserved'`,
      [row.booking_id]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      ok: true,
      intent_id: intentId,
      payment_id: paymentId,
    });

  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR",
      details: err.message,
    });
  } finally {
    client.release();
  }
}