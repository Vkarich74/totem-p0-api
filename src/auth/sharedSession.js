import crypto from "crypto";

function isExpired(ts) {
  if (!ts) return false;
  const time = new Date(ts).getTime();
  if (!Number.isFinite(time)) return false;
  return time < Date.now();
}

function computeIdleTimeoutAt(lastSeenAt) {
  if (!lastSeenAt) return null;
  const time = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(time)) return null;
  return new Date(time + 24 * 60 * 60 * 1000).toISOString();
}

export function isAuthResolveSessionExpired(auth) {
  if (!auth?.session_expires_at) {
    return false;
  }

  return isExpired(auth.session_expires_at);
}

export function isAuthResolveIdleExpired(auth) {
  if (!auth?.idle_timeout_at) {
    return false;
  }

  return isExpired(auth.idle_timeout_at);
}

export async function createAuthSession(db, userId) {
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const lastSeenAt = new Date();

  const sessionColumnsRes = await db.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema='public'
       AND table_name='auth_sessions'`
  );

  const sessionColumns = new Set(
    (sessionColumnsRes.rows || []).map((row) => String(row.column_name || "").trim())
  );

  const insertColumns = [];
  const insertValues = [];
  const insertParams = [];
  let paramIndex = 1;

  function pushValue(columnName, value, { useNow = false, useNull = false } = {}) {
    insertColumns.push(columnName);

    if (useNow) {
      insertValues.push("NOW()");
      return;
    }

    if (useNull) {
      insertValues.push("NULL");
      return;
    }

    insertValues.push(`$${paramIndex}`);
    insertParams.push(value);
    paramIndex += 1;
  }

  if (sessionColumns.has("id")) {
    pushValue("id", sessionId);
  }

  if (sessionColumns.has("user_id")) {
    pushValue("user_id", userId);
  }

  if (sessionColumns.has("created_at")) {
    pushValue("created_at", null, { useNow: true });
  }

  if (sessionColumns.has("expires_at")) {
    pushValue("expires_at", expiresAt);
  }

  if (sessionColumns.has("last_seen_at")) {
    pushValue("last_seen_at", lastSeenAt);
  }

  if (sessionColumns.has("revoked_at")) {
    pushValue("revoked_at", null, { useNull: true });
  }

  if (sessionColumns.has("revoked_reason")) {
    pushValue("revoked_reason", null, { useNull: true });
  }

  if (sessionColumns.has("ip_address")) {
    pushValue("ip_address", null, { useNull: true });
  }

  if (sessionColumns.has("user_agent")) {
    pushValue("user_agent", null, { useNull: true });
  }

  if (
    !insertColumns.length ||
    !sessionColumns.has("id") ||
    !sessionColumns.has("user_id") ||
    !sessionColumns.has("expires_at")
  ) {
    throw new Error("AUTH_SESSIONS_SCHEMA_INVALID");
  }

  await db.query(
    `INSERT INTO public.auth_sessions (${insertColumns.join(", ")})
     VALUES (${insertValues.join(", ")})`,
    insertParams
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
    [sessionId, reason]
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
    [userId, reason]
  );
}
