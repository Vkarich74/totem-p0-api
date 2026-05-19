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

function createRetryError(code, statusCode, message) {
  const error = new Error(message || code);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

async function insertDeliveryRow(pool, values) {
  const result = await pool.query(
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
    RETURNING
      id,
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

  return result.rows?.[0] || null;
}

async function persistDeliveryRow(pool, values, context = {}) {
  try {
    const row = await insertDeliveryRow(pool, values);
    return { ok: true, row };
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

function parseTargetKey(target) {
  const raw = normalizeText(target, 255);
  if (!raw) {
    return null;
  }

  const separatorIndex = raw.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex >= raw.length - 1) {
    return null;
  }

  const targetType = normalizeText(raw.slice(0, separatorIndex), 64);
  const targetId = normalizeText(raw.slice(separatorIndex + 1), 255);

  if (!targetType || !targetId) {
    return null;
  }

  return {
    targetType,
    targetId,
    target: `${targetType}:${targetId}`.slice(0, 255),
  };
}

async function getActiveSubscriptionsForTarget(pool, targetType, targetId) {
  const normalizedTargetType = normalizeText(targetType, 64);
  const normalizedTargetId = normalizeText(targetId, 255);

  if (!normalizedTargetType || !normalizedTargetId) {
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
    [normalizedTargetType, normalizedTargetId],
  );

  return result.rows || [];
}

async function getSubscriptionsForNotification(pool, notification) {
  return getActiveSubscriptionsForTarget(
    pool,
    notification?.target_type,
    notification?.target_id,
  );
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

async function recordPushDeliveryAttempt(pool, notification, subscription, attemptCount) {
  const notificationId = Number(notification?.id || 0) || null;
  const target = buildTargetKey(notification);
  const deliveryUid = buildDeliveryUid(
    notification,
    subscription,
    attemptCount === 1 ? "attempt" : `retry_${attemptCount}`,
  );
  const payload = JSON.stringify(buildPushPayload(notification));

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

    const deliveryRowResult = await persistDeliveryRow(
      pool,
      {
        notificationId,
        deliveryUid,
        channel: DELIVERY_CHANNEL,
        provider: DELIVERY_PROVIDER,
        target,
        status: "sent",
        attemptCount,
        lastError: null,
        sentAt: new Date().toISOString(),
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
      ok: Boolean(deliveryRowResult?.ok),
      subscription_uid: subscription.subscription_uid || null,
      delivery_uid: deliveryUid,
      delivery_id: deliveryRowResult?.row?.id || null,
      status: deliveryRowResult?.ok ? "sent" : "sent_row_failed",
      delivery_row_persisted: Boolean(deliveryRowResult?.ok),
      attempt_count: attemptCount,
      last_error: null,
    };
  } catch (error) {
    const statusCode = Number(error?.statusCode || error?.status || 0) || null;
    const safeError = safeErrorMessage(error);

    const deliveryRowResult = await persistDeliveryRow(
      pool,
      {
        notificationId,
        deliveryUid,
        channel: DELIVERY_CHANNEL,
        provider: DELIVERY_PROVIDER,
        target,
        status: "failed",
        attemptCount,
        lastError: safeError,
        sentAt: null,
        deliveredAt: null,
        failedAt: new Date().toISOString(),
      },
      {
        notificationUid: normalizeText(notification?.notification_uid, 255) || null,
        targetType: normalizeText(notification?.target_type, 64) || null,
        targetId: normalizeText(notification?.target_id, 255) || null,
      },
    );

    if (statusCode === 404 || statusCode === 410) {
      await revokeSubscriptionIfExpired(pool, subscription);
    }

    return {
      ok: false,
      subscription_uid: subscription.subscription_uid || null,
      delivery_uid: deliveryUid,
      delivery_id: deliveryRowResult?.row?.id || null,
      status: deliveryRowResult?.ok ? "failed" : "failed_row_failed",
      error: safeError,
      delivery_row_persisted: Boolean(deliveryRowResult?.ok),
      attempt_count: attemptCount,
      last_error: safeError,
      status_code: statusCode,
    };
  }
}

async function countDeliveryAttempts(pool, notificationId, target) {
  const result = await pool.query(
    `
    SELECT COUNT(*)::int AS attempt_count
    FROM public.notification_deliveries
    WHERE notification_id = $1
      AND target = $2
      AND channel = $3
      AND provider = $4
    `,
    [notificationId, target, DELIVERY_CHANNEL, DELIVERY_PROVIDER],
  );

  return Number(result.rows?.[0]?.attempt_count || 0) || 0;
}

async function buildRetryDeliveryResult(pool, notification, subscription, attemptCount, failureReason = "NO_ACTIVE_PUSH_SUBSCRIPTION") {
  if (!subscription) {
    const deliveryUid = buildDeliveryUid(
      notification,
      { subscription_uid: failureReason },
      `retry_${attemptCount}`,
    );
    const notificationId = Number(notification?.id || 0) || null;
    const target = buildTargetKey(notification);
    const deliveryRowResult = await persistDeliveryRow(
      pool,
      {
        notificationId,
        deliveryUid,
        channel: DELIVERY_CHANNEL,
        provider: DELIVERY_PROVIDER,
        target,
        status: "failed",
        attemptCount,
        lastError: failureReason,
        sentAt: null,
        deliveredAt: null,
        failedAt: new Date().toISOString(),
      },
      {
        notificationUid: normalizeText(notification?.notification_uid, 255) || null,
        targetType: normalizeText(notification?.target_type, 64) || null,
        targetId: normalizeText(notification?.target_id, 255) || null,
      },
    );

    return {
      ok: Boolean(deliveryRowResult?.ok),
      subscription_uid: null,
      delivery_uid: deliveryUid,
      new_delivery_id: deliveryRowResult?.row?.id || null,
      status: deliveryRowResult?.ok ? "failed" : "failed_row_failed",
      delivery_row_persisted: Boolean(deliveryRowResult?.ok),
      attempt_count: attemptCount,
      last_error: failureReason,
      deliveries: [
        {
          ok: false,
          status: deliveryRowResult?.ok ? "failed" : "failed_row_failed",
          error: failureReason,
          delivery_row_persisted: Boolean(deliveryRowResult?.ok),
        },
      ],
    };
  }

  const deliveryResult = await recordPushDeliveryAttempt(pool, notification, subscription, attemptCount);
  return {
    ...deliveryResult,
    new_delivery_id: deliveryResult?.delivery_id || null,
    deliveries: [deliveryResult],
  };
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

  const target = buildTargetKey(notification);
  const results = [];

  for (const subscription of subscriptions) {
    const attemptResult = await recordPushDeliveryAttempt(pool, notification, subscription, 1);
    results.push(attemptResult);
  }

  return {
    ok: true,
    skipped: false,
    notification_uid: normalizeText(notification.notification_uid, 255) || null,
    target,
    deliveries: results,
  };
}

export async function retryNotificationDelivery(pool, deliveryId, options = {}) {
  if (!pool || typeof pool.query !== "function") {
    throw createRetryError("POOL_REQUIRED", 500);
  }

  const sourceDeliveryId = Number.parseInt(String(deliveryId ?? ""), 10);
  if (!Number.isInteger(sourceDeliveryId) || sourceDeliveryId <= 0) {
    throw createRetryError("DELIVERY_NOT_FOUND", 404);
  }

  const sourceResult = await pool.query(
    `
    SELECT *
    FROM public.notification_deliveries
    WHERE id = $1
    LIMIT 1
    `,
    [sourceDeliveryId],
  );

  const source = sourceResult.rows?.[0] || null;
  if (!source) {
    throw createRetryError("DELIVERY_NOT_FOUND", 404);
  }

  if (String(source.status || "").trim().toLowerCase() !== "failed") {
    throw createRetryError("DELIVERY_NOT_RETRYABLE", 400);
  }

  if (
    String(source.channel || "").trim().toLowerCase() !== DELIVERY_CHANNEL ||
    String(source.provider || "").trim().toLowerCase() !== DELIVERY_PROVIDER
  ) {
    throw createRetryError("DELIVERY_RETRY_UNSUPPORTED_PROVIDER", 400);
  }

  const notificationResult = await pool.query(
    `
    SELECT *
    FROM public.app_notifications
    WHERE id = $1
    LIMIT 1
    `,
    [source.notification_id],
  );

  const notification = notificationResult.rows?.[0] || null;
  if (!notification) {
    throw createRetryError("NOTIFICATION_NOT_FOUND", 404);
  }

  const parsedTarget = parseTargetKey(source.target);
  if (!parsedTarget) {
    throw createRetryError("DELIVERY_NOT_RETRYABLE", 400);
  }

  const existingAttempts = await countDeliveryAttempts(pool, source.notification_id, source.target);
  if (existingAttempts >= 3) {
    throw createRetryError("DELIVERY_RETRY_LIMIT_REACHED", 400);
  }

  const retryAttemptCount = existingAttempts + 1;
  const actor = options?.actor || null;
  const vapidConfig = getVapidConfigOrNull();
  const activeSubscriptions = await getActiveSubscriptionsForTarget(
    pool,
    parsedTarget.targetType,
    parsedTarget.targetId,
  );

  if (!vapidConfig) {
    const retry = await buildRetryDeliveryResult(
      pool,
      notification,
      null,
      retryAttemptCount,
      "PUSH_NOT_CONFIGURED",
    );

    return {
      ok: true,
      source_delivery_id: sourceDeliveryId,
      retry: {
        ...retry,
        notification_id: notification.id || null,
        target: source.target,
        actor: actor ? { type: actor.user_type || null, id: actor.user_id || null } : null,
      },
    };
  }

  if (!activeSubscriptions.length) {
    const retry = await buildRetryDeliveryResult(pool, notification, null, retryAttemptCount);
    return {
      ok: true,
      source_delivery_id: sourceDeliveryId,
      retry: {
        ...retry,
        notification_id: notification.id || null,
        target: source.target,
        actor: actor ? { type: actor.user_type || null, id: actor.user_id || null } : null,
      },
    };
  }

  const deliveries = [];
  for (const subscription of activeSubscriptions) {
    deliveries.push(await recordPushDeliveryAttempt(pool, notification, subscription, retryAttemptCount));
  }

  const primaryDelivery = deliveries[0] || null;
  return {
    ok: true,
    source_delivery_id: sourceDeliveryId,
    retry: {
      ok: true,
      notification_id: notification.id || null,
      target: source.target,
      attempt_count: retryAttemptCount,
      status: deliveries.every((item) => item.ok) ? "sent" : deliveries.some((item) => item.ok) ? "partial" : "failed",
      new_delivery_id: primaryDelivery?.delivery_id || null,
      deliveries,
      actor: actor ? { type: actor.user_type || null, id: actor.user_id || null } : null,
      ...primaryDelivery,
    },
  };
}

export default {
  dispatchNotificationPushDeliveries,
  retryNotificationDelivery,
};
