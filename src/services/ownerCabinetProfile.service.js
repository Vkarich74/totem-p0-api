// Shared owner-profile FIELD CONTRACT ONLY.
// Authorization, billing, owner resolution and transactions remain inside
// the existing canonical /salons/:slug and /masters/:slug routers.
// No secondary profile router or parallel identity subsystem.
import crypto from "node:crypto";
import { normalizeContactPhoneForBusiness } from "./contactPhone.js";
import { US_COUNTRY_PACK } from "../market-context/country-packs/US.js";

export const OWNER_PROFILE_FIELDS = Object.freeze({
  salon: Object.freeze(["name", "description", "city", "phone", "logo_url"]),
  master: Object.freeze(["name"]),
});
const UNSUPPORTED = Object.freeze({
  salon: Object.freeze(["whatsapp", "slot", "minBefore", "advance"]),
  master: Object.freeze(["photo", "bio", "phone", "whatsapp", "slot", "minBefore", "advance"]),
});
const REVISION = /^[a-f0-9]{64}$/;

export function canonicalOwnerProfile(ownerType, row) {
  if (!OWNER_PROFILE_FIELDS[ownerType] || !row) {
    throw new Error("PROFILE_TARGET_INVALID");
  }
  return Object.fromEntries(
    OWNER_PROFILE_FIELDS[ownerType].map(key => [key, String(row[key] ?? "")])
  );
}

export function ownerProfileRevision(ownerType, row) {
  return crypto.createHash("sha256")
    .update(JSON.stringify(OWNER_PROFILE_FIELDS[ownerType].map(key =>
      String(row?.[key] ?? ""))))
    .digest("hex");
}

export function validateOwnerProfilePatch(ownerType, body) {
  const fields = OWNER_PROFILE_FIELDS[ownerType];
  if (!fields || !body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).length !== 2 || !Object.hasOwn(body, "revision") ||
      !Object.hasOwn(body, "profile") ||
      typeof body.revision !== "string" || !REVISION.test(body.revision) ||
      !body.profile || typeof body.profile !== "object" ||
      Array.isArray(body.profile)) {
    return {ok:false,error:"PROFILE_BODY_INVALID"};
  }
  const keys = Object.keys(body.profile);
  if (keys.length !== fields.length || keys.some(key => !fields.includes(key))) {
    return {ok:false,error:"PROFILE_FIELDS_UNSUPPORTED"};
  }
  const values = {};
  for (const field of fields) {
    const value = body.profile[field];
    if (typeof value !== "string" ||
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) {
      return {ok:false,error:"PROFILE_FIELD_INVALID"};
    }
    values[field] = value.trim();
  }
  if (!values.name || values.name.length > 160 ||
      (ownerType === "salon" && (
        values.description.length > 3000 ||
        values.city.length > 120 ||
        values.phone.length > 40 ||
        values.logo_url.length > 1024
      ))) return {ok:false,error:"PROFILE_FIELD_INVALID"};

  if (ownerType === "salon" && values.logo_url) {
    try {
      const url = new URL(values.logo_url);
      if (url.protocol !== "https:" || !url.hostname ||
          url.username || url.password ||
          !/^[a-z0-9.-]+$/i.test(url.hostname)) {
        return {ok:false,error:"PROFILE_LOGO_URL_INVALID"};
      }
      values.logo_url = url.toString();
    }catch {
      return {ok:false,error:"PROFILE_LOGO_URL_INVALID"};
    }
  }
  return {ok:true,revision:body.revision,values};
}

export async function canonicalSalonContact(db, salonId, value) {
  if (!value) return {ok:true,phone:""};
  const result = await db.query(
    `SELECT m.code FROM public.tenant_market_settings t
       JOIN public.markets m ON m.id=t.market_id
      WHERE t.salon_id=$1 LIMIT 1`, [salonId]
  );
  const marketCode = result.rows[0]?.code || "";
  if (!marketCode) return {ok:false,error:"PROFILE_MARKET_UNAVAILABLE"};
  const contact = marketCode === "US"
    ? US_COUNTRY_PACK.normalizeBusinessPhone(value)
    : await normalizeContactPhoneForBusiness(db,value,{marketCode,required:true});
  return contact.ok
    ? {ok:true,phone:contact.phone}
    : {ok:false,error:"PROFILE_PHONE_INVALID"};
}

export function ownerProfilePayload(ownerType, slug, row, email, canWrite, saved = false) {
  return {
    profile: {...canonicalOwnerProfile(ownerType,row),email:String(email || "")},
    profile_revision:ownerProfileRevision(ownerType,row),
    profile_editable_fields:OWNER_PROFILE_FIELDS[ownerType],
    profile_unsupported_fields:UNSUPPORTED[ownerType],
    profile_can_write:canWrite === true,
    profile_saved:saved === true,
  };
}
