import { pool } from "../db.js";
import { createNotification } from "../services/notifications/notificationService.js";
import { buildBookingLifecycleNotificationTemplate } from "../services/notifications/notificationTemplates.js";

function getPublicLifecyclePaymentLabelRu(provider, status, hasPayment) {
  if (!hasPayment) {
    return "Оплата не выбрана";
  }

  const normalizedProvider = String(provider || "").trim().toLowerCase();
  const normalizedStatus = String(status || "").trim().toLowerCase();

  if (normalizedProvider === "direct" && normalizedStatus === "pending") {
    return "Наличные ожидают подтверждения";
  }

  if (normalizedProvider === "direct" && normalizedStatus === "confirmed") {
    return "Оплата наличными подтверждена";
  }

  if (normalizedProvider === "xpay" && normalizedStatus === "pending") {
    return "Ожидаем оплату XPAY";
  }

  if (normalizedProvider === "xpay" && normalizedStatus === "confirmed") {
    return "Оплата получена";
  }

  if (normalizedStatus === "failed") {
    return "Оплата не прошла";
  }

  if (normalizedStatus === "refunded") {
    return "Оплата возвращена";
  }

  return "Оплата не выбрана";
}

function buildLifecycleActionUrl(booking, targetType) {
  const salonSlug = String(booking?.salon_slug || "").trim();
  const masterSlug = String(booking?.master_slug || "").trim();

  if (targetType === "salon" && salonSlug) {
    return `#/salon/${salonSlug}/dashboard`;
  }

  if (targetType === "master" && masterSlug) {
    return `#/master/${masterSlug}/dashboard`;
  }

  if (targetType === "client") {
    return null;
  }

  return null;
}

export async function publicLifecycle(req, res) {
  try {
    const { salon_id } = req.tenant;
    const bookingId = Number(req.params.id);
    const { action } = req.body || {};

    if (!Number.isFinite(bookingId) || bookingId <= 0) {
      return res.status(400).json({ ok: false, error: "BOOKING_ID_INVALID" });
    }

    if (!["confirm", "complete", "cancel"].includes(action)) {
      return res.status(400).json({ ok: false, error: "INVALID_ACTION" });
    }

    const { rows } = await pool.query(
      `
      SELECT
        b.id,
        b.status,
        b.salon_id,
        b.salon_slug,
        b.master_id,
        m.slug AS master_slug,
        b.client_id,
        b.service_id,
        b.start_at,
        b.end_at,
        b.price_snapshot
      FROM bookings b
      LEFT JOIN masters m ON m.id = b.master_id
      LEFT JOIN master_salon ms
        ON ms.master_id = b.master_id
       AND ms.salon_id = $2
       AND ms.status = 'active'
      WHERE b.id = $1
        AND (b.salon_id = $2 OR ms.id IS NOT NULL)
      `,
      [bookingId, salon_id]
    );

    if (!rows.length) {
      return res.status(404).json({ ok: false, error: "BOOKING_NOT_FOUND" });
    }

    const currentStatus = rows[0].status;

    if (action === "confirm") {
      if (currentStatus === "confirmed") {
        return res.json({ ok: true, status: "already_confirmed" });
      }

      if (["completed", "cancelled", "canceled"].includes(String(currentStatus || "").toLowerCase())) {
        return res.status(409).json({
          ok: false,
          error: "INVALID_STATUS",
          status: currentStatus,
        });
      }

      await pool.query(
        `UPDATE bookings
            SET status = 'confirmed',
                confirmed_at = NOW()
          WHERE id = $1`,
        [bookingId]
      );

      return res.json({ ok: true, status: "confirmed" });
    }

    if (action === "complete") {
      const paymentRes = await pool.query(
        `
        SELECT
          id,
          provider,
          status,
          is_active
        FROM payments
        WHERE booking_id = $1
          AND provider = 'direct'
          AND status = 'pending'
          AND is_active = true
        ORDER BY updated_at DESC NULLS LAST, id DESC
        LIMIT 1
        `,
        [bookingId]
      );

      if (paymentRes.rows.length) {
        const paymentRow = paymentRes.rows[0];

        return res.status(409).json({
          ok: false,
          error: "CASH_PAYMENT_PENDING_CONFIRMATION",
          message_ru: "Нельзя завершить визит: наличные ожидают подтверждения.",
          payment_label_ru: getPublicLifecyclePaymentLabelRu(
            paymentRow.provider,
            paymentRow.status,
            Boolean(paymentRow.id)
          ),
          cash_pending_alert: true
        });
      }

      if (currentStatus === "reserved") {
        return res.status(409).json({
          ok: false,
          error: "BOOKING_PAYMENT_REQUIRED",
          status: currentStatus,
        });
      }

      if (currentStatus !== "confirmed") {
        return res.status(409).json({
          ok: false,
          error: "INVALID_STATUS",
          status: currentStatus,
        });
      }

      await pool.query(
        `UPDATE bookings SET status = 'completed' WHERE id = $1`,
        [bookingId]
      );

      try {
        const booking = rows[0];
        const notificationPayload = {
          booking_id: Number(booking.id),
          salon_id: Number(booking.salon_id),
          salon_slug: String(booking.salon_slug || ""),
          master_id: Number(booking.master_id),
          client_id: Number(booking.client_id),
          service_id: Number(booking.service_id),
          start_at: booking.start_at ? new Date(booking.start_at).toISOString() : null,
          end_at: booking.end_at ? new Date(booking.end_at).toISOString() : null,
          price: Number(booking.price_snapshot || 0),
          lifecycle_action: action,
          next_status: "completed",
        };
        const clientNotificationTemplate = buildBookingLifecycleNotificationTemplate(
          "completed",
          "client"
        );
        const masterNotificationTemplate = buildBookingLifecycleNotificationTemplate(
          "completed",
          "master"
        );
        const salonNotificationTemplate = buildBookingLifecycleNotificationTemplate(
          "completed",
          "salon"
        );

        await createNotification(pool, {
          target_type: "client",
          target_id: String(booking.client_id),
          owner_type: "salon",
          owner_id: booking.salon_id,
          channel: "in_app",
          ...clientNotificationTemplate,
          action_url: buildLifecycleActionUrl(booking, "client"),
          status: "sent",
          payload_json: notificationPayload,
        });

        await createNotification(pool, {
          target_type: "master",
          target_id: String(booking.master_id),
          owner_type: "salon",
          owner_id: booking.salon_id,
          channel: "in_app",
          ...masterNotificationTemplate,
          action_url: buildLifecycleActionUrl(booking, "master"),
          status: "sent",
          payload_json: notificationPayload,
        });

        await createNotification(pool, {
          target_type: "salon",
          target_id: String(booking.salon_id),
          owner_type: "salon",
          owner_id: booking.salon_id,
          channel: "in_app",
          ...salonNotificationTemplate,
          action_url: buildLifecycleActionUrl(booking, "salon"),
          status: "sent",
          payload_json: notificationPayload,
        });
      } catch (error) {
        console.error("BOOKING_LIFECYCLE_NOTIFICATION_ERROR", error);
      }

      return res.json({ ok: true, status: "completed" });
    }

    if (action === "cancel") {
      if (currentStatus === "completed") {
        return res.status(409).json({
          ok: false,
          error: "CANNOT_CANCEL_COMPLETED",
        });
      }

      await pool.query(
        `UPDATE bookings SET status = 'cancelled' WHERE id = $1`,
        [bookingId]
      );

      await pool.query(
        `
        UPDATE payments
           SET status = 'rejected',
               is_active = false,
               rejected_at = NOW(),
               rejection_reason = 'booking_cancelled',
               updated_at = NOW()
         WHERE booking_id = $1
           AND provider = 'direct'
           AND status = 'pending'
           AND is_active = true
        `,
        [bookingId]
      );

      try {
        const booking = rows[0];
        const notificationPayload = {
          booking_id: Number(booking.id),
          salon_id: Number(booking.salon_id),
          salon_slug: String(booking.salon_slug || ""),
          master_id: Number(booking.master_id),
          client_id: Number(booking.client_id),
          service_id: Number(booking.service_id),
          start_at: booking.start_at ? new Date(booking.start_at).toISOString() : null,
          end_at: booking.end_at ? new Date(booking.end_at).toISOString() : null,
          price: Number(booking.price_snapshot || 0),
          lifecycle_action: action,
          next_status: "cancelled",
        };
        const clientNotificationTemplate = buildBookingLifecycleNotificationTemplate(
          "cancel",
          "client"
        );
        const masterNotificationTemplate = buildBookingLifecycleNotificationTemplate(
          "cancel",
          "master"
        );
        const salonNotificationTemplate = buildBookingLifecycleNotificationTemplate(
          "cancel",
          "salon"
        );

        await createNotification(pool, {
          target_type: "client",
          target_id: String(booking.client_id),
          owner_type: "salon",
          owner_id: booking.salon_id,
          channel: "in_app",
          ...clientNotificationTemplate,
          action_url: buildLifecycleActionUrl(booking, "client"),
          status: "sent",
          payload_json: notificationPayload,
        });

        await createNotification(pool, {
          target_type: "master",
          target_id: String(booking.master_id),
          owner_type: "salon",
          owner_id: booking.salon_id,
          channel: "in_app",
          ...masterNotificationTemplate,
          action_url: buildLifecycleActionUrl(booking, "master"),
          status: "sent",
          payload_json: notificationPayload,
        });

        await createNotification(pool, {
          target_type: "salon",
          target_id: String(booking.salon_id),
          owner_type: "salon",
          owner_id: booking.salon_id,
          channel: "in_app",
          ...salonNotificationTemplate,
          action_url: buildLifecycleActionUrl(booking, "salon"),
          status: "sent",
          payload_json: notificationPayload,
        });
      } catch (error) {
        console.error("BOOKING_LIFECYCLE_NOTIFICATION_ERROR", error);
      }

      return res.json({ ok: true, status: "cancelled" });
    }

  } catch (err) {
    console.error("PUBLIC_LIFECYCLE_ERROR", err.message);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
}
