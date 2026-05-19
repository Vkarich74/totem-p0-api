const ALLOWED_PUSH_PLATFORMS = new Set(["web", "pwa", "ios", "android"]);

function normalizeText(value, maxLength = 255) {
  const text = String(value ?? "").trim();

  if (!text) {
    return null;
  }

  return text.slice(0, maxLength);
}

function buildValidationError(status, error) {
  return {
    ok: false,
    status,
    error,
  };
}

function normalizePushPlatform(value) {
  const raw = String(value ?? "").trim().toLowerCase();

  if (!raw) {
    return "web";
  }

  return ALLOWED_PUSH_PLATFORMS.has(raw) ? raw : null;
}

function normalizePushEndpoint(value) {
  const endpoint = normalizeText(value, 2048);

  if (!endpoint) {
    return null;
  }

  try {
    const parsed = new URL(endpoint);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function normalizePushUserAgent(value) {
  return normalizeText(value, 512);
}

function normalizePushIdentity(value) {
  return normalizeText(value, 120);
}

function normalizePushKeys(subscription) {
  const isPlainObject =
    subscription &&
    typeof subscription === "object" &&
    !Array.isArray(subscription) &&
    Object.prototype.toString.call(subscription) === "[object Object]";

  if (!isPlainObject) {
    return { error: "PUSH_SUBSCRIPTION_REQUIRED" };
  }

  const endpointRaw = normalizeText(subscription.endpoint, 2048);
  if (!endpointRaw) {
    return { error: "PUSH_SUBSCRIPTION_ENDPOINT_REQUIRED" };
  }

  const endpoint = normalizePushEndpoint(endpointRaw);
  if (!endpoint) {
    return { error: "PUSH_SUBSCRIPTION_ENDPOINT_INVALID" };
  }

  const keys = subscription.keys;
  const isKeysObject =
    keys &&
    typeof keys === "object" &&
    !Array.isArray(keys) &&
    Object.prototype.toString.call(keys) === "[object Object]";

  if (!isKeysObject) {
    return { error: "PUSH_SUBSCRIPTION_KEYS_REQUIRED" };
  }

  const p256dh = normalizeText(keys.p256dh, 2048);
  if (!p256dh) {
    return { error: "PUSH_SUBSCRIPTION_P256DH_REQUIRED" };
  }

  const auth = normalizeText(keys.auth, 512);
  if (!auth) {
    return { error: "PUSH_SUBSCRIPTION_AUTH_REQUIRED" };
  }

  return {
    error: null,
    endpoint,
    p256dh,
    auth,
  };
}

function normalizePushSaveInput(input = {}) {
  const readerId = normalizePushIdentity(input.reader_id);
  if (!readerId) {
    return buildValidationError(400, "PUSH_SUBSCRIPTION_READER_ID_REQUIRED");
  }

  const deviceId = normalizePushIdentity(input.device_id);
  if (!deviceId) {
    return buildValidationError(400, "PUSH_SUBSCRIPTION_DEVICE_ID_REQUIRED");
  }

  const rawPlatform = String(input.platform ?? "").trim().toLowerCase();
  const platform = normalizePushPlatform(rawPlatform);

  if (!platform) {
    return buildValidationError(400, "PUSH_SUBSCRIPTION_PLATFORM_INVALID");
  }

  const subscriptionResult = normalizePushKeys(input.subscription);
  if (subscriptionResult.error) {
    return buildValidationError(400, subscriptionResult.error);
  }

  const userAgent = normalizePushUserAgent(input.user_agent);

  return {
    ok: true,
    readerId,
    deviceId,
    platform,
    endpoint: subscriptionResult.endpoint,
    p256dh: subscriptionResult.p256dh,
    auth: subscriptionResult.auth,
    userAgent,
  };
}

function normalizeOwnerPushSaveInput(input = {}) {
  const userType = normalizePushIdentity(input.user_type);
  if (!userType) {
    return buildValidationError(400, "PUSH_SUBSCRIPTION_USER_TYPE_REQUIRED");
  }

  if (!["master", "salon"].includes(userType)) {
    return buildValidationError(400, "PUSH_SUBSCRIPTION_USER_TYPE_INVALID");
  }

  const userId = normalizePushIdentity(input.user_id);
  if (!userId) {
    return buildValidationError(400, "PUSH_SUBSCRIPTION_USER_ID_REQUIRED");
  }

  const deviceId = normalizePushIdentity(input.device_id);
  if (!deviceId) {
    return buildValidationError(400, "PUSH_SUBSCRIPTION_DEVICE_ID_REQUIRED");
  }

  const rawPlatform = String(input.platform ?? "").trim().toLowerCase();
  const platform = normalizePushPlatform(rawPlatform);

  if (!platform) {
    return buildValidationError(400, "PUSH_SUBSCRIPTION_PLATFORM_INVALID");
  }

  const subscriptionResult = normalizePushKeys(input.subscription);
  if (subscriptionResult.error) {
    return buildValidationError(400, subscriptionResult.error);
  }

  const userAgent = normalizePushUserAgent(input.user_agent);

  return {
    ok: true,
    userType,
    userId,
    deviceId,
    platform,
    endpoint: subscriptionResult.endpoint,
    p256dh: subscriptionResult.p256dh,
    auth: subscriptionResult.auth,
    userAgent,
  };
}

function normalizePushRevokeInput(input = {}) {
  const readerId = normalizePushIdentity(input.reader_id);
  if (!readerId) {
    return buildValidationError(400, "PUSH_SUBSCRIPTION_READER_ID_REQUIRED");
  }

  const deviceId = normalizePushIdentity(input.device_id);
  if (!deviceId) {
    return buildValidationError(400, "PUSH_SUBSCRIPTION_DEVICE_ID_REQUIRED");
  }

  return {
    ok: true,
    readerId,
    deviceId,
  };
}

function normalizeOwnerPushRevokeInput(input = {}) {
  const userType = normalizePushIdentity(input.user_type);
  if (!userType) {
    return buildValidationError(400, "PUSH_SUBSCRIPTION_USER_TYPE_REQUIRED");
  }

  if (!["master", "salon"].includes(userType)) {
    return buildValidationError(400, "PUSH_SUBSCRIPTION_USER_TYPE_INVALID");
  }

  const userId = normalizePushIdentity(input.user_id);
  if (!userId) {
    return buildValidationError(400, "PUSH_SUBSCRIPTION_USER_ID_REQUIRED");
  }

  const deviceId = normalizePushIdentity(input.device_id);
  if (!deviceId) {
    return buildValidationError(400, "PUSH_SUBSCRIPTION_DEVICE_ID_REQUIRED");
  }

  return {
    ok: true,
    userType,
    userId,
    deviceId,
  };
}

function normalizeClientPushSaveInput(input = {}) {
  const clientIdRaw = Number.parseInt(String(input.client_id ?? input.clientId ?? ""), 10);
  if (!Number.isInteger(clientIdRaw) || clientIdRaw <= 0) {
    return buildValidationError(400, "PUSH_SUBSCRIPTION_CLIENT_ID_REQUIRED");
  }

  const deviceId = normalizePushIdentity(input.device_id ?? input.deviceId);
  if (!deviceId) {
    return buildValidationError(400, "PUSH_SUBSCRIPTION_DEVICE_ID_REQUIRED");
  }

  const rawPlatform = String(input.platform ?? "").trim().toLowerCase();
  const platform = normalizePushPlatform(rawPlatform);

  if (!platform) {
    return buildValidationError(400, "PUSH_SUBSCRIPTION_PLATFORM_INVALID");
  }

  const subscriptionResult = normalizePushKeys(input.subscription);
  if (subscriptionResult.error) {
    return buildValidationError(400, subscriptionResult.error);
  }

  const userAgent = normalizePushUserAgent(input.user_agent ?? input.userAgent);

  return {
    ok: true,
    clientId: clientIdRaw,
    deviceId,
    platform,
    endpoint: subscriptionResult.endpoint,
    p256dh: subscriptionResult.p256dh,
    auth: subscriptionResult.auth,
    userAgent,
  };
}

function normalizeClientPushRevokeInput(input = {}) {
  const clientIdRaw = Number.parseInt(String(input.client_id ?? input.clientId ?? ""), 10);
  if (!Number.isInteger(clientIdRaw) || clientIdRaw <= 0) {
    return buildValidationError(400, "PUSH_SUBSCRIPTION_CLIENT_ID_REQUIRED");
  }

  const deviceId = normalizePushIdentity(input.device_id ?? input.deviceId);
  if (!deviceId) {
    return buildValidationError(400, "PUSH_SUBSCRIPTION_DEVICE_ID_REQUIRED");
  }

  return {
    ok: true,
    clientId: clientIdRaw,
    deviceId,
  };
}

function normalizeClientPushStatusInput(input = {}) {
  const clientIdRaw = Number.parseInt(String(input.client_id ?? input.clientId ?? ""), 10);
  if (!Number.isInteger(clientIdRaw) || clientIdRaw <= 0) {
    return buildValidationError(400, "PUSH_SUBSCRIPTION_CLIENT_ID_REQUIRED");
  }

  const hasDeviceId = Object.prototype.hasOwnProperty.call(input, "device_id") ||
    Object.prototype.hasOwnProperty.call(input, "deviceId");

  if (!hasDeviceId) {
    return {
      ok: true,
      clientId: clientIdRaw,
      deviceId: null,
    };
  }

  const deviceIdRaw = input.device_id ?? input.deviceId;
  const deviceId = normalizePushIdentity(deviceIdRaw);
  if (!deviceId) {
    return buildValidationError(400, "PUSH_SUBSCRIPTION_DEVICE_ID_REQUIRED");
  }

  return {
    ok: true,
    clientId: clientIdRaw,
    deviceId,
  };
}

export function getWebPushPublicConfig() {
  const vapidPublicKey = String(process.env.VAPID_PUBLIC_KEY || "").trim();
  const vapidPrivateKey = String(process.env.VAPID_PRIVATE_KEY || "").trim();
  const vapidSubject = String(process.env.VAPID_SUBJECT || "").trim();

  const pushEnabled = Boolean(vapidPublicKey && vapidPrivateKey && vapidSubject);

  return {
    ok: true,
    push_enabled: pushEnabled,
    vapid_public_key: pushEnabled ? vapidPublicKey : null,
  };
}

export async function saveAnonymousMobilePushSubscription(pool, input = {}) {
  if (!pool || typeof pool.query !== "function") {
    throw new Error("POOL_REQUIRED");
  }

  const normalized = normalizePushSaveInput(input);
  if (!normalized.ok) {
    return normalized;
  }

  const subscriptionUid =
    normalizeText(input.subscription_uid, 255) ||
    `push_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  const result = await pool.query(
    `
    INSERT INTO public.push_subscriptions (
      subscription_uid,
      user_type,
      user_id,
      device_id,
      platform,
      endpoint,
      p256dh,
      auth,
      user_agent,
      enabled,
      created_at,
      last_seen_at,
      revoked_at
    )
    VALUES (
      $1,
      'anonymous_mobile',
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      $8,
      true,
      NOW(),
      NOW(),
      NULL
    )
    ON CONFLICT (user_type, user_id, device_id)
    DO UPDATE SET
      endpoint = EXCLUDED.endpoint,
      p256dh = EXCLUDED.p256dh,
      auth = EXCLUDED.auth,
      platform = EXCLUDED.platform,
      user_agent = EXCLUDED.user_agent,
      enabled = true,
      revoked_at = NULL,
      last_seen_at = NOW()
    RETURNING subscription_uid, enabled
    `,
    [
      subscriptionUid,
      normalized.readerId,
      normalized.deviceId,
      normalized.platform,
      normalized.endpoint,
      normalized.p256dh,
      normalized.auth,
      normalized.userAgent,
    ]
  );

  const row = result.rows[0] || null;

  return {
    ok: true,
    subscription_uid: row?.subscription_uid || subscriptionUid,
    enabled: Boolean(row?.enabled ?? true),
  };
}

export async function saveOwnerPushSubscription(pool, input = {}) {
  if (!pool || typeof pool.query !== "function") {
    throw new Error("POOL_REQUIRED");
  }

  const normalized = normalizeOwnerPushSaveInput(input);
  if (!normalized.ok) {
    return normalized;
  }

  const subscriptionUid =
    normalizeText(input.subscription_uid, 255) ||
    `push_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  const result = await pool.query(
    `
    INSERT INTO public.push_subscriptions (
      subscription_uid,
      user_type,
      user_id,
      device_id,
      platform,
      endpoint,
      p256dh,
      auth,
      user_agent,
      enabled,
      created_at,
      last_seen_at,
      revoked_at
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
      true,
      NOW(),
      NOW(),
      NULL
    )
    ON CONFLICT (user_type, user_id, device_id)
    DO UPDATE SET
      endpoint = EXCLUDED.endpoint,
      p256dh = EXCLUDED.p256dh,
      auth = EXCLUDED.auth,
      platform = EXCLUDED.platform,
      user_agent = EXCLUDED.user_agent,
      enabled = true,
      revoked_at = NULL,
      last_seen_at = NOW()
    RETURNING subscription_uid, enabled
    `,
    [
      subscriptionUid,
      normalized.userType,
      normalized.userId,
      normalized.deviceId,
      normalized.platform,
      normalized.endpoint,
      normalized.p256dh,
      normalized.auth,
      normalized.userAgent,
    ]
  );

  const row = result.rows[0] || null;

  return {
    ok: true,
    user_type: normalized.userType,
    user_id: normalized.userId,
    device_id: normalized.deviceId,
    subscription_uid: row?.subscription_uid || subscriptionUid,
    enabled: Boolean(row?.enabled ?? true),
  };
}

export async function revokeAnonymousMobilePushSubscription(pool, input = {}) {
  if (!pool || typeof pool.query !== "function") {
    throw new Error("POOL_REQUIRED");
  }

  const normalized = normalizePushRevokeInput(input);
  if (!normalized.ok) {
    return normalized;
  }

  const result = await pool.query(
    `
    UPDATE public.push_subscriptions
    SET
      enabled = false,
      revoked_at = NOW(),
      last_seen_at = NOW()
    WHERE user_type = 'anonymous_mobile'
      AND user_id = $1
      AND device_id = $2
    RETURNING subscription_uid
    `,
    [normalized.readerId, normalized.deviceId]
  );

  return {
    ok: true,
    revoked: result.rows.length > 0,
  };
}

export async function revokeOwnerPushSubscription(pool, input = {}) {
  if (!pool || typeof pool.query !== "function") {
    throw new Error("POOL_REQUIRED");
  }

  const normalized = normalizeOwnerPushRevokeInput(input);
  if (!normalized.ok) {
    return normalized;
  }

  const result = await pool.query(
    `
    UPDATE public.push_subscriptions
    SET
      enabled = false,
      revoked_at = NOW(),
      last_seen_at = NOW()
    WHERE user_type = $1
      AND user_id = $2
      AND device_id = $3
    RETURNING subscription_uid
    `,
    [normalized.userType, normalized.userId, normalized.deviceId]
  );

  return {
    ok: true,
    user_type: normalized.userType,
    user_id: normalized.userId,
    device_id: normalized.deviceId,
    revoked: result.rows.length > 0,
  };
}

export async function saveClientPushSubscription(pool, input = {}) {
  if (!pool || typeof pool.query !== "function") {
    throw new Error("POOL_REQUIRED");
  }

  const normalized = normalizeClientPushSaveInput(input);
  if (!normalized.ok) {
    return normalized;
  }

  const subscriptionUid =
    normalizeText(input.subscription_uid, 255) ||
    `push_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  const result = await pool.query(
    `
    INSERT INTO public.push_subscriptions (
      subscription_uid,
      user_type,
      user_id,
      device_id,
      platform,
      endpoint,
      p256dh,
      auth,
      user_agent,
      enabled,
      created_at,
      last_seen_at,
      revoked_at
    )
    VALUES (
      $1,
      'client',
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      $8,
      true,
      NOW(),
      NOW(),
      NULL
    )
    ON CONFLICT (user_type, user_id, device_id)
    DO UPDATE SET
      endpoint = EXCLUDED.endpoint,
      p256dh = EXCLUDED.p256dh,
      auth = EXCLUDED.auth,
      platform = EXCLUDED.platform,
      user_agent = EXCLUDED.user_agent,
      enabled = true,
      revoked_at = NULL,
      last_seen_at = NOW()
    RETURNING subscription_uid, enabled
    `,
    [
      subscriptionUid,
      String(normalized.clientId),
      normalized.deviceId,
      normalized.platform,
      normalized.endpoint,
      normalized.p256dh,
      normalized.auth,
      normalized.userAgent,
    ]
  );

  const row = result.rows[0] || null;

  return {
    ok: true,
    user_type: "client",
    user_id: String(normalized.clientId),
    device_id: normalized.deviceId,
    subscription_uid: row?.subscription_uid || subscriptionUid,
    enabled: Boolean(row?.enabled ?? true),
  };
}

export async function revokeClientPushSubscription(pool, input = {}) {
  if (!pool || typeof pool.query !== "function") {
    throw new Error("POOL_REQUIRED");
  }

  const normalized = normalizeClientPushRevokeInput(input);
  if (!normalized.ok) {
    return normalized;
  }

  const result = await pool.query(
    `
    UPDATE public.push_subscriptions
    SET
      enabled = false,
      revoked_at = NOW(),
      last_seen_at = NOW()
    WHERE user_type = 'client'
      AND user_id = $1
      AND device_id = $2
    RETURNING subscription_uid
    `,
    [String(normalized.clientId), normalized.deviceId]
  );

  return {
    ok: true,
    user_type: "client",
    user_id: String(normalized.clientId),
    device_id: normalized.deviceId,
    revoked: result.rows.length > 0,
  };
}

export async function getClientPushSubscriptionStatus(pool, input = {}) {
  if (!pool || typeof pool.query !== "function") {
    throw new Error("POOL_REQUIRED");
  }

  const normalized = normalizeClientPushStatusInput(input);
  if (!normalized.ok) {
    return normalized;
  }

  const values = [String(normalized.clientId)];
  let filterSql = "user_type = 'client' AND user_id = $1";

  if (normalized.deviceId) {
    values.push(normalized.deviceId);
    filterSql += ` AND device_id = $2`;
  }

  const result = await pool.query(
    `
    SELECT
      subscription_uid,
      user_type,
      user_id,
      device_id,
      platform,
      endpoint,
      enabled,
      created_at,
      last_seen_at,
      revoked_at
    FROM public.push_subscriptions
    WHERE ${filterSql}
    ORDER BY last_seen_at DESC NULLS LAST, created_at DESC NULLS LAST, device_id ASC
    `,
    values
  );

  return {
    ok: true,
    client_id: String(normalized.clientId),
    device_id: normalized.deviceId,
    subscriptions: result.rows.map((row) => ({
      subscription_uid: row.subscription_uid,
      user_type: row.user_type,
      user_id: row.user_id,
      device_id: row.device_id,
      platform: row.platform,
      endpoint: row.endpoint,
      enabled: Boolean(row.enabled),
      created_at: row.created_at,
      last_seen_at: row.last_seen_at,
      revoked_at: row.revoked_at,
      active: Boolean(row.enabled && !row.revoked_at),
    })),
  };
}

export default {
  getWebPushPublicConfig,
  saveAnonymousMobilePushSubscription,
  revokeAnonymousMobilePushSubscription,
  saveOwnerPushSubscription,
  revokeOwnerPushSubscription,
  saveClientPushSubscription,
  revokeClientPushSubscription,
  getClientPushSubscriptionStatus,
};
