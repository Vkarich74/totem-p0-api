import { pool } from "../db.js";
import crypto from "crypto";

export async function publicCreateBooking(req, res) {
  const client = await pool.connect();

  try {
    const idempotencyKey = String(req.headers["idempotency-key"] || "").trim();

    if (!idempotencyKey) {
      return res.status(400).json({ ok: false, error: "IDEMPOTENCY_KEY_REQUIRED" });
    }

    const rawBody = JSON.stringify(req.body || {});
    const requestHash = crypto.createHash("sha256").update(rawBody).digest("hex");

    const { master_id, service_id, start_at, client_id } = req.body;

    if (!master_id || !service_id || !start_at) {
      return res.status(400).json({ ok: false, error: "MISSING_FIELDS" });
    }

    await client.query("BEGIN");

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
        await client.query("ROLLBACK");
        return res.status(409).json({ ok: false, error: "IDEMPOTENCY_KEY_CONFLICT" });
      }

      if (row.response_code && row.response_body) {
        await client.query("ROLLBACK");
        return res.status(row.response_code).json(row.response_body);
      }

      await client.query("ROLLBACK");
      return res.status(409).json({ ok: false, error: "IDEMPOTENCY_IN_PROGRESS" });
    }

    await client.query(
      `INSERT INTO public.api_idempotency_keys (idempotency_key, endpoint, request_hash)
       VALUES ($1, $2, $3)`,
      [idempotencyKey, "public_create_booking", requestHash]
    );

    const serviceRes = await client.query(
      `SELECT duration_min, price, salon_id
       FROM public.services_v2
       WHERE id = $1 AND is_active = true`,
      [service_id]
    );

    if (serviceRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ ok: false, error: "SERVICE_NOT_FOUND" });
    }

    const { duration_min, price, salon_id } = serviceRes.rows[0];

    const masterRes = await client.query(
      `SELECT id
       FROM public.master_salon
       WHERE master_id = $1 AND salon_id = $2`,
      [master_id, salon_id]
    );

    if (masterRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ ok: false, error: "MASTER_NOT_IN_SALON" });
    }

    const endAtRes = await client.query(
      `SELECT ($1::timestamptz + ($2 || ' minutes')::interval) AS end_at`,
      [start_at, duration_min]
    );

    const end_at = endAtRes.rows[0].end_at;

    const slotInsert = await client.query(
      `INSERT INTO public.calendar_slots
       (master_id, salon_id, start_at, end_at, status, request_id)
       VALUES ($1, $2, $3, $4, 'reserved', $5)
       RETURNING id`,
      [master_id, salon_id, start_at, end_at, idempotencyKey]
    );

    const slot_id = slotInsert.rows[0].id;

    const bookingInsert = await client.query(
      `INSERT INTO public.bookings
       (salon_id, salon_slug, master_id, start_at, end_at, status, request_id,
        calendar_slot_id, client_id, service_id, price_snapshot)
       VALUES ($1, (SELECT slug FROM salons WHERE id = $1),
               $2, $3, $4, 'reserved', $5,
               $6, $7, $8, $9)
       RETURNING id`,
      [
        salon_id,
        master_id,
        start_at,
        end_at,
        idempotencyKey,
        slot_id,
        client_id || null,
        service_id,
        price
      ]
    );

    const booking_id = bookingInsert.rows[0].id;

    const responseBody = {
      ok: true,
      booking_id,
      status: "reserved"
    };

    await client.query(
      `UPDATE public.api_idempotency_keys
       SET response_code = 201,
           response_body = $2
       WHERE idempotency_key = $1`,
      [idempotencyKey, responseBody]
    );

    await client.query("COMMIT");

    return res.status(201).json(responseBody);

  } catch (err) {
    await client.query("ROLLBACK");

    if (err.code === "23P01") {
      return res.status(409).json({ ok: false, error: "TIME_SLOT_CONFLICT" });
    }

    if (err.code === "23505") {
      return res.status(409).json({ ok: false, error: "DUPLICATE_REQUEST" });
    }

    return res.status(500).json({ ok: false, error: err.message });
  } finally {
    client.release();
  }
}