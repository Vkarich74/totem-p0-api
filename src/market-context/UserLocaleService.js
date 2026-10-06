import { resolveMarketContext } from "./MarketContextResolver.js";
import { resolveOwnerMarketContext } from "./BusinessContext.js";

export function localeError(code, statusCode = 400) {
  return Object.assign(new Error(code), { code, statusCode });
}

function positiveId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function requireLocaleSession(req) {
  const auth = req.auth;
  const userId = positiveId(auth?.user_id);
  if (!userId || !["master", "salon_admin"].includes(auth?.role) ||
      auth.source !== "session" || !auth.session_id ||
      Number(req.identity?.user_id) !== userId) {
    throw localeError("UNAUTHORIZED", 401);
  }
  for (const deadline of [auth.session_expires_at, auth.idle_timeout_at]) {
    const timestamp = new Date(deadline).getTime();
    if (!deadline || !Number.isFinite(timestamp) || timestamp <= Date.now()) {
      throw localeError("UNAUTHORIZED", 401);
    }
  }
  return userId;
}

export function identityOwnerIds(identity, type) {
  const ids = new Set();
  const list = type === "salon" ? identity?.salons : identity?.masters;
  for (const item of Array.isArray(list) ? list : []) {
    const id = positiveId(item && typeof item === "object"
      ? item.id ?? item[type + "_id"] ?? item.owner_id : item);
    if (id) ids.add(id);
  }
  for (const item of Array.isArray(identity?.ownership) ? identity.ownership : []) {
    if ((item?.owner_type ?? item?.type) !== type) continue;
    const id = positiveId(item.owner_id ?? item[type + "_id"] ?? item.id);
    if (id) ids.add(id);
  }
  return ids;
}

const defaultResolvers = {
  market: resolveMarketContext,
  owner: resolveOwnerMarketContext,
};
const unresolvedMasterCodes = new Set([
  "OWNER_MARKET_CONTEXT_NOT_FOUND", "OWNER_MARKET_CONTEXT_AMBIGUOUS",
]);

export async function resolveLocaleOwnerContext(db, identity, type, slug, resolvers = defaultResolvers) {
  if (!["salon", "master"].includes(type) || typeof slug !== "string" ||
      !slug.trim() || slug.length > 255) {
    throw localeError("LOCALE_OWNER_INVALID");
  }
  // Table names are chosen from the closed enum, never from request text.
  const table = type === "salon" ? "salons" : "masters";
  const result = await db.query(
    "SELECT id FROM public." + table + " WHERE slug = $1 LIMIT 1", [slug.trim()]
  );
  const id = positiveId(result.rows[0]?.id);
  if (!id) throw localeError("OWNER_NOT_FOUND", 404);
  if (!identityOwnerIds(identity, type).has(id)) throw localeError("FORBIDDEN", 403);
  try {
    const context = await resolvers.owner(db, { ownerType: type, ownerId: id });
    return { context, business_context_status: "resolved", context_source: "owner" };
  } catch (error) {
    if (type !== "master" || !unresolvedMasterCodes.has(error.code)) throw error;
    return {
      context: await resolvers.market({ db }),
      business_context_status: "unresolved",
      context_source: "platform_ui_default",
    };
  }
}

export async function resolveAccessibleLocaleMarket(db, identity, code, resolvers = defaultResolvers) {
  if (typeof code !== "string" || !/^[A-Z][A-Z0-9_-]{1,31}$/.test(code)) {
    throw localeError("LOCALE_MARKET_INVALID");
  }
  const salons = [...identityOwnerIds(identity, "salon")];
  const masters = [...identityOwnerIds(identity, "master")];
  const bindings = await db.query(
    `SELECT DISTINCT m.code
       FROM public.markets m
       JOIN public.tenant_market_settings t ON t.market_id = m.id
       WHERE m.active = true AND (
         t.salon_id = ANY($1::integer[]) OR EXISTS (
           SELECT 1 FROM public.master_salon ms
           WHERE ms.salon_id = t.salon_id AND ms.status = 'active'
             AND ms.master_id = ANY($2::integer[])
         )
       )`, [salons, masters]
  );
  const allowed = new Set(bindings.rows.map(row => row.code));
  if (!allowed.has(code)) {
    // Only a verified owned master with an unresolved business context may
    // use the platform default as a UI preference scope.
    for (const id of masters) {
      try {
        await resolvers.owner(db, { ownerType: "master", ownerId: id });
      } catch (error) {
        if (!unresolvedMasterCodes.has(error.code)) throw error;
        const fallback = await resolvers.market({ db });
        allowed.add(fallback.market_code);
        break;
      }
    }
  }
  if (!allowed.has(code)) throw localeError("FORBIDDEN", 403);
  return resolvers.market({ db, marketCode: code });
}

export async function readUserLocale(db, userId, context) {
  const id = positiveId(userId);
  if (!id) throw localeError("UNAUTHORIZED", 401);
  const result = await db.query(
    "SELECT locale FROM public.user_locale_preferences WHERE user_id = $1 AND market_id = $2",
    [id, context.market_id]
  );
  const stored = result.rows[0]?.locale;
  const locale = context.supported_locales.includes(stored) ? stored : null;
  return {
    locale,
    effective_locale: locale ?? context.locale,
    preference_source: locale ? "user" : "market_context",
  };
}

// Caller supplies a transaction when using a Pool. Locks serialize supported
// language changes with preference saves. Database triggers also enforce this.
export async function writeUserLocale(db, userId, context, locale) {
  const id = positiveId(userId);
  if (!id) throw localeError("UNAUTHORIZED", 401);
  if (typeof locale !== "string" || !locale || locale !== locale.trim()) {
    throw localeError("LOCALE_UNSUPPORTED");
  }
  const market = await db.query(
    "SELECT supported_locales, active FROM public.markets WHERE id = $1 FOR SHARE",
    [context.market_id]
  );
  const row = market.rows[0];
  if (!row || row.active !== true) throw localeError("MARKET_INACTIVE", 409);
  if (!row.supported_locales.includes(locale)) throw localeError("LOCALE_UNSUPPORTED");
  const saved = await db.query(
    `INSERT INTO public.user_locale_preferences (user_id, market_id, locale)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, market_id)
     DO UPDATE SET locale = EXCLUDED.locale, updated_at = now()
     RETURNING locale, updated_at`, [id, context.market_id, locale]
  );
  return { ...saved.rows[0], effective_locale: locale, preference_source: "user" };
}
