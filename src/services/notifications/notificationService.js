export function normalizeText(value, maxLength = 255) {
  const text = String(value ?? "").trim();

  if (!text) {
    return null;
  }

  return text.slice(0, maxLength);
}

export function normalizeJson(value) {
  if (Array.isArray(value) || (value && typeof value === "object")) {
    return value;
  }

  return {};
}

export function normalizeTargetType(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  const allowed = new Set(["global", "client", "salon", "master", "salon_admin", "master_admin", "owner", "auth_user"]);

  return allowed.has(raw) ? raw : "global";
}

export function normalizeChannel(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  const allowed = new Set(["in_app", "push", "email", "sms", "whatsapp"]);

  return allowed.has(raw) ? raw : "in_app";
}

export function normalizePriority(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  const allowed = new Set(["low", "normal", "high", "urgent"]);

  return allowed.has(raw) ? raw : "normal";
}

export function normalizeStatus(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  const allowed = new Set(["draft", "scheduled", "sent", "cancelled", "expired"]);

  return allowed.has(raw) ? raw : "sent";
}

function normalizeOwnerId(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTimestamp(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function normalizeReaderType(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  const allowed = new Set(["client", "salon", "master", "salon_admin", "master_admin", "owner", "auth_user"]);

  return allowed.has(raw) ? raw : "";
}

function normalizeFilterText(value, maxLength = 255) {
  const text = normalizeText(value, maxLength);
  return text ? text.toLowerCase() : "";
}

function buildNotificationSelectSql() {
  return `
    SELECT
      id,
      notification_uid,
      target_type,
      target_id,
      owner_type,
      owner_id,
      channel,
      priority,
      title_ru,
      body_ru,
      title_en,
      body_en,
      action_type,
      action_url,
      payload_json,
      status,
      scheduled_at,
      sent_at,
      expires_at,
      created_at,
      updated_at
    FROM public.app_notifications
  `;
}

export async function createNotification(pool, input = {}) {
  if (!pool || typeof pool.query !== "function") {
    throw new Error("POOL_REQUIRED");
  }

  const titleRu = normalizeText(input.title_ru, 255);
  const bodyRu = normalizeText(input.body_ru, 4000);

  if (!titleRu) {
    const error = new Error("NOTIFICATION_TITLE_RU_REQUIRED");
    error.code = "NOTIFICATION_TITLE_RU_REQUIRED";
    throw error;
  }

  if (!bodyRu) {
    const error = new Error("NOTIFICATION_BODY_RU_REQUIRED");
    error.code = "NOTIFICATION_BODY_RU_REQUIRED";
    throw error;
  }

  const notificationUid = normalizeText(input.notification_uid, 255) || `notif_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const targetType = normalizeTargetType(input.target_type);
  const targetId = normalizeText(input.target_id, 255);
  const ownerType = normalizeText(input.owner_type, 64);
  const ownerId = normalizeOwnerId(input.owner_id);
  const channel = normalizeChannel(input.channel);
  const priority = normalizePriority(input.priority);
  const titleEn = normalizeText(input.title_en, 255);
  const bodyEn = normalizeText(input.body_en, 4000);
  const actionType = normalizeText(input.action_type, 120);
  const actionUrl = normalizeText(input.action_url, 1000);
  const payloadJson = normalizeJson(input.payload_json);
  const status = normalizeStatus(input.status);
  const scheduledAt = normalizeTimestamp(input.scheduled_at);
  const sentAt = normalizeTimestamp(input.sent_at);
  const expiresAt = normalizeTimestamp(input.expires_at);

  const query = `
    INSERT INTO public.app_notifications (
      notification_uid,
      target_type,
      target_id,
      owner_type,
      owner_id,
      channel,
      priority,
      title_ru,
      body_ru,
      title_en,
      body_en,
      action_type,
      action_url,
      payload_json,
      status,
      scheduled_at,
      sent_at,
      expires_at
    )
    VALUES (
      $1,
      $2,
      $3::text,
      $4,
      $5::numeric,
      $6,
      $7,
      $8,
      $9,
      $10,
      $11,
      $12,
      $13,
      $14::jsonb,
      $15,
      $16::timestamptz,
      CASE WHEN $15 = 'sent' AND $17 IS NULL THEN NOW() ELSE $17::timestamptz END,
      $18::timestamptz
    )
    RETURNING
      id,
      notification_uid,
      target_type,
      target_id,
      owner_type,
      owner_id,
      channel,
      priority,
      title_ru,
      body_ru,
      title_en,
      body_en,
      action_type,
      action_url,
      payload_json,
      status,
      scheduled_at,
      sent_at,
      expires_at,
      created_at,
      updated_at
  `;

  const params = [
    notificationUid,
    targetType,
    targetId,
    ownerType,
    ownerId,
    channel,
    priority,
    titleRu,
    bodyRu,
    titleEn,
    bodyEn,
    actionType,
    actionUrl,
    payloadJson,
    status,
    scheduledAt,
    sentAt,
    expiresAt,
  ];

  const result = await pool.query(query, params);
  return result.rows[0] || null;
}

export async function createManyNotifications(pool, items = []) {
  if (!Array.isArray(items) || !items.length) {
    return [];
  }

  const rows = [];

  for (const item of items) {
    rows.push(await createNotification(pool, item));
  }

  return rows;
}

export async function listNotificationsForTarget(pool, filters = {}) {
  if (!pool || typeof pool.query !== "function") {
    throw new Error("POOL_REQUIRED");
  }

  const limitValue = Number.parseInt(String(filters.limit ?? 20), 10);
  const limit = Number.isFinite(limitValue) && limitValue > 0 ? Math.min(limitValue, 100) : 20;

  const clauses = [];
  const values = [];

  const targetType = normalizeFilterText(filters.target_type, 64);
  const targetId = normalizeText(filters.target_id, 255);
  const ownerType = normalizeFilterText(filters.owner_type, 64);
  const ownerId = normalizeOwnerId(filters.owner_id);
  const status = normalizeFilterText(filters.status, 32);
  const channel = normalizeFilterText(filters.channel, 32);

  if (targetType) {
    values.push(targetType);
    clauses.push(`target_type = $${values.length}`);
  }

  if (targetId) {
    values.push(targetId);
    clauses.push(`target_id = $${values.length}`);
  }

  if (ownerType) {
    values.push(ownerType);
    clauses.push(`owner_type = $${values.length}`);
  }

  if (ownerId !== null) {
    values.push(ownerId);
    clauses.push(`owner_id = $${values.length}`);
  }

  if (status) {
    values.push(status);
    clauses.push(`status = $${values.length}`);
  }

  if (channel) {
    values.push(channel);
    clauses.push(`channel = $${values.length}`);
  }

  const whereSql = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  values.push(limit);

  const result = await pool.query(
    `
    ${buildNotificationSelectSql()}
    ${whereSql}
    ORDER BY priority DESC NULLS LAST, sent_at DESC NULLS LAST, created_at DESC, id DESC
    LIMIT $${values.length}
    `,
    values,
  );

  return result.rows || [];
}

export async function markNotificationRead(pool, notificationUid, input = {}) {
  if (!pool || typeof pool.query !== "function") {
    throw new Error("POOL_REQUIRED");
  }

  const safeNotificationUid = normalizeText(notificationUid, 255);
  const readerType = normalizeReaderType(input.reader_type);
  const readerId = normalizeText(input.reader_id, 160);

  if (!safeNotificationUid || !readerType || !readerId) {
    return null;
  }

  const result = await pool.query(
    `
    WITH notification AS (
      SELECT id, notification_uid
      FROM public.app_notifications
      WHERE notification_uid = $1
        AND status = 'sent'
        AND channel = 'in_app'
        AND (expires_at IS NULL OR expires_at > NOW())
      LIMIT 1
    ),
    upserted AS (
      INSERT INTO public.app_notification_reads (
        notification_id,
        reader_type,
        reader_id,
        read_at
      )
      SELECT
        notification.id,
        $2,
        $3,
        NOW()
      FROM notification
      ON CONFLICT (notification_id, reader_type, reader_id)
      DO UPDATE SET read_at = public.app_notification_reads.read_at
      RETURNING
        notification_id,
        reader_type,
        reader_id,
        read_at
    )
    SELECT
      upserted.notification_id,
      upserted.reader_type,
      upserted.reader_id,
      upserted.read_at
    FROM upserted
    JOIN notification ON notification.id = upserted.notification_id
    `,
    [safeNotificationUid, readerType, readerId],
  );

  return result.rows[0] || null;
}

export async function countUnread(pool, filters = {}) {
  if (!pool || typeof pool.query !== "function") {
    throw new Error("POOL_REQUIRED");
  }

  const readerType = normalizeReaderType(filters.reader_type);
  const readerId = normalizeText(filters.reader_id, 160);

  if (!readerType || !readerId) {
    return 0;
  }

  const clauses = [
    `n.status = 'sent'`,
    `n.channel = 'in_app'`,
    `(n.expires_at IS NULL OR n.expires_at > NOW())`,
    `NOT EXISTS (
      SELECT 1
      FROM public.app_notification_reads r
      WHERE r.notification_id = n.id
        AND r.reader_type = $1
        AND r.reader_id = $2
    )`,
  ];

  const values = [readerType, readerId];

  const targetType = normalizeFilterText(filters.target_type, 64);
  const targetId = normalizeText(filters.target_id, 255);
  const ownerType = normalizeFilterText(filters.owner_type, 64);
  const ownerId = normalizeOwnerId(filters.owner_id);

  if (targetType) {
    values.push(targetType);
    clauses.push(`n.target_type = $${values.length}`);
  }

  if (targetId) {
    values.push(targetId);
    clauses.push(`n.target_id = $${values.length}`);
  }

  if (ownerType) {
    values.push(ownerType);
    clauses.push(`n.owner_type = $${values.length}`);
  }

  if (ownerId !== null) {
    values.push(ownerId);
    clauses.push(`n.owner_id = $${values.length}`);
  }

  const result = await pool.query(
    `
    SELECT COUNT(*)::int AS total_count
    FROM public.app_notifications n
    WHERE ${clauses.join(" AND ")}
    `,
    values,
  );

  return Number(result.rows?.[0]?.total_count || 0) || 0;
}

export default {
  normalizeText,
  normalizeJson,
  normalizeTargetType,
  normalizeChannel,
  normalizePriority,
  normalizeStatus,
  createNotification,
  createManyNotifications,
  listNotificationsForTarget,
  markNotificationRead,
  countUnread,
};
