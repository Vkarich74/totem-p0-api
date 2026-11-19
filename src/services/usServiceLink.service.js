// TOTEM USA — US-SERVICES-01. Explicit US salon/master service binding.
// No legacy price conversion, payments, bookings, Stripe, schema changes or
// inferred "latest salon" binding. New catalog + link + USD cents are atomic.
import {
  actorFor, checkSession, ownerContext, transact,
} from "./usServiceTaxSettings.service.js";

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,126}[a-z0-9])?$/;
const MAX_MINOR = 99_999_999;
const positiveId = value => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) return null;
  return value;
};
const reply = (status, error) => ({status, body:{ok:false,error}});

function validateOwner(options) {
  const {ownerType,ownerSlug,auth,identity} = options;
  if (!["salon","master"].includes(ownerType) ||
      typeof ownerSlug !== "string" || !SLUG.test(ownerSlug)) {
    return {error:reply(400,"US_SERVICE_LINK_OWNER_INVALID")};
  }
  const actor = actorFor(auth,identity,ownerType);
  return actor ? {actor} : {error:reply(403,"US_SERVICE_LINK_SESSION_REQUIRED")};
}

function validatePayload(ownerType, body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const operation=body.operation;
  if (!["create","attach"].includes(operation)) return null;
  const targetField=ownerType==="salon"?"master_id":"salon_slug";
  const detailField=operation==="create"?"name":"service_pk";
  const expected=["operation",targetField,detailField,"duration_min","amount_minor"];
  if (Object.keys(body).length!==expected.length ||
      expected.some(key=>!Object.hasOwn(body,key))) return null;
  const duration=body.duration_min,minor=body.amount_minor;
  if (!Number.isSafeInteger(duration) || duration<1 || duration>720 ||
      !Number.isSafeInteger(minor) || minor<1 || minor>MAX_MINOR) return null;
  if (ownerType==="salon" && !positiveId(body.master_id)) return null;
  if (ownerType==="master" &&
      (typeof body.salon_slug!=="string" || !SLUG.test(body.salon_slug))) return null;
  if (operation==="create" &&
      (typeof body.name!=="string" || body.name.trim().length<1 ||
       body.name.trim().length>160)) return null;
  if (operation==="attach" && !positiveId(body.service_pk)) return null;
  return {operation,duration,minor,
    masterId:ownerType==="salon"?body.master_id:null,
    salonSlug:ownerType==="master"?body.salon_slug:null,
    name:operation==="create"?body.name.trim():null,
    servicePk:operation==="attach"?body.service_pk:null};
}

async function writeAllowed(db,ownerType,ownerId) {
  const result=await db.query(
    "SELECT subscription_status,blocked_at,next_charge_at,grace_until "+
    "FROM public.billing_subscriptions WHERE owner_type=$1 AND owner_id=$2 LIMIT 1",
    [ownerType,ownerId]
  );
  const billing=result.rows[0];
  if (!billing) return true; // Existing owner billing contract: missing = active.
  if (billing.blocked_at) return false;
  const now=Date.now();
  const next=billing.next_charge_at?new Date(billing.next_charge_at).getTime():null;
  const grace=billing.grace_until?new Date(billing.grace_until).getTime():null;
  if (next && (!Number.isFinite(next) || next<now)) {
    return Boolean(grace && Number.isFinite(grace) && grace>=now);
  }
  return ["active","grace"].includes(String(billing.subscription_status||"active"));
}

async function exactTarget(db,ownerType,scope,input) {
  // Explicit US salon for master, direct US salon owner for salon administrator.
  const result=await db.query(
    [
      "SELECT s.id AS salon_id,s.slug AS salon_slug,master.id AS master_id,",
      "master.slug AS master_slug,master.name AS master_name",
      "FROM public.master_salon ms",
      "JOIN public.salons s ON s.id=ms.salon_id",
      "JOIN public.masters master ON master.id=ms.master_id",
      "JOIN public.tenant_market_settings tm ON tm.salon_id=s.id",
      "JOIN public.markets market ON market.id=tm.market_id",
      "WHERE ms.status='active' AND s.enabled IS TRUE AND s.status='active'",
      "AND master.active IS TRUE AND market.id=$5 AND market.code='US'",
      "AND market.country_code='US' AND market.active IS TRUE",
      "AND market.default_currency='USD'",
      "AND (($1='salon' AND s.id=$2 AND ms.master_id=$3)",
      "OR ($1='master' AND master.id=$3 AND s.slug=$4))",
      "LIMIT 1 FOR SHARE OF ms,s,master,tm,market",
    ].join(" "),
    [ownerType,ownerType==="salon"?scope.owner_id:0,
      ownerType==="salon"?input.masterId:scope.owner_id,
      input.salonSlug||"",scope.market_id]
  );
  return result.rows[0]||null;
}

export async function readUsServiceLinkOptions(pool,options={}) {
  const checked=validateOwner(options);
  if (checked.error) return checked.error;
  return transact(pool,false,async db=>{
    if (!await checkSession(db,checked.actor,false)) {
      return reply(403,"US_SERVICE_LINK_SESSION_INVALID");
    }
    const scope=await ownerContext(
      db,options.ownerType,options.ownerSlug,checked.actor.userId,false);
    if (!scope) return reply(404,"US_SERVICE_LINK_OWNER_NOT_FOUND");
    if (options.ownerType==="salon") {
      const result=await db.query(
        [
          "SELECT m.id,m.slug,m.name FROM public.master_salon ms",
          "JOIN public.masters m ON m.id=ms.master_id",
          "WHERE ms.salon_id=$1 AND ms.status='active' AND m.active IS TRUE",
          "ORDER BY m.name,m.id",
        ].join(" "),[scope.owner_id]);
      const catalog=await db.query(
        [
          "SELECT DISTINCT sms.master_id,sms.service_pk,svc.name,svc.duration_min",
          "FROM public.salon_master_services sms",
          "JOIN public.services svc ON svc.id=sms.service_pk",
          "JOIN public.master_salon ms ON ms.master_id=sms.master_id",
          "AND ms.salon_id=$1 AND ms.status='active'",
          "JOIN public.master_salon source_ms ON source_ms.master_id=sms.master_id",
          "AND source_ms.salon_id=sms.salon_id AND source_ms.status='active'",
          "JOIN public.tenant_market_settings tm ON tm.salon_id=sms.salon_id",
          "JOIN public.markets market ON market.id=tm.market_id",
          "JOIN public.masters m ON m.id=ms.master_id AND m.active IS TRUE",
          "WHERE sms.salon_id=$1 AND sms.active IS TRUE AND sms.currency_code='USD'",
          "AND market.id=$2 AND market.code='US' AND market.country_code='US'",
          "AND market.default_currency='USD' AND market.active IS TRUE",
          "ORDER BY sms.master_id,sms.service_pk,svc.name,svc.duration_min LIMIT 300",
        ].join(" "),[scope.owner_id,scope.market_id]);
      return {status:200,body:{
        ok:true,market_code:"US",currency_code:"USD",
        owner_type:"salon",owner_slug:options.ownerSlug,
        masters:result.rows.map(row=>({id:Number(row.id),slug:row.slug,name:row.name})),
        salons:[],
        catalog_services:catalog.rows.map(row=>({
          master_id:Number(row.master_id),service_pk:Number(row.service_pk),
          name:row.name,duration_min:Number(row.duration_min),
        })),
        read_only:true,
      }};
    }
    const result=await db.query(
      [
        "SELECT s.id,s.slug,s.name FROM public.master_salon ms",
        "JOIN public.salons s ON s.id=ms.salon_id",
        "JOIN public.tenant_market_settings tm ON tm.salon_id=s.id",
        "JOIN public.markets m ON m.id=tm.market_id",
        "WHERE ms.master_id=$1 AND ms.status='active'",
        "AND s.status='active' AND s.enabled IS TRUE",
        "AND m.id=$2 AND m.code='US' AND m.country_code='US'",
        "AND m.active IS TRUE AND m.default_currency='USD'",
        "ORDER BY s.name,s.id",
      ].join(" "),[scope.owner_id,scope.market_id]);
    const catalog=await db.query(
      [
        "SELECT DISTINCT sms.master_id,sms.service_pk,svc.name,svc.duration_min",
        "FROM public.salon_master_services sms",
        "JOIN public.services svc ON svc.id=sms.service_pk",
        "JOIN public.master_salon ms ON ms.salon_id=sms.salon_id",
        "AND ms.master_id=sms.master_id AND ms.status='active'",
        "JOIN public.tenant_market_settings tm ON tm.salon_id=sms.salon_id",
        "JOIN public.markets market ON market.id=tm.market_id",
        "WHERE sms.master_id=$1 AND sms.active IS TRUE AND sms.currency_code='USD'",
        "AND market.id=$2 AND market.code='US' AND market.country_code='US'",
        "AND market.default_currency='USD' AND market.active IS TRUE",
        "ORDER BY sms.master_id,sms.service_pk,svc.name,svc.duration_min LIMIT 300",
      ].join(" "),[scope.owner_id,scope.market_id]);
    return {status:200,body:{
      ok:true,market_code:"US",currency_code:"USD",
      owner_type:"master",owner_slug:options.ownerSlug,
      salons:result.rows.map(row=>({id:Number(row.id),slug:row.slug,name:row.name})),
      masters:[],
      catalog_services:catalog.rows.map(row=>({
          master_id:Number(row.master_id),service_pk:Number(row.service_pk),
          name:row.name,duration_min:Number(row.duration_min),
        })),
      read_only:true,
    }};
  });
}

export async function saveUsServiceLink(pool,options={}) {
  const checked=validateOwner(options);
  if (checked.error) return checked.error;
  const input=validatePayload(options.ownerType,options.body);
  if (!input) return reply(400,"US_SERVICE_LINK_INPUT_INVALID");
  return transact(pool,true,async db=>{
    if (!await checkSession(db,checked.actor,true)) {
      return reply(403,"US_SERVICE_LINK_SESSION_INVALID");
    }
    const scope=await ownerContext(
      db,options.ownerType,options.ownerSlug,checked.actor.userId,true);
    if (!scope) return reply(404,"US_SERVICE_LINK_OWNER_NOT_FOUND");
    if (!await writeAllowed(db,options.ownerType,scope.owner_id)) {
      return reply(403,"US_SERVICE_LINK_BILLING_BLOCKED");
    }
    const target=await exactTarget(db,options.ownerType,scope,input);
    if (!target) return reply(404,"US_SERVICE_LINK_TARGET_NOT_FOUND");

    // Serialize creation within one salon, and never reopen a disabled link.
// An owner attaches only services already used inside THAT salon.
// A master attaches only their OWN US catalog from an authorized US salon.
    await db.query("SELECT pg_advisory_xact_lock(981201,$1)",[Number(target.salon_id)]);
    let servicePk=input.servicePk;
    if (input.operation==="attach") {
      const source=await db.query(
        [
          "SELECT svc.id FROM public.services svc WHERE svc.id=$1",
          "AND EXISTS (SELECT 1 FROM public.salon_master_services old",
          "JOIN public.master_salon source_ms ON source_ms.salon_id=old.salon_id",
          "AND source_ms.master_id=old.master_id AND source_ms.status='active'",
          "JOIN public.tenant_market_settings tm ON tm.salon_id=old.salon_id",
          "JOIN public.markets market ON market.id=tm.market_id",
          "WHERE old.service_pk=svc.id",
          "AND (($4='salon' AND old.salon_id=$5)",
          "OR ($4='master' AND old.master_id=$2))",
          "AND old.active IS TRUE AND old.currency_code='USD'",
          "AND market.id=$3 AND market.code='US' AND market.country_code='US'",
          "AND market.active IS TRUE AND market.default_currency='USD')",
          "LIMIT 1 FOR SHARE OF svc",
        ].join(" "),[
          servicePk,Number(target.master_id),Number(scope.market_id),
          options.ownerType,Number(target.salon_id),
        ]);
      if (source.rows.length!==1) return reply(404,"US_SERVICE_LINK_SOURCE_NOT_FOUND");
    }

    if (input.operation==="create") {
      const duplicate=await db.query(
        [
          "SELECT sms.id FROM public.salon_master_services sms",
          "JOIN public.services svc ON svc.id=sms.service_pk",
          "WHERE sms.salon_id=$1 AND sms.master_id=$2",
          "AND lower(btrim(svc.name))=lower($3) AND sms.duration_min=$4",
          "LIMIT 1 FOR UPDATE OF sms",
        ].join(" "),
        [Number(target.salon_id),Number(target.master_id),input.name,input.duration]);
      if (duplicate.rows.length) return reply(409,"US_SERVICE_LINK_DUPLICATE");
      // Global numeric catalog codes are legacy-compatible. A separate
      // advisory lock prevents races among US writers; unique errors fail shut.
      await db.query("SELECT pg_advisory_xact_lock(981202,1)");
      const sequence=await db.query(
        "SELECT COALESCE(MAX(service_id::int),0)+1 AS next_service_id "+
        "FROM public.services WHERE service_id ~ '^[0-9]+$'");
      const code=Number(sequence.rows[0]?.next_service_id);
      if (!positiveId(code)) return reply(409,"US_SERVICE_CATALOG_CODE_UNAVAILABLE");
      const created=await db.query(
        "INSERT INTO public.services(service_id,name,duration_min,price) "+
        "VALUES ($1,$2,$3,0) RETURNING id",
        [String(code),input.name,input.duration]);
      if (created.rows.length!==1) throw Error("US_SERVICE_CATALOG_INSERT_MISMATCH");
      servicePk=Number(created.rows[0].id);
    }

    const existing=await db.query(
      "SELECT id FROM public.salon_master_services "+
      "WHERE salon_id=$1 AND master_id=$2 AND service_pk=$3 "+
      "LIMIT 1 FOR UPDATE",
      [Number(target.salon_id),Number(target.master_id),servicePk]);
    if (existing.rows.length) return reply(409,"US_SERVICE_LINK_DUPLICATE");

    const link=await db.query(
      "INSERT INTO public.salon_master_services"+
      "(salon_id,master_id,service_pk,price,duration_min,active,currency_code) "+
      "VALUES ($1,$2,$3,0,$4,true,'USD') RETURNING id",
      [Number(target.salon_id),Number(target.master_id),servicePk,input.duration]);
    if (link.rows.length!==1) throw Error("US_SERVICE_LINK_INSERT_MISMATCH");
    const linkId=Number(link.rows[0].id);
    const price=await db.query(
      "INSERT INTO public.us_service_price_amounts"+
      "(salon_master_service_id,market_id,amount_minor,currency_code) "+
      "VALUES ($1,$2,$3,'USD') RETURNING amount_minor::text,price_version",
      [linkId,Number(scope.market_id),input.minor]);
    if (price.rows.length!==1) throw Error("US_SERVICE_PRICE_INSERT_MISMATCH");

    // Verify DB state inside the same transaction, before reporting success.
    const verified=await db.query(
      [
        "SELECT sms.id,sms.salon_id,sms.master_id,sms.service_pk,",
        "sms.duration_min,sms.active,sms.currency_code,",
        "svc.name,usd.amount_minor::text AS amount_minor,usd.price_version",
        "FROM public.salon_master_services sms",
        "JOIN public.services svc ON svc.id=sms.service_pk",
        "JOIN public.us_service_price_amounts usd",
        "ON usd.salon_master_service_id=sms.id",
        "WHERE sms.id=$1 AND sms.salon_id=$2 AND sms.master_id=$3",
        "AND sms.service_pk=$4 AND sms.active IS TRUE",
        "AND sms.currency_code='USD' AND usd.market_id=$5",
        "AND usd.currency_code='USD' LIMIT 1",
      ].join(" "),
      [linkId,Number(target.salon_id),Number(target.master_id),
        servicePk,Number(scope.market_id)]);
    const row=verified.rows[0];
    if (!row || Number(row.duration_min)!==input.duration ||
        String(row.amount_minor)!==String(input.minor) ||
        Number(row.price_version)!==1) {
      throw Error("US_SERVICE_LINK_READBACK_MISMATCH");
    }
    return {status:200,body:{
      ok:true,contract_version:"US-SERVICES-01-v1",
      market_code:"US",currency_code:"USD",
      owner_type:options.ownerType,owner_slug:options.ownerSlug,
      salon_master_service_id:linkId,
      service:{
        id:linkId,salon_id:Number(row.salon_id),
        salon_slug:target.salon_slug,master_id:Number(row.master_id),
        service_pk:Number(row.service_pk),name:row.name,
        duration_min:Number(row.duration_min),active:true,
        amount_minor:String(row.amount_minor),price_version:1,
        currency_code:"USD",
      },
      operation:input.operation,readback_verified:true,
      payment_performed:false,booking_created:false,
    }};
  });
}

export function usServiceLinkErrorResponse(error) {
  if (["23505","40001","40P01"].includes(error?.code)) {
    return reply(409,"US_SERVICE_LINK_CONFLICT");
  }
  if (["23503","23514","23502"].includes(error?.code)) {
    return reply(409,"US_SERVICE_LINK_INTEGRITY_REJECTED");
  }
  console.error("US_SERVICE_LINK_STORAGE_FAILED",String(error?.code||"INTERNAL"));
  return reply(503,"US_SERVICE_LINK_STORAGE_UNAVAILABLE");
}

// Shared server-side guard: old routes may not mutate a US catalog/link.
// Called only after legacy authentication and the exact link salon are known.
export async function rejectLegacyUsServiceMutation(db,salonId) {
  const result=await db.query(
    [
      "SELECT m.code,m.default_currency FROM public.tenant_market_settings tm",
      "JOIN public.markets m ON m.id=tm.market_id",
      "WHERE tm.salon_id=$1 AND m.active IS TRUE LIMIT 2",
    ].join(" "),[Number(salonId)]);
  if (result.rows.length!==1) {
    return {status:409,error:"LEGACY_SERVICE_MARKET_UNRESOLVED"};
  }
  if (result.rows[0].code==="US") {
    return {status:409,error:"US_SERVICE_LINK_ENDPOINT_REQUIRED"};
  }
  return null;
}

// A mixed-market master must never enter the legacy "latest salon" service
// creation route. A last KG salon cannot authorize writes in an US cabinet.
// The canonical US path always uses an explicit salon_slug instead.
export async function rejectLegacyUsMasterServiceCreation(db,masterId) {
  if (!positiveId(masterId)) {
    return {status:409,error:"LEGACY_MASTER_SERVICE_SCOPE_UNRESOLVED"};
  }
  const result=await db.query(
    [
      "SELECT EXISTS (SELECT 1 FROM public.master_salon ms",
      "JOIN public.tenant_market_settings tm ON tm.salon_id=ms.salon_id",
      "JOIN public.markets market ON market.id=tm.market_id",
      "WHERE ms.master_id=$1 AND ms.status='active'",
      "AND market.code='US') AS has_us_scope",
    ].join(" "),[masterId]);
  if (result.rows.length!==1) {
    return {status:409,error:"LEGACY_MASTER_SERVICE_SCOPE_UNRESOLVED"};
  }
  if (result.rows[0].has_us_scope===true) {
    return {status:409,error:"US_SERVICE_LINK_ENDPOINT_REQUIRED"};
  }
  return null;
}
