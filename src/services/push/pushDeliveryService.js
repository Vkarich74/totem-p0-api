import webPush from "web-push";
import { getWebPushPublicConfig } from "./webPushService.js";

const DELIVERY_CHANNEL = "push";
const DELIVERY_PROVIDER = "web-push";
const MAX_ERROR_LENGTH = 1000;

let configuredVapidKey = "";

function normalizeText(value, maxLength = 255) {
  const text = String(value ?? "").trim();

  if (!text) {
    return null;
  }

  return text.slice(0, maxLength);
}

function normalizePayloadJson(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      /* no-op */
    }
  }

  return {};
}

function buildDeliveryUid(notification, subscription, suffix) {
  const notificationUid = normalizeText(notification?.notification_uid, 255) || `notification_${notification?.id || "unknown"}`;
  const subscriptionUid = normalizeText(subscription?.subscription_uid, 255) || normalizeText(subscription?.device_id, 120) || "subscription";
  const randomTail = Math.random().toString(36).slice(2, 10);

  return `push_delivery_${notificationUid}_${subscriptionUid}_${suffix}_${Date.now()}_${randomTail}`.slice(0, 255);
}

function buildTargetKey(notification) {
  const targetType = normalizeText(notification?.target_type, 64);
  const targetId = normalizeText(notification?.target_id, 255);

  if (!targetType || !targetId) {
    return null;
  }

  return `${targetType}:${targetId}`.slice(0, 255);
}

function buildPushPayload(notification) {
  const payloadJson = normalizePayloadJson(notification?.payload_json);

  return {
    notification_uid: normalizeText(notification?.notification_uid, 255),
    title: normalizeText(notification?.title_ru, 255) || normalizeText(notification?.title_en, 255) || "Уведомление",
    body: normalizeText(notification?.body_ru, 4000) || normalizeText(notification?.body_en, 4000) || "",
    action_type: normalizeText(notification?.action_type, 120),
    action_url: normalizeText(notification?.action_url, 1000),
    target_type: normalizeText(notification?.target_type, 64),
    target_id: normalizeText(notification?.target_id, 255),
    payload_json: payloadJson,
    created_at: notification?.created_at ? new Date(notification.created_at).toISOString() : new Date().toISOString(),
  };
}

function getVapidConfigOrNull() {
  const config = getWebPushPublicConfig();

  if (!config?.push_enabled || !config?.vapid_public_key) {
    return null;
  }

  const vapidPrivateKey = String(process.env.VAPID_PRIVATE_KEY || "").trim();
  const vapidSubject = String(process.env.VAPID_SUBJECT || "").trim();

  if (!vapidPrivateKey || !vapidSubject) {
    return null;
  }

  const key = `${config.vapid_public_key}:${vapidPrivateKey}:${vapidSubject}`;

  if (configuredVapidKey !== key) {
    webPush.setVapidDetails(vapidSubject, config.vapid_public_key, vapidPrivateKey);
    configuredVapidKey = key;
  }

  return {
    publicKey: config.vapid_public_key,
    privateKey: vapidPrivateKey,
    subject: vapidSubject,
  };
}

function safeErrorMessage(error) {
  const raw = String(error?.message || error?.body || error?.toString?.() || error || "PUSH_DELIVERY_FAILED");
  return raw.slice(0, MAX_ERROR_LENGTH);
}

async function insertDeliveryRow(pool, values) {
  await pool.query(
    `
    INSERT INTO public.notification_deliveries (
      notification_id,
      delivery_uid,
      channel,
      provider,
      target,
      status,
      attempt_count,
      last_error,
      sent_at,
      delivered_at,
      failed_at,
      created_at,
      updated_at
    )
    VALUES (
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      $8,
      $9,
      $10,
      $11,
      NOW(),
      NOW()
    )
    `,
    [
      values.notificationId,
      values.deliveryUid,
      values.channel,
      values.provider,
      values.target,
      values.status,
      values.attemptCount,
      values.lastError,
      values.sentAt,
      values.deliveredAt,
      values.failedAt,
    ],
  );
}

async function persistDeliveryRow(pool, values, context = {}) {
  try {
    await insertDeliveryRow(pool, values);
    return { ok: true };
  } catch (error) {
    const logPayload = {
      notification_id: values?.notificationId ?? null,
      notification_uid: context?.notificationUid ?? null,
      target_type: context?.targetType ?? null,
      target_id: context?.targetId ?? null,
      status: values?.status ?? null,
      reason: values?.lastError ?? null,
      error: String(error?.message || error || "PUSH_DELIVERY_ROW_INSERT_FAILED").slice(0, MAX_ERROR_LENGTH),
    };

    console.error("PUSH_DELIVERY_ROW_INSERT_FAILED", logPayload);
    return { ok: false, error: logPayload.error };
  }
}

async function logSkippedDelivery(pool, notification, reason) {
  const notificationId = Number(notification?.id || 0) || null;
  const target = buildTargetKey(notification) || normalizeText(notification?.target_type, 64) || "global";
  const dbReason = String(reason || "PUSH_NOT_CONFIGURED");
  const result = await persistDeliveryRow(
    pool,
    {
      notificationId,
      deliveryUid: buildDeliveryUid(notification, { subscription_uid: dbReason }, "skipped"),
      channel: DELIVERY_CHANNEL,
      provider: DELIVERY_PROVIDER,
      target,
      status: "failed",
      attemptCount: 0,
      lastError: normalizeText(dbReason, MAX_ERROR_LENGTH),
      sentAt: null,
      deliveredAt: null,
      failedAt: null,
    },
    {
      notificationUid: normalizeText(notification?.notification_uid, 255) || null,
      targetType: normalizeText(notification?.target_type, 64) || null,
      targetId: normalizeText(notification?.target_id, 255) || null,
    },
  );

  return {
    ok: Boolean(result?.ok),
    skipped: true,
    reason,
  };
}

async function getSubscriptionsForNotification(pool, notification) {
  const targetType = normalizeText(notification?.target_type, 64);
  const targetId = normalizeText(notification?.target_id, 255);

  if (!targetType || !targetId) {
    return [];
  }

  const result = await pool.query(
    `
    SELECT
      id,
      subscription_uid,
      user_type,
      user_id,
      device_id,
      platform,
      endpoint,
      p256dh,
      auth,
      user_agent
    FROM public.push_subscriptions
    WHERE enabled = true
      AND revoked_at IS NULL
      AND user_type = $1
      AND user_id = $2
      AND endpoint IS NOT NULL
      AND p256dh IS NOT NULL
      AND auth IS NOT NULL
    ORDER BY last_seen_at DESC NULLS LAST, id DESC
    `,
    [targetType, targetId],
  );

  return result.rows || [];
}

async function revokeSubscriptionIfExpired(pool, subscription) {
  if (!subscription?.id) {
    return;
  }

  try {
    await pool.query(
      `
      UPDATE public.push_subscriptions
      SET enabled = false,
          revoked_at = NOW(),
          last_seen_at = NOW()
      WHERE id = $1
      `,
      [subscription.id],
    );
  } catch {
    /* no-op */
  }
}

export async function dispatchNotificationPushDeliveries(pool, notification) {
  if (!pool || typeof pool.query !== "function") {
    throw new Error("POOL_REQUIRED");
  }

  if (!notification || typeof notification !== "object") {
    return { ok: false, skipped: true, reason: "NOTIFICATION_REQUIRED" };
  }

  const vapidConfig = getVapidConfigOrNull();
  if (!vapidConfig) {
    return logSkippedDelivery(pool, notification, "PUSH_NOT_CONFIGURED");
  }

  const subscriptions = await getSubscriptionsForNotification(pool, notification);
  if (!subscriptions.length) {
    return logSkippedDelivery(pool, notification, "NO_ACTIVE_PUSH_SUBSCRIPTION");
  }

  const payload = JSON.stringify(buildPushPayload(notification));
  const notificationId = Number(notification.id || 0) || null;
  const targetType = normalizeText(notification?.target_type, 64) || null;
  const targetId = normalizeText(notification?.target_id, 255) || null;
  const target = buildTargetKey(notification);
  const results = [];

  for (const subscription of subscriptions) {
    const deliveryUid = buildDeliveryUid(notification, subscription, "attempt");

    try {
      await webPush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        payload,
      );

      const deliveryRowResult = await persistDeliveryRow(pool, {
        notificationId,
        deliveryUid,
        channel: DELIVERY_CHANNEL,
        provider: DELIVERY_PROVIDER,
        target,
        status: "sent",
        attemptCount: 1,
        lastError: null,
        sentAt: new Date().toISOString(),
        deliveredAt: null,
        failedAt: null,
      }, {
        notificationUid: normalizeText(notification?.notification_uid, 255) || null,
        targetType,
        targetId,
      });

      results.push({
        ok: Boolean(deliveryRowResult?.ok),
        subscription_uid: subscription.subscription_uid || null,
        status: deliveryRowResult?.ok ? "sent" : "sent_row_failed",
        delivery_row_persisted: Boolean(deliveryRowResult?.ok),
      });
    } catch (error) {
      const statusCode = Number(error?.statusCode || error?.status || 0) || null;
      const safeError = safeErrorMessage(error);

      const deliveryRowResult = await persistDeliveryRow(pool, {
        notificationId,
        deliveryUid,
        channel: DELIVERY_CHANNEL,
        provider: DELIVERY_PROVIDER,
        target,
        status: "failed",
        attemptCount: 1,
        lastError: safeError,
        sentAt: null,
        deliveredAt: null,
        failedAt: new Date().toISOString(),
      }, {
        notificationUid: normalizeText(notification?.notification_uid, 255) || null,
        targetType,
        targetId,
      });

      if (statusCode === 404 || statusCode === 410) {
        await revokeSubscriptionIfExpired(pool, subscription);
      }

      results.push({
        ok: false,
        subscription_uid: subscription.subscription_uid || null,
        status: deliveryRowResult?.ok ? "failed" : "failed_row_failed",
        error: safeError,
        delivery_row_persisted: Boolean(deliveryRowResult?.ok),
      });
    }
  }

  return {
    ok: true,
    skipped: false,
    notification_uid: normalizeText(notification.notification_uid, 255) || null,
    target,
    deliveries: results,
  };
}

export default {
  dispatchNotificationPushDeliveries,
};
