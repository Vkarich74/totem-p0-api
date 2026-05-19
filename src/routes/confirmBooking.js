import crypto from "crypto";
import pkg from "pg";
import { createNotification } from "../services/notifications/notificationService.js";

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

async function loadBookingConfirmedNotificationContext(db, bookingId){
  const result = await db.query(`
SELECT
b.id,
b.salon_id,
s.slug AS salon_slug,
b.master_id,
m.slug AS master_slug,
b.client_id
FROM public.bookings b
LEFT JOIN public.salons s ON s.id = b.salon_id
LEFT JOIN public.masters m ON m.id = b.master_id
WHERE b.id = $1
LIMIT 1
`,[bookingId]);

  return result.rows[0] || null;
}

function buildBookingConfirmedActionUrl(context, targetType){
  if(targetType === "master" && String(context?.master_slug || "").trim()){
    return `#/master/${String(context.master_slug).trim()}/dashboard`;
  }

  if(targetType === "salon" && String(context?.salon_slug || "").trim()){
    return `#/salon/${String(context.salon_slug).trim()}/dashboard`;
  }

  return null;
}

async function emitBookingConfirmedNotification(poolLike, context, meta = {}){
  if(!poolLike || typeof poolLike.query !== "function"){
    return { ok: false, error: "POOL_REQUIRED" };
  }

  const bookingId = Number(context?.id ?? meta?.booking_id ?? 0) || null;
  const salonId = Number(context?.salon_id ?? meta?.salon_id ?? 0) || null;
  const masterId = Number(context?.master_id ?? meta?.master_id ?? 0) || null;
  const clientId = Number(context?.client_id ?? meta?.client_id ?? 0) || null;

  if(!bookingId || !salonId || !masterId || !clientId){
    return { ok: false, skipped: true, reason: "BOOKING_CONFIRMATION_CONTEXT_MISSING" };
  }

  const payloadJson = {
    booking_id: bookingId,
    salon_id: salonId,
    salon_slug: String(context?.salon_slug || meta?.salon_slug || "").trim() || null,
    master_id: masterId,
    client_id: clientId,
    source: String(meta?.source || "direct_confirm").trim() || "direct_confirm",
    payment_id: meta?.payment_id ?? null,
    qr_transaction_id: meta?.qr_transaction_id ?? null
  };

  const items = [
    {
      target_type: "client",
      target_id: String(clientId),
      owner_type: "salon",
      owner_id: salonId,
      channel: "in_app",
      priority: "normal",
      title_ru: "Запись подтверждена",
      body_ru: "Ваша запись подтверждена.",
      action_type: "booking",
      action_url: null,
      status: "sent",
      payload_json: payloadJson
    },
    {
      target_type: "master",
      target_id: String(masterId),
      owner_type: "salon",
      owner_id: salonId,
      channel: "in_app",
      priority: "normal",
      title_ru: "Запись подтверждена",
      body_ru: "Запись подтверждена.",
      action_type: "booking",
      action_url: buildBookingConfirmedActionUrl(context, "master"),
      status: "sent",
      payload_json: payloadJson
    },
    {
      target_type: "salon",
      target_id: String(salonId),
      owner_type: "salon",
      owner_id: salonId,
      channel: "in_app",
      priority: "normal",
      title_ru: "Запись подтверждена",
      body_ru: "Запись подтверждена.",
      action_type: "booking",
      action_url: buildBookingConfirmedActionUrl(context, "salon"),
      status: "sent",
      payload_json: payloadJson
    }
  ];

  for(const item of items){
    try{
      await createNotification(poolLike, item);
    }catch(error){
      console.error("BOOKING_CONFIRMED_NOTIFICATION_ERROR", {
        booking_id: bookingId,
        target_type: item.target_type,
        error: error?.message || error
      });
    }
  }

  return { ok: true };
}

export async function confirmBooking(req, res) {
  const auth = mustInternalAuth(req);
  if (!auth.ok)
    return res.status(auth.code).json({ ok: false, error: auth.error });

  const bookingId = String(req.params.id || "").trim();
  const idempotencyKey = String(req.headers["idempotency-key"] || "").trim();

  if (!bookingId)
    return res.status(400).json({ ok: false, error: "BOOKING_ID_REQUIRED" });
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
      [idempotencyKey, "confirm_booking", requestHash]
    );

    const booking = await client.query(
      `SELECT id, status
         FROM public.bookings
        WHERE id = $1
        FOR UPDATE`,
      [bookingId]
    );

    if (booking.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, error: "BOOKING_NOT_FOUND" });
    }

    const currentStatus = String(booking.rows[0].status || "").trim();

    if (currentStatus === "confirmed") {
      await client.query("COMMIT");
      return res.status(200).json({ ok: true, status: "already_confirmed" });
    }

    if (currentStatus !== "reserved") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        ok: false,
        error: "INVALID_STATUS",
        status: currentStatus,
      });
    }

    await client.query(
      `UPDATE public.bookings
          SET status = 'confirmed',
              confirmed_at = NOW()
        WHERE id = $1
        RETURNING id`,
      [bookingId]
    );

    const bookingConfirmedContext = await loadBookingConfirmedNotificationContext(client, bookingId);

    await client.query("COMMIT");

    if (bookingConfirmedContext) {
      await emitBookingConfirmedNotification(pool, bookingConfirmedContext, {
        booking_id: bookingId,
        source: "direct_confirm"
      });
    }

    return res.status(200).json({ ok: true, status: "confirmed" });

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
