// TOTEM owner cabinet profile — field-scoped persistence against existing tables.
// No new entities, no migrations, no auth identifier rewrites, no OTP changes.
import crypto from "node:crypto";
import { normalizeContactPhoneForBusiness } from "./contactPhone.js";
import { US_COUNTRY_PACK } from "../market-context/country-packs/US.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,126}[a-z0-9])?$/;
const REVISION = /^[0-9a-f]{64}$/;
const FIELDS = Object.freeze({
  salon: Object.freeze(["name", "description", "city", "phone", "logo_url"]),
  master: Object.freeze(["name"]),
});
const UNSUPPORTED = Object.freeze({
  salon: Object.freeze(["email", "whatsapp", "slot", "minBefore", "advance"]),
  master: Object.freeze(["photo", "bio", "phone", "email", "whatsapp",
    "slot", "minBefore", "advance"]),
});

function fail(status, code) {
  return { status, body: { ok: false, error: code } };
}

function normalizedRow(ownerType, row) {
  const result = {};
  for (const key of FIELDS[ownerType]) {
    result[key] = String(row[key] ?? "");
  }
  return result;
}

export function cabinetProfileRevision(ownerType, profile) {
  if (!FIELDS[ownerType]) throw new Error("PROFILE_OWNER_TYPE_INVALID");
  const canonical = FIELDS[ownerType].map(key => String(profile?.[key] ?? ""));
  return crypto.createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export function validateCabinetProfileBody(ownerType, body) {
  const expected = FIELDS[ownerType];
  if (!expected || !body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).length !== 2 ||
      !Object.hasOwn(body, "revision") ||
      !Object.hasOwn(body, "profile") ||
      typeof body.revision !== "string" || !REVISION.test(body.revision) ||
      !body.profile || typeof body.profile !== "object" ||
      Array.isArray(body.profile)) {
    return { ok: false, error: "PROFILE_BODY_INVALID" };
  }
  const keys = Object.keys(body.profile);
  if (keys.length !== expected.length ||
      keys.some(key => !expected.includes(key))) {
    return { ok: false, error: "PROFILE_FIELDS_UNSUPPORTED" };
  }

  const values = {};
  for (const key of expected) {
    if (typeof body.profile[key] !== "string" ||
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(body.profile[key])) {
      return { ok: false, error: "PROFILE_FIELD_INVALID" };
    }
    values[key] = body.profile[key].trim();
  }

  if (!values.name || values.name.length > 160 ||
      (ownerType === "salon" &&
        (values.description.length > 3000 ||
         values.city.length > 120 ||
         values.phone.length > 40 ||
         values.logo_url.length > 1024))) {
    return { ok: false, error: "PROFILE_FIELD_INVALID" };
  }

  if (ownerType === "salon" && values.logo_url) {
    try {
      const parsed = new URL(values.logo_url);
      if (parsed.protocol !== "https:" || !parsed.hostname ||
          parsed.username || parsed.password ||
          !/^[a-z0-9.-]+$/i.test(parsed.hostname)) {
        return { ok: false, error: "PROFILE_LOGO_URL_INVALID" };
      }
      values.logo_url = parsed.toString();
    } catch {
      return { ok: false, error: "PROFILE_LOGO_URL_INVALID" };
    }
  }
  return { ok: true, revision: body.revision, values };
}

function actorFor(auth, identity, ownerType) {
  const role = ownerType === "salon" ? "salon_admin" :
    ownerType === "master" ? "master" : "";
  const userText = String(auth?.user_id ?? "");
  if (!role || auth?.role !== role || auth?.source !== "session" ||
      !/^[1-9]\d*$/.test(userText) || !Number.isSafeInteger(Number(userText)) ||
      typeof auth.session_id !== "string" || !UUID.test(auth.session_id) ||
      (identity?.user_id != null &&
       String(identity.user_id) !== userText)) return null;
  for (const deadline of [auth.session_expires_at, auth.idle_timeout_at]) {
    if (deadline != null &&
        (!Number.isFinite(new Date(deadline).getTime()) ||
         new Date(deadline).getTime() <= Date.now())) return null;
  }
  return { userId: Number(userText), sessionId: auth.session_id, role };
}

async function verifiedSession(db, actor) {
  const result = await db.query(
    `SELECT u.email
       FROM public.auth_sessions sess
       JOIN public.auth_users u ON u.id=sess.user_id
      WHERE sess.id=$1 AND sess.user_id=$2
        AND sess.revoked_at IS NULL AND sess.expires_at>now()
        AND sess.last_seen_at>now()-interval '24 hours'
        AND u.enabled=true AND u.role=$3
      LIMIT 1`,
    [actor.sessionId, actor.userId, actor.role]
  );
  return result.rows[0] || null;
}

async function scopedOwner(db, ownerType, slug, userId, lock) {
  const sql = ownerType === "salon"
    ? `SELECT s.id, s.slug, s.name, s.description, s.city,
              s.phone, s.logo_url
         FROM public.salons s
         JOIN public.owner_salon os ON os.salon_id=s.id
           AND os.owner_id=$2::text AND os.status='active'
        WHERE s.slug=$1
        LIMIT 1${lock ? " FOR UPDATE OF s" : ""}`
    : `SELECT m.id, m.slug, m.name
         FROM public.masters m
        WHERE m.slug=$1 AND m.user_id=$2
        LIMIT 1${lock ? " FOR UPDATE OF m" : ""}`;
  const result = await db.query(sql, [slug, ownerType === "salon" ? String(userId) : userId]);
  return result.rows[0] || null;
}

function canWriteSubscription(row, now = Date.now()) {
  if (!row) return true; // Matches existing salon/master billing guards.
  if (row.blocked_at) return false;
  const chargeAt = row.next_charge_at ? new Date(row.next_charge_at).getTime() : null;
  const graceUntil = row.grace_until ? new Date(row.grace_until).getTime() : null;
  const state = chargeAt && chargeAt < now
    ? graceUntil && graceUntil >= now ? "grace" : "overdue"
    : row.subscription_status || "active";
  return state === "active" || state === "grace";
}

async function hasWriteAccess(db, ownerType, ownerId) {
  const result = await db.query(
    `SELECT subscription_status,blocked_at,next_charge_at,grace_until
       FROM public.billing_subscriptions
      WHERE owner_type=$1 AND owner_id=$2
      LIMIT 1`,
    [ownerType, ownerId]
  );
  return canWriteSubscription(result.rows[0] || null);
}

async function resolveProfilePhone(db, salonId, incoming) {
  if (!incoming) return { ok: true, phone: "" };
  const market = await db.query(
    `SELECT m.code FROM public.tenant_market_settings t
       JOIN public.markets m ON m.id=t.market_id
      WHERE t.salon_id=$1 LIMIT 1`,
    [salonId]
  );
  const marketCode = market.rows[0]?.code || null;
  if (!marketCode) return { ok: false, error: "PROFILE_MARKET_UNAVAILABLE" };
  const parsed = marketCode === "US"
    ? US_COUNTRY_PACK.normalizeBusinessPhone(incoming)
    : await normalizeContactPhoneForBusiness(db, incoming, {
      marketCode, required: true,
    });
  return parsed.ok ? {ok:true, phone:parsed.phone} :
    {ok:false,error:"PROFILE_PHONE_INVALID"};
}

function successful(ownerType, slug, row, session, canWrite, saved = false) {
  const profile = normalizedRow(ownerType, row);
  return {
    status: 200,
    body: {
      ok: true, owner_type: ownerType, owner_slug: slug,
      profile: { ...profile, email: String(session.email || "") },
      revision: cabinetProfileRevision(ownerType, profile),
      editable_fields: FIELDS[ownerType],
      unsupported_fields: UNSUPPORTED[ownerType],
      can_write: canWrite, saved,
    },
  };
}

function goodTarget(ownerType, slug) {
  return Boolean(FIELDS[ownerType] && typeof slug === "string" &&
    SLUG.test(slug));
}

async function withOwnerTransaction(pool, write, callback) {
  const db = await pool.connect();
  let opened = false;
  try {
    await db.query(write ? "BEGIN" : "BEGIN READ ONLY");
    opened = true;
    await db.query("SET LOCAL statement_timeout = '5000ms'");
    await db.query("SET LOCAL lock_timeout = '2000ms'");
    const result = await callback(db);
    if (write && result.status !== 200) return result;
    await db.query("COMMIT");
    opened = false;
    return result;
  } finally {
    if (opened) {
      try { await db.query("ROLLBACK"); } catch { /* release unhealthy session */ }
    }
    db.release();
  }
}

export async function readOwnerCabinetProfile(pool, {
  ownerType, ownerSlug, auth, identity,
} = {}) {
  if (!goodTarget(ownerType, ownerSlug)) return fail(400, "PROFILE_TARGET_INVALID");
  const actor = actorFor(auth, identity, ownerType);
  if (!actor) return fail(403, "PROFILE_SESSION_REQUIRED");
  return withOwnerTransaction(pool, false, async db => {
    const session = await verifiedSession(db, actor);
    if (!session) return fail(403, "PROFILE_SESSION_INVALID");
    const row = await scopedOwner(db, ownerType, ownerSlug, actor.userId, false);
    if (!row) return fail(404, "PROFILE_OWNER_NOT_FOUND");
    const canWrite = await hasWriteAccess(db, ownerType, row.id);
    return successful(ownerType, ownerSlug, row, session, canWrite);
  });
}

export async function saveOwnerCabinetProfile(pool, {
  ownerType, ownerSlug, auth, identity, body,
} = {}) {
  if (!goodTarget(ownerType, ownerSlug)) return fail(400, "PROFILE_TARGET_INVALID");
  const actor = actorFor(auth, identity, ownerType);
  if (!actor) return fail(403, "PROFILE_SESSION_REQUIRED");
  const input = validateCabinetProfileBody(ownerType, body);
  if (!input.ok) return fail(400, input.error);

  return withOwnerTransaction(pool, true, async db => {
    const session = await verifiedSession(db, actor);
    if (!session) return fail(403, "PROFILE_SESSION_INVALID");
    const before = await scopedOwner(db, ownerType, ownerSlug, actor.userId, true);
    if (!before) return fail(404, "PROFILE_OWNER_NOT_FOUND");
    if (!await hasWriteAccess(db, ownerType, before.id)) {
      return fail(403, "PROFILE_BILLING_BLOCKED");
    }
    if (cabinetProfileRevision(ownerType, normalizedRow(ownerType, before)) !==
        input.revision) {
      return fail(409, "PROFILE_REVISION_CONFLICT");
    }

    if (ownerType === "salon") {
      if (input.values.phone !== String(before.phone ?? "")) {
        const parsed = await resolveProfilePhone(db, before.id, input.values.phone);
        if (!parsed.ok) return fail(400, parsed.error);
        input.values.phone = parsed.phone;
      }
      await db.query(
        `UPDATE public.salons
            SET name=$2,description=NULLIF($3,''),city=NULLIF($4,''),
                phone=NULLIF($5,''),logo_url=NULLIF($6,'')
          WHERE id=$1`,
        [before.id, input.values.name, input.values.description,
          input.values.city, input.values.phone, input.values.logo_url]
      );
    } else {
      await db.query(
        "UPDATE public.masters SET name=$2 WHERE id=$1",
        [before.id, input.values.name]
      );
    }
    const after = await scopedOwner(db, ownerType, ownerSlug, actor.userId, false);
    if (!after ||
        JSON.stringify(normalizedRow(ownerType, after)) !==
        JSON.stringify(input.values)) {
      return fail(409, "PROFILE_STORAGE_READBACK_MISMATCH");
    }

    return successful(ownerType, ownerSlug, after, session, true, true);
  });
}

export function ownerCabinetProfileError(error) {
  if (["23505","40001","40P01"].includes(error?.code)) {
    return fail(409,"PROFILE_WRITE_CONFLICT");
  }
  if (["23514","23503","22001"].includes(error?.code)) {
    return fail(409,"PROFILE_DB_CONSTRAINT_REJECTED");
  }
  console.error("OWNER_CABINET_PROFILE_FAILED", String(error?.code || "UNKNOWN"));
  return fail(503,"PROFILE_STORAGE_UNAVAILABLE");
}
