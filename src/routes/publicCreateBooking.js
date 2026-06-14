import { pool } from "../db.js";
import crypto from "crypto";
import { createNotification } from "../services/notifications/notificationService.js";
import { buildBookingCreatedNotificationTemplate } from "../services/notifications/notificationTemplates.js";

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

function buildClientCabinetUrl(clientId, token) {
  return `#/client/${clientId}/${token}`;
}

function createClientCabinetToken() {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const tokenLast4 = token.slice(-4);

  return {
    token,
    tokenHash,
    tokenLast4
  };
}

function isIanaTimeZone(value) {
  const zone = String(value || "").trim();
  if (!zone) {
    return false;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(new Date());
    return true;
  } catch (error) {
    return false;
  }
}

function getSalonBookingTimeZone({ salonSlug, salonId, salonTimeZone }) {
  const explicitZone = String(salonTimeZone || "").trim();
  if (isIanaTimeZone(explicitZone)) {
    return explicitZone;
  }

  if (String(salonSlug || "").trim() === "master-prime" || Number(salonId) === 32) {
    return "Asia/Bishkek";
  }

  return "UTC";
}

function formatZoneParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  const parts = formatter.formatToParts(date);
  const lookup = Object.create(null);

  for (const part of parts) {
    if (part.type !== "literal") {
      lookup[part.type] = part.value;
    }
  }

  return {
    year: Number(lookup.year || 0),
    month: Number(lookup.month || 0),
    day: Number(lookup.day || 0),
    hour: Number(lookup.hour || 0),
    minute: Number(lookup.minute || 0),
    second: Number(lookup.second || 0)
  };
}

function localDateTimeToUtcIso(dateValue, timeValue, timeZone) {
  const dateParts = String(dateValue || "").trim().split("-");
  const timeParts = String(timeValue || "").trim().split(":");

  if (dateParts.length !== 3 || timeParts.length < 2) {
    return null;
  }

  const year = Number(dateParts[0]);
  const month = Number(dateParts[1]);
  const day = Number(dateParts[2]);
  const hour = Number(timeParts[0]);
  const minute = Number(timeParts[1]);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute)
  ) {
    return null;
  }

  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  const zoneParts = formatZoneParts(guess, timeZone);
  const desiredMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const zoneMs = Date.UTC(
    zoneParts.year,
    zoneParts.month - 1,
    zoneParts.day,
    zoneParts.hour,
    zoneParts.minute,
    zoneParts.second || 0,
    0
  );
  const offsetMs = zoneMs - desiredMs;

  return new Date(guess.getTime() - offsetMs).toISOString();
}

function hasExplicitTimeZone(startAt) {
  return /(?:Z|[+-]\d{2}:\d{2})$/i.test(String(startAt || "").trim());
}

function extractLocalDateTimeFromStartAt(startAt) {
  const match = String(startAt || "")
    .trim()
    .match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})(?::\d{2}(?:\.\d{1,3})?)?$/);

  if (!match) {
    return null;
  }

  return {
    date: match[1],
    time: match[2]
  };
}

function normalizePublicStartAt(input, { salonSlug, salonId, salonTimeZone }) {
  const targetTimeZone = getSalonBookingTimeZone({
    salonSlug,
    salonId,
    salonTimeZone
  });

  const providedDate = String(input?.date || input?.booking_date || "").trim();
  const providedTime = String(input?.time || input?.booking_time || "").trim();
  const providedStartAt = String(input?.start_at || "").trim();

  if (providedDate && providedTime) {
    return localDateTimeToUtcIso(providedDate, providedTime, targetTimeZone);
  }

  if (!providedStartAt) {
    return null;
  }

  if (hasExplicitTimeZone(providedStartAt)) {
    const parsed = new Date(providedStartAt);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  const localParts = extractLocalDateTimeFromStartAt(providedStartAt);
  if (!localParts) {
    return null;
  }

  return localDateTimeToUtcIso(localParts.date, localParts.time, targetTimeZone);
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

    const {
      master_id,
      service_id,
      start_at,
      date,
      time,
      client_id,
      client_payload,
      client_name,
      phone
    } = req.body;
    const { slug } = req.params;

    if (!master_id || !service_id || (!start_at && (!date || !time))) {
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
         AND status = 'active'
         AND COALESCE(enabled, true) = true
       LIMIT 1`,
      [slug]
    );

    if (salonRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, error: "SALON_NOT_FOUND" });
    }

    const salonId = salonRes.rows[0].id;
    const salonSlug = salonRes.rows[0].slug;
    const salonTimeZone = salonRes.rows[0].timezone || salonRes.rows[0].time_zone || salonRes.rows[0].tz || null;

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
      `SELECT ms.id
       FROM public.master_salon ms
       JOIN public.masters m
         ON m.id = ms.master_id
       WHERE ms.master_id = $1
         AND ms.salon_id = $2
         AND ms.status = 'active'
         AND COALESCE(m.active, true) = true
       LIMIT 1`,
      [master_id, salonId]
    );

    if (masterRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ ok: false, error: "MASTER_NOT_IN_SALON" });
    }

    const normalizedStartAt = normalizePublicStartAt(
      {
        start_at,
        date,
        time
      },
      {
        salonSlug,
        salonId,
        salonTimeZone
      }
    );

    if (!normalizedStartAt) {
      await client.query("ROLLBACK");
      return res.status(400).json({ ok: false, error: "INVALID_START_AT" });
    }

    const startDate = new Date(normalizedStartAt);
    const endAtIso = new Date(startDate.getTime() + durationMin * 60000).toISOString();

    const endAtRes = await client.query(
      `SELECT ($1::timestamptz + ($2 || ' minutes')::interval) AS end_at`,
      [normalizedStartAt, durationMin]
    );

    const end_at = endAtRes.rows[0].end_at || endAtIso;

    let finalClientId = client_id || null;
    let finalClientName = null;
    let finalClientPhone = null;
    let clientAuditAction = "client_reused_by_id";

    if (finalClientId) {
      const existingClientById = await client.query(
        `SELECT id, name, phone
         FROM public.clients
         WHERE id = $1
         LIMIT 1`,
        [finalClientId]
      );

      if (existingClientById.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ ok: false, error: "CLIENT_NOT_FOUND" });
      }

      finalClientName = existingClientById.rows[0].name;
      finalClientPhone = existingClientById.rows[0].phone;
    }

    if (!finalClientId) {
      const safeName = String(client_payload?.name ?? client_name ?? "").trim() || "Клиент";
      const safePhone = normalizedClientPhone.phone;

      const existingClient = await client.query(
        `SELECT id, name, phone
         FROM public.clients
         WHERE salon_id = $1
           AND phone = $2
         LIMIT 1`,
        [salonId, safePhone]
      );

      if (existingClient.rowCount > 0) {
        finalClientId = existingClient.rows[0].id;
        finalClientName = existingClient.rows[0].name;
        finalClientPhone = existingClient.rows[0].phone;
        clientAuditAction = "client_reused_from_phone";
      }

      if (!finalClientId) {
        const createdClient = await client.query(
          `INSERT INTO public.clients (salon_id, name, phone)
           VALUES ($1, $2, $3)
           RETURNING id, name, phone`,
          [salonId, safeName, safePhone]
        );

        finalClientId = createdClient.rows[0].id;
        finalClientName = createdClient.rows[0].name;
        finalClientPhone = createdClient.rows[0].phone;
        clientAuditAction = "client_created_from_booking";
      }
    }

    const existingSlot = await client.query(
      `SELECT id
       FROM public.calendar_slots
       WHERE master_id = $1
         AND start_at = $2
         AND end_at = $3
       LIMIT 1`,
      [master_id, normalizedStartAt, end_at]
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
        [master_id, salonId, normalizedStartAt, end_at, idempotencyKey]
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
        normalizedStartAt,
        end_at,
        idempotencyKey,
        slot_id,
        finalClientId,
        servicePk,
        price
      ]
    );

    const booking_id = bookingInsert.rows[0].id;

    const cabinetToken = createClientCabinetToken();

    await client.query(
      `UPDATE public.client_access_tokens
       SET revoked_at = NOW()
       WHERE client_id = $1
         AND purpose = 'cabinet'
         AND revoked_at IS NULL`,
      [finalClientId]
    );

    await client.query(
      `INSERT INTO public.client_access_tokens (
         client_id,
         booking_id,
         token_hash,
         token_last4,
         purpose
       )
       VALUES ($1, $2, $3, $4, 'cabinet')`,
      [
        finalClientId,
        booking_id,
        cabinetToken.tokenHash,
        cabinetToken.tokenLast4
      ]
    );

    await client.query(
      `INSERT INTO public.client_sources (
         client_id,
         booking_id,
         source_type,
         source_slug
       )
       VALUES ($1, $2, 'salon', $3)`,
      [
        finalClientId,
        booking_id,
        salonSlug
      ]
    );

    await client.query(
      `INSERT INTO public.client_audit_events (
         client_id,
         booking_id,
         actor_type,
         action,
         metadata
       )
       VALUES ($1, $2, 'system', $3, $4)`,
      [
        finalClientId,
        booking_id,
        clientAuditAction,
        {
          source_type: "salon",
          source_slug: salonSlug,
          booking_id,
          request_id: idempotencyKey
        }
      ]
    );

    await client.query(
      `INSERT INTO public.client_audit_events (
         client_id,
         booking_id,
         actor_type,
         action,
         metadata
       )
       VALUES ($1, $2, 'system', 'cabinet_token_created', $3)`,
      [
        finalClientId,
        booking_id,
        {
          token_last4: cabinetToken.tokenLast4,
          source_type: "salon",
          source_slug: salonSlug,
          booking_id,
          request_id: idempotencyKey
        }
      ]
    );

    const clientCabinetUrl = buildClientCabinetUrl(finalClientId, cabinetToken.token);
    const bookingNotificationPayload = {
      booking_id: Number(booking_id),
      salon_id: Number(salonId),
      salon_slug: String(salonSlug),
      master_id: Number(master_id),
      client_id: Number(finalClientId),
      service_id: Number(servicePk),
      start_at: new Date(start_at).toISOString(),
      end_at: new Date(end_at).toISOString(),
      price: Number(price)
    };

    await client.query("SAVEPOINT booking_created_notifications");

    try {
      const clientNotificationTemplate = buildBookingCreatedNotificationTemplate("client");
      const masterNotificationTemplate = buildBookingCreatedNotificationTemplate("master");
      const salonNotificationTemplate = buildBookingCreatedNotificationTemplate("salon");

      await createNotification(client, {
        target_type: "client",
        target_id: String(finalClientId),
        owner_type: "salon",
        owner_id: salonId,
        channel: "in_app",
        ...clientNotificationTemplate,
        action_url: clientCabinetUrl,
        status: "sent",
        payload_json: bookingNotificationPayload
      });

      await createNotification(client, {
        target_type: "master",
        target_id: String(master_id),
        owner_type: "salon",
        owner_id: salonId,
        channel: "in_app",
        ...masterNotificationTemplate,
        action_url: `/master/${master_id}/dashboard`,
        status: "sent",
        payload_json: bookingNotificationPayload
      });

      await createNotification(client, {
        target_type: "salon",
        target_id: String(salonId),
        owner_type: "salon",
        owner_id: salonId,
        channel: "in_app",
        ...salonNotificationTemplate,
        action_url: `/salon/${salonSlug}/dashboard`,
        status: "sent",
        payload_json: bookingNotificationPayload
      });

      await client.query("RELEASE SAVEPOINT booking_created_notifications");
    } catch (error) {
      try {
        await client.query("ROLLBACK TO SAVEPOINT booking_created_notifications");
      } catch (notificationRollbackError) {
        console.error("BOOKING_CREATED_NOTIFICATION_ROLLBACK_ERROR", notificationRollbackError);
      }

      console.error("BOOKING_CREATED_NOTIFICATION_ERROR", error);
    }

    const responseBody = {
      ok: true,
      booking_id,
      status: "reserved",
      client: {
        id: finalClientId,
        name: finalClientName,
        phone: finalClientPhone
      },
      client_cabinet: {
        url: clientCabinetUrl
      }
    };

    const idempotencyResponseBody = {
      ok: true,
      booking_id,
      status: "reserved",
      client: {
        id: finalClientId,
        name: finalClientName,
        phone: finalClientPhone
      },
      client_cabinet: {
        url: null,
        token_last4: cabinetToken.tokenLast4
      }
    };

    await client.query(
      `UPDATE public.api_idempotency_keys
       SET response_code = 201,
           response_body = $2
       WHERE idempotency_key = $1`,
      [idempotencyKey, idempotencyResponseBody]
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
