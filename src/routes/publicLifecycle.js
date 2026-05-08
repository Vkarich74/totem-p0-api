import { pool } from "../db.js";
import { createNotification } from "../services/notifications/notificationService.js";

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

export async function publicLifecycle(req, res) {
  try {
    const { salon_id } = req.tenant;
    const bookingId = Number(req.params.id);
    const { action } = req.body || {};

    if (!Number.isFinite(bookingId) || bookingId <= 0) {
      return res.status(400).json({ ok: false, error: "BOOKING_ID_INVALID" });
    }

    if (!["complete", "cancel"].includes(action)) {
      return res.status(400).json({ ok: false, error: "INVALID_ACTION" });
    }

    const { rows } = await pool.query(
      `
      SELECT id, status, salon_id, salon_slug, master_id, client_id, service_id, start_at, end_at, price_snapshot
      FROM bookings
      WHERE id = $1 AND salon_id = $2
      `,
      [bookingId, salon_id]
    );

    if (!rows.length) {
      return res.status(404).json({ ok: false, error: "BOOKING_NOT_FOUND" });
    }

    const currentStatus = rows[0].status;

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

        await createNotification(pool, {
          target_type: "client",
          target_id: String(booking.client_id),
          owner_type: "salon",
          owner_id: booking.salon_id,
          channel: "in_app",
          priority: "normal",
          title_ru: "Запись завершена",
          body_ru: "Ваша запись завершена. Спасибо за визит.",
          action_type: "booking",
          status: "sent",
          payload_json: notificationPayload,
        });

        await createNotification(pool, {
          target_type: "master",
          target_id: String(booking.master_id),
          owner_type: "salon",
          owner_id: booking.salon_id,
          channel: "in_app",
          priority: "normal",
          title_ru: "Запись завершена",
          body_ru: "Запись отмечена как завершённая.",
          action_type: "booking",
          status: "sent",
          payload_json: notificationPayload,
        });

        await createNotification(pool, {
          target_type: "salon",
          target_id: String(booking.salon_id),
          owner_type: "salon",
          owner_id: booking.salon_id,
          channel: "in_app",
          priority: "normal",
          title_ru: "Запись завершена",
          body_ru: "Запись в салоне завершена.",
          action_type: "booking",
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

        await createNotification(pool, {
          target_type: "client",
          target_id: String(booking.client_id),
          owner_type: "salon",
          owner_id: booking.salon_id,
          channel: "in_app",
          priority: "normal",
          title_ru: "Запись отменена",
          body_ru: "Ваша запись была отменена.",
          action_type: "booking",
          status: "sent",
          payload_json: notificationPayload,
        });

        await createNotification(pool, {
          target_type: "master",
          target_id: String(booking.master_id),
          owner_type: "salon",
          owner_id: booking.salon_id,
          channel: "in_app",
          priority: "normal",
          title_ru: "Запись отменена",
          body_ru: "Запись к вам была отменена.",
          action_type: "booking",
          status: "sent",
          payload_json: notificationPayload,
        });

        await createNotification(pool, {
          target_type: "salon",
          target_id: String(booking.salon_id),
          owner_type: "salon",
          owner_id: booking.salon_id,
          channel: "in_app",
          priority: "normal",
          title_ru: "Запись отменена",
          body_ru: "Запись в салоне была отменена.",
          action_type: "booking",
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
