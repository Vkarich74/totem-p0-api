import crypto from "crypto";
import pkg from "pg";

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function jsonStableStringify(obj) {
  if (obj === null || obj === undefined) return "null";
  if (typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(jsonStableStringify).join(",")}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${jsonStableStringify(obj[k])}`)
    .join(",")}}`;
}

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

export async function completeBooking(req, res) {
  const auth = mustInternalAuth(req);
  if (!auth.ok)
    return res.status(auth.code).json({ ok: false, error: auth.error });

  const bookingId = Number(req.params.id);
  const idempotencyKey = String(req.headers["idempotency-key"] || "").trim();

  if (!Number.isFinite(bookingId) || bookingId <= 0)
    return res.status(400).json({ ok: false, error: "BOOKING_ID_INVALID" });

  if (!idempotencyKey)
    return res.status(400).json({ ok: false, error: "IDEMPOTENCY_KEY_REQUIRED" });

  const rawBody = jsonStableStringify(req.body || {});
  const requestHash = crypto.createHash("sha256").update(rawBody).digest("hex");

  const client = await pool.connect();

  try {
    const existing = await client.query(
      `SELECT request_hash, response_code, response_body
         FROM public.api_idempotency_keys
        WHERE idempotency_key = $1
        LIMIT 1`,
      [idempotencyKey]
    );

    if (existing.rows.length > 0) {
      const row = existing.rows[0];

      if (row.request_hash !== requestHash) {
        return res
          .status(409)
          .json({ ok: false, error: "IDEMPOTENCY_KEY_CONFLICT" });
      }

      if (row.response_code && row.response_body) {
        return res.status(row.response_code).json(row.response_body);
      }

      return res
        .status(409)
        .json({ ok: false, error: "IDEMPOTENCY_IN_PROGRESS" });
    }

    await client.query("BEGIN");

    await client.query(
      `INSERT INTO public.api_idempotency_keys (idempotency_key, endpoint, request_hash)
       VALUES ($1, $2, $3)`,
      [idempotencyKey, "complete_booking", requestHash]
    );

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

    const row = booking.rows[0];

    if (row.status === "completed") {
      await client.query("COMMIT");
      return res.status(200).json({ ok: true, status: "already_completed" });
    }

    if (row.status !== "confirmed") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        ok: false,
        error: "INVALID_STATUS",
        status: row.status,
      });
    }

    const amount = Number(row.price_snapshot);
    if (!Number.isFinite(amount) || amount <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ ok: false, error: "INVALID_AMOUNT" });
    }

    // deactivate previous active payments
    await client.query(
      `UPDATE public.payments
          SET is_active = false
        WHERE booking_id = $1
          AND is_active = true`,
      [bookingId]
    );

    // 1️⃣ insert as pending
    const paymentInsert = await client.query(
      `INSERT INTO public.payments
       (booking_id, amount, provider, status, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [bookingId, amount, "internal", "pending", true]
    );

    const paymentId = paymentInsert.rows[0].id;

    // 2️⃣ update to confirmed (this triggers payout)
    await client.query(
      `UPDATE public.payments
          SET status = 'confirmed'
        WHERE id = $1`,
      [paymentId]
    );

    await client.query(
      `UPDATE public.bookings
          SET status = 'completed'
        WHERE id = $1`,
      [bookingId]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      ok: true,
      status: "completed",
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