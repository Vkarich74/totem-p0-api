import { pool } from "../db.js";
import crypto from "crypto";

function normalizeKgMobilePhone(value) {
  const raw = String(value || "").trim();
  const compact = raw.replace(/[\s\-()]/g, "");

  if (!compact) {
    return { ok: false, error: "PHONE_REQUIRED" };
  }

  let canonical = compact;

  if (/^996[0-9]{9}$/.test(compact)) {
    canonical = `+${compact}`;
  } else if (/^0[0-9]{9}$/.test(compact)) {
    canonical = `+996${compact.slice(1)}`;
  }

  if (!/^\+996[579][0-9]{8}$/.test(canonical)) {
    return { ok: false, error: "INVALID_KG_MOBILE_PHONE" };
  }

  return { ok: true, phone: canonical };
}

export async function publicCreateBooking(req, res) {
  const client = await pool.connect();

  try {
    const idempotencyKey = String(req.headers["idempotency-key"] || "").trim();

    if (!idempotencyKey) {
      return res.status(400).json({ ok: false, error: "IDEMPOTENCY_KEY_REQUIRED" });
    }

    const rawBody = JSON.stringify(req.body || {});
    const requestHash = crypto.createHash("sha256").update(rawBody).digest("hex");

    const { master_id, service_id, start_at, client_id, client_payload, client_name, phone } = req.body;
    const { slug } = req.params;

    if (!master_id || !service_id || !start_at) {
      return res.status(400).json({ ok: false, error: "MISSING_FIELDS" });
    }

    const rawClientPhone = client_payload?.phone ?? phone;
    const normalizedClientPhone = client_id
      ? { ok: true, phone: null }
      : normalizeKgMobilePhone(rawClientPhone);

    if (!normalizedClientPhone.ok) {
      return res.status(400).json({ ok: false, error: normalizedClientPhone.error });
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

    const salonRes = await client.query(
      `SELECT id, slug
       FROM public.salons
       WHERE slug = $1
       LIMIT 1`,
      [slug]
    );

    if (salonRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, error: "SALON_NOT_FOUND" });
    }

    const salonId = salonRes.rows[0].id;
    const salonSlug = salonRes.rows[0].slug;

    const serviceLinkRes = await client.query(
      `SELECT
         sms.id,
         sms.salon_id,
         sms.master_id,
         sms.service_pk,
         sms.price,
         sms.duration_min,
         sms.active
       FROM public.salon_master_services sms
       WHERE sms.id = $1
         AND sms.salon_id = $2
         AND sms.master_id = $3
         AND sms.active = true
       LIMIT 1`,
      [service_id, salonId, master_id]
    );

    if (serviceLinkRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ ok: false, error: "SERVICE_NOT_FOUND" });
    }

    const serviceLink = serviceLinkRes.rows[0];
    const durationMin = Number(serviceLink.duration_min);
    const price = Number(serviceLink.price);
    const servicePk = Number(serviceLink.service_pk);

    const masterRes = await client.query(
      `SELECT id
       FROM public.master_salon
       WHERE master_id = $1
         AND salon_id = $2
         AND status = 'active'
       LIMIT 1`,
      [master_id, salonId]
    );

    if (masterRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ ok: false, error: "MASTER_NOT_IN_SALON" });
    }

    const startDate = new Date(start_at);

    if (Number.isNaN(startDate.getTime())) {
      await client.query("ROLLBACK");
      return res.status(400).json({ ok: false, error: "INVALID_START_AT" });
    }

    const endAtRes = await client.query(
      `SELECT ($1::timestamptz + ($2 || ' minutes')::interval) AS end_at`,
      [start_at, durationMin]
    );

    const end_at = endAtRes.rows[0].end_at;

    let finalClientId = client_id || null;

    if (!finalClientId) {
      const safeName = String(client_payload?.name ?? client_name ?? "").trim() || "Клиент";
      const safePhone = normalizedClientPhone.phone;

      const existingClient = await client.query(
        `SELECT id
         FROM public.clients
         WHERE salon_id = $1
           AND phone = $2
         LIMIT 1`,
        [salonId, safePhone]
      );

      if (existingClient.rowCount > 0) {
        finalClientId = existingClient.rows[0].id;
      }

      if (!finalClientId) {
        const createdClient = await client.query(
          `INSERT INTO public.clients (salon_id, name, phone)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [salonId, safeName, safePhone]
        );

        finalClientId = createdClient.rows[0].id;
      }
    }

    const existingSlot = await client.query(
      `SELECT id
       FROM public.calendar_slots
       WHERE master_id = $1
         AND start_at = $2
         AND end_at = $3
       LIMIT 1`,
      [master_id, start_at, end_at]
    );

    let slot_id;

    if (existingSlot.rowCount > 0) {
      slot_id = existingSlot.rows[0].id;

      const existingBookingForSlot = await client.query(
        `SELECT id
         FROM public.bookings
         WHERE calendar_slot_id = $1
         LIMIT 1`,
        [slot_id]
      );

      if (existingBookingForSlot.rowCount > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({ ok: false, error: "TIME_SLOT_CONFLICT" });
      }
    } else {
      const slotInsert = await client.query(
        `INSERT INTO public.calendar_slots
         (master_id, salon_id, start_at, end_at, status, request_id)
         VALUES ($1, $2, $3, $4, 'reserved', $5)
         RETURNING id`,
        [master_id, salonId, start_at, end_at, idempotencyKey]
      );

      slot_id = slotInsert.rows[0].id;
    }

    const bookingInsert = await client.query(
      `INSERT INTO public.bookings
       (salon_id, salon_slug, master_id, start_at, end_at, status, request_id,
        calendar_slot_id, client_id, service_id, price_snapshot)
       VALUES ($1, $2, $3, $4, $5, 'reserved', $6,
               $7, $8, $9, $10)
       RETURNING id`,
      [
        salonId,
        salonSlug,
        master_id,
        start_at,
        end_at,
        idempotencyKey,
        slot_id,
        finalClientId,
        servicePk,
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
    try {
      await client.query("ROLLBACK");
    } catch (rollbackErr) {}

    if (err.code === "23P01") {
      return res.status(409).json({ ok: false, error: "TIME_SLOT_CONFLICT" });
    }

    if (err.code === "23505") {
      return res.status(409).json({ ok: false, error: "DUPLICATE_REQUEST" });
    }

    console.error("PUBLIC_CREATE_BOOKING_ERROR", err);
    return res.status(500).json({ ok: false, error: "BOOKING_CREATE_FAILED" });
  } finally {
    client.release();
  }
}