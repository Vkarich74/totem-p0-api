import {checkUsSaasTransactionalWrite} from "./billing/usSaasTransactionalWriteGuard.js";
// TOTEM USA / TAX-02 — owner-scoped tax SETTINGS ONLY.
// Never calculates/charges a payment or applies tax outside US beauty services.
// Missing setting means 0.00% (rate_bps=0, revision=0) until the owner saves.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,126}[a-z0-9])?$/;

function integer(value, allowZero = false) {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) return null;
  if (allowZero ? value < 0 : value < 1) return null;
  return value;
}

function positiveAuthId(value) {
  const str = String(value ?? "");
  if (!/^[1-9]\d*$/.test(str)) return null;
  const id = Number(str);
  return Number.isSafeInteger(id) ? id : null;
}

function fail(status, code) {
  return { status, body: { ok: false, error: code } };
}

export function actorFor(auth, identity, ownerType) {
  const expectedRole = ownerType === "salon" ? "salon_admin" : "master";
  const userId = positiveAuthId(auth?.user_id);
  if (!userId || auth?.role !== expectedRole ||
      auth?.source !== "session" ||
      typeof auth.session_id !== "string" || !UUID.test(auth.session_id) ||
      (identity?.user_id != null &&
        String(identity.user_id) !== String(userId))) return null;
  for (const deadline of [auth.session_expires_at, auth.idle_timeout_at]) {
    if (deadline != null &&
        (!Number.isFinite(new Date(deadline).getTime()) ||
         new Date(deadline).getTime() <= Date.now())) return null;
  }
  return { userId, sessionId: auth.session_id, role: expectedRole };
}

function validTarget(ownerType, ownerSlug) {
  return (ownerType === "salon" || ownerType === "master") &&
    typeof ownerSlug === "string" && SLUG.test(ownerSlug);
}

function validatePutBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).length !== 2 ||
      !Object.hasOwn(body, "rate_bps") ||
      !Object.hasOwn(body, "expected_revision")) return null;
  const rate = integer(body.rate_bps, true);
  const revision = integer(body.expected_revision, true);
  if (rate === null || rate > 10000 || revision === null) return null;
  return { rate, revision };
}

function success(ownerType, ownerSlug, ownerId, row, marketId) {
  const rate = Number(row?.rate_bps ?? 0);
  const revision = Number(row?.revision ?? 0);
  return {
    status: 200,
    body: {
      ok: true,
      market_code: "US",
      currency_code: "USD",
      payment_purpose: "beauty_service",
      owner_type: ownerType,
      owner_slug: ownerSlug,
      owner_id: ownerId,
      market_id: Number(marketId),
      rate_bps: rate,
      tax_percent: (rate / 100).toFixed(2),
      revision,
      configured: Boolean(row),
    },
  };
}

export async function checkSession(db, actor, write) {
  const row = await db.query(
    `SELECT 1 FROM public.auth_sessions s
       JOIN public.auth_users u ON u.id=s.user_id
      WHERE s.id=$1 AND s.user_id=$2
        AND s.revoked_at IS NULL AND s.expires_at>now()
        AND s.last_seen_at>now()-interval '24 hours'
        AND u.enabled IS TRUE AND u.role=$3
      LIMIT 1${write ? " FOR SHARE OF s,u" : ""}`,
    [actor.sessionId, actor.userId, actor.role]
  );
  return row.rows.length === 1;
}

export async function ownerContext(db, ownerType, ownerSlug, userId, write) {
  // SQL checks direct canonical ownership, never inferred master_salon
  // identity memberships. A master may also work at KG salons but this
  // setting can be used only inside an explicitly US/ USD booking.
  const ownerSql = ownerType === "salon"
    ? `SELECT s.id AS owner_id, m.id AS market_id
         FROM public.salons s
         JOIN public.owner_salon os
           ON os.salon_id=s.id AND os.owner_id=$2::text
           AND os.status='active'
         JOIN public.tenant_market_settings tm ON tm.salon_id=s.id
         JOIN public.markets m ON m.id=tm.market_id
        WHERE s.slug=$1 AND s.enabled IS TRUE AND s.status='active'
          AND m.code='US' AND m.active IS TRUE
          AND m.default_currency='USD' AND m.country_code='US'
        LIMIT 1${write ? " FOR SHARE OF s,os,tm,m" : ""}`
    : `SELECT master.id AS owner_id, m.id AS market_id
         FROM public.masters master
         JOIN public.master_salon ms
           ON ms.master_id=master.id AND ms.status='active'
         JOIN public.tenant_market_settings tm ON tm.salon_id=ms.salon_id
         JOIN public.salons s ON s.id=ms.salon_id
         JOIN public.markets m ON m.id=tm.market_id
        WHERE master.slug=$1 AND master.user_id=$2
          AND master.active IS TRUE AND s.enabled IS TRUE
          AND s.status='active' AND m.code='US' AND m.active IS TRUE
          AND m.default_currency='USD' AND m.country_code='US'
        ORDER BY m.id
        LIMIT 1${write ? " FOR SHARE OF master,ms,tm,s,m" : ""}`;
  const response = await db.query(ownerSql, [ownerSlug, ownerType === "salon" ? String(userId) : userId]);
  return response.rows[0] || null;
}

export async function transact(pool, write, action) {
  const client = await pool.connect();
  let opened = false;
  try {
    await client.query(write ? "BEGIN" : "BEGIN READ ONLY");
    opened = true;
    await client.query("SET LOCAL statement_timeout = '4500ms'");
    await client.query("SET LOCAL lock_timeout = '2000ms'");
    const answer = await action(client);
    if (write && answer.status === 200) {
      await client.query("COMMIT");
      opened = false;
    }
    return answer;
  } finally {
    if (opened) {
      try { await client.query("ROLLBACK"); }
      catch { /* client is released as unhealthy by pg on actual errors */ }
    }
    client.release();
  }
}

function validateRequest({ ownerType, ownerSlug, auth, identity, body, write }) {
  if (!validTarget(ownerType, ownerSlug)) {
    return { failure: fail(400, "US_TAX_OWNER_TARGET_INVALID") };
  }
  const actor = actorFor(auth, identity, ownerType);
  if (!actor) return { failure: fail(403, "US_TAX_OWNER_SESSION_REQUIRED") };
  if (write) {
    const parsed = validatePutBody(body);
    if (!parsed) return { failure: fail(400, "US_TAX_RATE_OR_REVISION_INVALID") };
    return { actor, parsed };
  }
  return { actor };
}

export async function readUsOwnerServiceTax(pool, options = {}) {
  const { ownerType, ownerSlug, auth, identity } = options;
  const request = validateRequest({ ownerType, ownerSlug, auth, identity, write: false });
  if (request.failure) return request.failure;
  return transact(pool, false, async db => {
    if (!await checkSession(db, request.actor, false)) {
      return fail(403, "US_TAX_OWNER_SESSION_INVALID");
    }
    const scope = await ownerContext(
      db, ownerType, ownerSlug, request.actor.userId, false
    );
    if (!scope) return fail(404, "US_TAX_OWNER_NOT_FOUND");
    const result = await db.query(
      `SELECT rate_bps, revision
         FROM public.us_owner_service_tax_settings
        WHERE owner_type=$1 AND owner_id=$2 AND market_id=$3 LIMIT 1`,
      [ownerType, scope.owner_id, scope.market_id]
    );
    return success(ownerType, ownerSlug, scope.owner_id, result.rows[0] || null, scope.market_id);
  });
}

export async function saveUsOwnerServiceTax(pool, options = {}) {
  const { ownerType, ownerSlug, auth, identity, body } = options;
  const request = validateRequest({ ownerType, ownerSlug, auth, identity, body, write: true });
  if (request.failure) return request.failure;
  return transact(pool, true, async db => {
    if (!await checkSession(db, request.actor, true)) {
      return fail(403, "US_TAX_OWNER_SESSION_INVALID");
    }
    const scope = await ownerContext(
      db, ownerType, ownerSlug, request.actor.userId, true
    );
    if (!scope) return fail(404, "US_TAX_OWNER_NOT_FOUND");
    const entitlement=await checkUsSaasTransactionalWrite(db,ownerType,scope);
    if(entitlement)return entitlement;
    const prior = await db.query(
      `SELECT rate_bps, revision FROM public.us_owner_service_tax_settings
        WHERE owner_type=$1 AND owner_id=$2 AND market_id=$3
        FOR UPDATE`,
      [ownerType, scope.owner_id, scope.market_id]
    );
    const previous = prior.rows[0] || null;
    if (Number(previous?.revision ?? 0) !== request.parsed.revision) {
      return fail(409, "US_TAX_SETTING_REVISION_CONFLICT");
    }
    const updated = previous
      ? await db.query(
          `UPDATE public.us_owner_service_tax_settings
              SET rate_bps=$4, updated_by_user_id=$5
            WHERE owner_type=$1 AND owner_id=$2 AND market_id=$3
              AND revision=$6
            RETURNING rate_bps,revision`,
          [ownerType,scope.owner_id,scope.market_id,
            request.parsed.rate,request.actor.userId,request.parsed.revision]
        )
      : await db.query(
          `INSERT INTO public.us_owner_service_tax_settings
             (owner_type,owner_id,market_id,rate_bps,updated_by_user_id)
           VALUES ($1,$2,$3,$4,$5)
           RETURNING rate_bps,revision`,
          [ownerType,scope.owner_id,scope.market_id,
            request.parsed.rate,request.actor.userId]
        );
    if (updated.rows.length !== 1) {
      return fail(409, "US_TAX_SETTING_REVISION_CONFLICT");
    }
    const commitEntitlement=await checkUsSaasTransactionalWrite(db,ownerType,scope);
    if(commitEntitlement)return commitEntitlement;
    return success(ownerType,ownerSlug,scope.owner_id,updated.rows[0],scope.market_id);
  });
}

export function taxSettingsErrorResponse(error) {
  if (error?.code === "23505" || error?.code === "40001" ||
      error?.code === "40P01") {
    return fail(409,"US_TAX_SETTING_REVISION_CONFLICT");
  }
  if (error?.code === "23514" || error?.code === "23503") {
    return fail(409,"US_TAX_SETTING_INTEGRITY_REJECTED");
  }
  console.error("US_TAX_SETTINGS_STORAGE_FAILED",String(error?.code || "UNKNOWN"));
  return fail(503,"US_TAX_SETTINGS_UNAVAILABLE");
}
