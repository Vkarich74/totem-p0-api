import { resolveMarketContext } from "../../market-context/MarketContextResolver.js";
import { resolveOwnerMarketContext } from "../../market-context/BusinessContext.js";
import { readUserLocale } from "../../market-context/UserLocaleService.js";

const unresolvedMaster = new Set(["OWNER_MARKET_CONTEXT_NOT_FOUND", "OWNER_MARKET_CONTEXT_AMBIGUOUS"]);
const defaults = { market: resolveMarketContext, owner: resolveOwnerMarketContext, preference: readUserLocale };
const positiveId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;

async function ownerContext(db, type, id, resolvers) {
  try { return await resolvers.owner(db, { ownerType: type, ownerId: id }); }
  catch (error) {
    if (type !== "master" || !unresolvedMaster.has(error.code)) throw error;
    return resolvers.market({ db });
  }
}

export function chooseRecipientLocale(context, preference, requestedLocale) {
  const allowed = context?.supported_locales || [];
  if (allowed.includes(requestedLocale)) return { locale: requestedLocale, source: "request" };
  if (allowed.includes(preference)) return { locale: preference, source: "user" };
  if (allowed.includes(context?.locale)) return { locale: context.locale, source: "market_context" };
  throw Object.assign(new Error("RECIPIENT_LOCALE_UNAVAILABLE"), { code: "RECIPIENT_LOCALE_UNAVAILABLE" });
}

// The user ID comes from the resolved recipient, never from a caller's UI identity.
export async function resolveRecipientLocale(db, options = {}, resolvers = defaults) {
  const userId = positiveId(options.userId);
  let context = options.context;
  if (!context && userId) {
    const result = await db.query("SELECT id, role, salon_slug, master_slug, enabled FROM public.auth_users WHERE id = $1 LIMIT 1", [userId]);
    const user = result.rows[0];
    if (!user || user.enabled !== true) throw Object.assign(new Error("RECIPIENT_NOT_FOUND"), { code: "RECIPIENT_NOT_FOUND" });
    const type = user.role === "master" ? "master" : user.role === "salon_admin" ? "salon" : null;
    const slug = type === "master" ? user.master_slug : user.salon_slug;
    if (type && slug) {
      const owner = await db.query("SELECT id FROM public." + (type === "salon" ? "salons" : "masters") + " WHERE slug = $1 LIMIT 1", [slug]);
      const id = positiveId(owner.rows[0]?.id);
      if (!id) throw Object.assign(new Error("RECIPIENT_OWNER_NOT_FOUND"), { code: "RECIPIENT_OWNER_NOT_FOUND" });
      context = await ownerContext(db, type, id, resolvers);
    }
  }
  if (!context && ["salon", "master"].includes(options.ownerType) && positiveId(options.ownerId)) {
    context = await ownerContext(db, options.ownerType, positiveId(options.ownerId), resolvers);
  }
  context ||= await resolvers.market({ db });
  const preference = userId ? (await resolvers.preference(db, userId, context)).locale : null;
  return { ...chooseRecipientLocale(context, preference, options.requestedLocale), context };
}

export async function resolveNotificationRecipientLocale(db, notification = {}, resolvers = defaults) {
  const type = String(notification.target_type || "");
  const id = positiveId(notification.target_id);
  if (type === "auth_user" && id) return resolveRecipientLocale(db, { userId: id }, resolvers);
  if (["salon", "master"].includes(type) && id) {
    const context = await ownerContext(db, type, id, resolvers);
    const owner = await db.query("SELECT slug FROM public." + (type === "salon" ? "salons" : "masters") + " WHERE id = $1 LIMIT 1", [id]);
    const slug = owner.rows[0]?.slug;
    if (!slug) throw Object.assign(new Error("RECIPIENT_OWNER_NOT_FOUND"), { code: "RECIPIENT_OWNER_NOT_FOUND" });
    const column = type === "salon" ? "salon_slug" : "master_slug";
    const users = await db.query("SELECT id FROM public.auth_users WHERE " + column + " = $1 AND role = $2 AND enabled = true LIMIT 2", [slug, type === "salon" ? "salon_admin" : "master"]);
    // A shared owner target cannot be attributed to an arbitrary administrator.
    return resolveRecipientLocale(db, { context, userId: users.rows.length === 1 ? users.rows[0].id : null }, resolvers);
  }
  const salonId = positiveId(notification.payload_json?.salon_id);
  const context = await resolvers.market({ db, ...(salonId ? { salonId } : {}) });
  return resolveRecipientLocale(db, { context }, resolvers);
}
