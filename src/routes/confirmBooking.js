import crypto from "crypto";
import pkg from "pg";

const { Pool } = pkg;

// NOTE: Keep pool creation local to this module to avoid changing boot sequence.
// This route must never block app.listen().
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function jsonStableStringify(obj) {
  // Deterministic hash for idempotency: stable keys ordering.
  if (obj === null || obj === undefined) return "null";
  if (typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(jsonStableStringify).join(",")}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${jsonStableStringify(obj[k])}`)
    .join(",")}}`;
}

function mustInternalAuth(req) {
  // Production-safe: do NOT expose confirm without an internal key.
  // If key is not configured, route is effectively disabled.
  const required = String(process.env.INTERNAL_API_KEY || "").trim();
  const provided = String(req.headers["x-internal-key"] || "").trim();

  if (!required) return { ok: false, code: 503, error: "INTERNAL_API_KEY_NOT_CONFIGURED" };
  if (!provided) return { ok: false, code: 401, error: "INTERNAL_KEY_REQUIRED" };
  if (provided !== required) return { ok: false, code: 403, error: "INTERNAL_KEY_INVALID" };
  return { ok: true };
}

export async function confirmBooking(req, res) {
  const auth = mustInternalAuth(req);
  if (!auth.ok) return res.status(auth.code).json({ ok: false, error: auth.error });

  const bookingId = String(req.params.id || "").trim();
  const idempotencyKey = String(req.headers["idempotency-key"] || "").trim();
  const actorType = String(req.body?.actor_type ? req.body.actor_type : "system").trim() || "system";

  if (!bookingId) return res.status(400).json({ ok: false, error: "BOOKING_ID_REQUIRED" });
  if (!idempotencyKey) return res.status(400).json({ ok: false, error: "IDEMPOTENCY_KEY_REQUIRED" });

  // Use stable stringify so identical bodies hash identically across clients.
  const rawBody = jsonStableStringify(req.body || {});
  const requestHash = crypto.createHash("sha256").update(rawBody).digest("hex");

  const client = await pool.connect();

  try {
    // 1) Fast idempotency hit (outside txn is OK, but we still use the same connection).
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
        return res.status(409).json({ ok: false, error: "IDEMPOTENCY_KEY_CONFLICT" });
      }

      if (row.response_code && row.response_body) {
        return res.status(row.response_code).json(row.response_body);
      }

      return res.status(409).json({ ok: false, error: "IDEMPOTENCY_IN_PROGRESS" });
    }

    await client.query("BEGIN");

    // 2) Reserve idempotency key (within txn).
    try {
      await client.query(
        `INSERT INTO public.api_idempotency_keys (idempotency_key, endpoint, request_hash)
         VALUES ($1, $2, $3)`,
        [idempotencyKey, "confirm_booking", requestHash]
      );
    } catch (e) {
      // Another request raced us: resolve deterministically.
      const again = await client.query(
        `SELECT request_hash, response_code, response_body
           FROM public.api_idempotency_keys
          WHERE idempotency_key = $1
          LIMIT 1`,
        [idempotencyKey]
      );

      if (again.rows.length > 0) {
        const r = again.rows[0];
        if (r.request_hash !== requestHash) {
          await client.query("ROLLBACK");
          return res.status(409).json({ ok: false, error: "IDEMPOTENCY_KEY_CONFLICT" });
        }
        if (r.response_code && r.response_body) {
          await client.query("ROLLBACK");
          return res.status(r.response_code).json(r.response_body);
        }
      }

      await client.query("ROLLBACK");
      return res.status(409).json({ ok: false, error: "IDEMPOTENCY_IN_PROGRESS" });
    }

    // 3) Actor in session var (safe). Available only inside this txn.
    await client.query(`SET LOCAL app.actor_type = $1`, [actorType]);

    // 4) Lock booking row and inspect status.
    const booking = await client.query(
      `SELECT id, status
         FROM public.bookings
        WHERE id = $1
        FOR UPDATE`,
      [bookingId]
    );

    if (booking.rows.length === 0) {
      const responseBody = { ok: false, error: "BOOKING_NOT_FOUND" };
      await client.query(
        `UPDATE public.api_idempotency_keys
            SET response_code = 404,
                response_body = $2
          WHERE idempotency_key = $1`,
        [idempotencyKey, responseBody]
      );
      await client.query("COMMIT");
      return res.status(404).json(responseBody);
    }

    const currentStatus = String(booking.rows[0].status || "").trim();

    // 5) Idempotent success on already confirmed.
    if (currentStatus === "confirmed") {
      const responseBody = { ok: true, status: "already_confirmed" };
      await client.query(
        `UPDATE public.api_idempotency_keys
            SET response_code = 200,
                response_body = $2
          WHERE idempotency_key = $1`,
        [idempotencyKey, responseBody]
      );
      await client.query("COMMIT");
      return res.status(200).json(responseBody);
    }

    // 6) Only reserved can be confirmed.
    if (currentStatus !== "reserved") {
      const responseBody = { ok: false, error: "INVALID_STATUS", status: currentStatus };
      await client.query(
        `UPDATE public.api_idempotency_keys
            SET response_code = 409,
                response_body = $2
          WHERE idempotency_key = $1`,
        [idempotencyKey, responseBody]
      );
      await client.query("COMMIT");
      return res.status(409).json(responseBody);
    }

    // 7) HARD RULE (core-compatible): confirm requires a confirmed payment.
    // Match DB trigger semantics: it checks payments.status='confirmed' (not is_active).
    const payAny = await client.query(
      `SELECT EXISTS(
          SELECT 1
            FROM public.payments
           WHERE booking_id = $1
             AND status = 'confirmed'
        ) AS has_confirmed`,
      [bookingId]
    );

    const hasConfirmed = Boolean(payAny.rows?.[0]?.has_confirmed);

    if (!hasConfirmed) {
      const responseBody = { ok: false, error: "PAYMENT_REQUIRED" };
      await client.query(
        `UPDATE public.api_idempotency_keys
            SET response_code = 409,
                response_body = $2
          WHERE idempotency_key = $1`,
        [idempotencyKey, responseBody]
      );
      await client.query("COMMIT");
      return res.status(409).json(responseBody);
    }

    // 8) DB-enforced confirm (triggers validate transitions).
    try {
      await client.query(
        `UPDATE public.bookings
            SET status = 'confirmed',
                confirmed_at = NOW()
          WHERE id = $1`,
        [bookingId]
      );
    } catch (e) {
      const responseBody = { ok: false, error: "CONFIRM_FAILED", details: e.message };
      await client.query(
        `UPDATE public.api_idempotency_keys
            SET response_code = 400,
                response_body = $2
          WHERE idempotency_key = $1`,
        [idempotencyKey, responseBody]
      );
      await client.query("COMMIT");
      return res.status(400).json(responseBody);
    }

    const responseBody = { ok: true, status: "confirmed" };
    await client.query(
      `UPDATE public.api_idempotency_keys
          SET response_code = 200,
              response_body = $2
        WHERE idempotency_key = $1`,
      [idempotencyKey, responseBody]
    );

    await client.query("COMMIT");
    return res.status(200).json(responseBody);
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {}
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR", details: err.message });
  } finally {
    client.release();
  }
}