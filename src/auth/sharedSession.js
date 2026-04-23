import crypto from "crypto";

function isExpired(value) {
  if (!value) {
    return false;
  }

  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) {
    return false;
  }

  return ts < Date.now();
}

function computeIdleTimeoutAt(lastSeenAt) {
  if (!lastSeenAt) {
    return null;
  }

  const ts = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(ts)) {
    return null;
  }

  return new Date(ts + 24 * 60 * 60 * 1000).toISOString();
}

export function isAuthResolveSessionExpired(auth) {
  return isExpired(auth?.session_expires_at);
}

export function isAuthResolveIdleExpired(auth) {
  return isExpired(auth?.idle_timeout_at);
}

export async function createAuthSession(db, userId) {
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const lastSeenAt = new Date();

  const schemaResult = await db.query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'auth_sessions'
    `,
  );

  const columns = new Set(
    (schemaResult.rows || []).map((row) => String(row.column_name || "").trim()),
  );

  const insertColumns = [];
  const insertValues = [];
  const params = [];
  let paramIndex = 1;

  function pushColumn(column, value, { raw = false } = {}) {
    insertColumns.push(column);
    if (raw) {
      insertValues.push(String(value));
      return;
    }

    insertValues.push(`$${paramIndex}`);
    params.push(value);
    paramIndex += 1;
  }

  if (columns.has("id")) {
    pushColumn("id", sessionId);
  }

  if (columns.has("user_id")) {
    pushColumn("user_id", userId);
  }

  if (columns.has("created_at")) {
    pushColumn("created_at", "NOW()", { raw: true });
  }

  if (columns.has("expires_at")) {
    pushColumn("expires_at", expiresAt);
  }

  if (columns.has("last_seen_at")) {
    pushColumn("last_seen_at", lastSeenAt);
  }

  if (columns.has("revoked_at")) {
    pushColumn("revoked_at", "NULL", { raw: true });
  }

  if (columns.has("revoked_reason")) {
    pushColumn("revoked_reason", "NULL", { raw: true });
  }

  if (columns.has("ip_address")) {
    pushColumn("ip_address", "NULL", { raw: true });
  }

  if (columns.has("user_agent")) {
    pushColumn("user_agent", "NULL", { raw: true });
  }

  if (!insertColumns.length || !columns.has("id") || !columns.has("user_id") || !columns.has("expires_at")) {
    throw new Error("AUTH_SESSIONS_SCHEMA_INVALID");
  }

  await db.query(
    `
    INSERT INTO public.auth_sessions (${insertColumns.join(", ")})
    VALUES (${insertValues.join(", ")})
    `,
    params,
  );

  return {
    id: sessionId,
    expires_at: expiresAt.toISOString(),
    last_seen_at: lastSeenAt.toISOString(),
    idle_timeout_at: computeIdleTimeoutAt(lastSeenAt.toISOString()),
  };
}

export async function revokeAuthSession(db, sessionId, reason = "logout") {
  return db.query(
    `
    UPDATE public.auth_sessions
    SET revoked_at = NOW(),
        revoked_reason = $2
    WHERE id = $1
      AND revoked_at IS NULL
    `,
    [sessionId, reason],
  );
}

export async function revokeAuthSessionsByUser(db, userId, reason = "logout_all") {
  return db.query(
    `
    UPDATE public.auth_sessions
    SET revoked_at = NOW(),
        revoked_reason = $2
    WHERE user_id = $1
      AND revoked_at IS NULL
    `,
    [userId, reason],
  );
}
