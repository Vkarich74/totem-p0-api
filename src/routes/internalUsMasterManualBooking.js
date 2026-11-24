// US-MASTER-BOOKING-02: explicit authenticated master -> canonical US booking.
// Reuses the existing publicCreateBooking transaction; no parallel writer,
// inferred salon, legacy timezone, conversion, Stripe or payment operation.
import express from "express";
import { getUsSaasAccess,readUsSaasProjectionPolicy } from "../services/billing/usSaasEntitlementProjection.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { publicCreateBooking,createUsSharedMasterBooking } from "./publicCreateBooking.js";
import {readUsOwnSalonBookingAccess} from "../auth/usOwnSalonRoleContext.js";
import { resolveBusinessMarketContext } from "../market-context/BusinessContext.js";
import { resolveUsSalonLocation } from "../services/usLocation.service.js";
import { actorFor,checkSession,ownerContext,transact } from
  "../services/usServiceTaxSettings.service.js";

const SLUG=/^[a-z0-9](?:[a-z0-9-]{0,126}[a-z0-9])?$/;
const LOCATION=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO=/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const DATE=/^20\d{2}-\d{2}-\d{2}$/;
const CLOCK=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const deny=(status,code)=>({status,body:{ok:false,error:code}});

function bodyContract(body) {
  if(!body||typeof body!=="object"||Array.isArray(body))return null;
  const required=["salon_slug","location_code","service_id","date","time",
    "start_at","client_payload","expected_us_price_version",
    "expected_us_amount_minor"];
  if(Object.keys(body).length!==required.length ||
     required.some(key=>!Object.hasOwn(body,key)))return null;
  const client=body.client_payload;
  if(!client||typeof client!=="object"||Array.isArray(client)||
     Object.keys(client).length!==2||
     !Object.hasOwn(client,"name")||!Object.hasOwn(client,"phone"))return null;
  const minor=body.expected_us_amount_minor;
  if(typeof body.salon_slug!=="string"||!SLUG.test(body.salon_slug)||
     typeof body.location_code!=="string"||!LOCATION.test(body.location_code)||
     !Number.isSafeInteger(body.service_id)||body.service_id<1||
     typeof body.date!=="string"||!DATE.test(body.date)||
     typeof body.time!=="string"||!CLOCK.test(body.time)||
     typeof body.start_at!=="string"||!ISO.test(body.start_at)||
     !Number.isFinite(Date.parse(body.start_at))||
     Date.parse(body.start_at)<=Date.now()||
     !Number.isSafeInteger(body.expected_us_price_version)||
     body.expected_us_price_version<1||
     typeof minor!=="string"||!/^[1-9]\d*$/.test(minor)||
     !Number.isSafeInteger(Number(minor))||Number(minor)>99999999||
     typeof client.name!=="string"||client.name.trim().length<2||
     client.name.trim().length>160||typeof client.phone!=="string"||
     client.phone.trim().length<7||client.phone.trim().length>40)return null;
  return {
    salon_slug:body.salon_slug,location_code:body.location_code,
    service_id:body.service_id,date:body.date,time:body.time,
    start_at:body.start_at,
    client_payload:{name:client.name.trim(),phone:client.phone.trim()},
    expected_us_price_version:body.expected_us_price_version,
    expected_us_amount_minor:minor,
  };
}

async function authorize(pool,{auth,identity,masterSlug,body}) {
  const actor=actorFor(auth,identity,"master");
  if(!actor)return deny(403,"US_MANUAL_MASTER_SESSION_REQUIRED");
  return transact(pool,false,async db=>{
    const shared=auth?.us_role_context==="own_salon_master_v1"
      ?await readUsOwnSalonBookingAccess(db,{auth,slug:masterSlug}):null;
    if(!shared&&!await checkSession(db,actor,false))
      return deny(403,"US_MANUAL_MASTER_SESSION_INVALID");
    const owner=await ownerContext(db,"master",masterSlug,actor.userId,false);
    if(!owner||shared&&Number(owner.owner_id)!==shared.masterId)
      return deny(404,"US_MANUAL_MASTER_NOT_FOUND");
    const target=await db.query([
      "SELECT s.id AS salon_id,s.slug AS salon_slug,",
      "sms.id AS link_id,ms.master_id,market.id AS market_id",
      "FROM public.salon_master_services sms",
      "JOIN public.master_salon ms ON ms.salon_id=sms.salon_id",
      "AND ms.master_id=sms.master_id AND ms.status='active'",
      "JOIN public.masters m ON m.id=ms.master_id AND m.active IS TRUE",
      "JOIN public.salons s ON s.id=sms.salon_id",
      "AND s.enabled IS TRUE AND s.status='active'",
      "JOIN public.tenant_market_settings tm ON tm.salon_id=s.id",
      "JOIN public.markets market ON market.id=tm.market_id",
      "WHERE m.id=$1 AND m.slug=$2 AND m.user_id=$3",
      "AND s.slug=$4 AND sms.id=$5 AND sms.active IS TRUE",
      "AND sms.currency_code='USD'",
      "AND market.id=$6 AND market.code='US' AND market.country_code='US'",
      "AND market.active IS TRUE AND market.default_currency='USD' LIMIT 1",
    ].join(" "),[
      Number(owner.owner_id),masterSlug,actor.userId,body.salon_slug,
      body.service_id,Number(owner.market_id),
    ]);
    if(target.rows.length!==1||shared&&Number(target.rows[0].salon_id)!==shared.salonId)
      return deny(404,"US_MANUAL_SERVICE_SCOPE_NOT_FOUND");
    // T5: both verified master and paid host salon must allow new US booking.
    // Missing old billing row or grace cannot grant an Odoo-managed account.
    if(!shared){
    const policy=readUsSaasProjectionPolicy();
    const masterPaid=await getUsSaasAccess(db,{ownerType:"master",ownerId:Number(owner.owner_id),policy});
    const salonPaid=await getUsSaasAccess(db,{ownerType:"salon",ownerId:Number(target.rows[0].salon_id),policy});
    if(!masterPaid.managed||!masterPaid.can_book||!salonPaid.managed||!salonPaid.can_book)
      return deny(403,"US_SAAS_BOOKING_DISABLED");
    const billing=await db.query(
      "SELECT subscription_status,blocked_at,next_charge_at,grace_until "+
      "FROM public.billing_subscriptions "+
      "WHERE owner_type='master' AND owner_id=$1 LIMIT 1",
      [Number(owner.owner_id)]
    );
    const sub=billing.rows[0];
    if(sub){
      const now=Date.now();
      const nextCharge=sub.next_charge_at
        ? new Date(sub.next_charge_at).getTime():null;
      const graceUntil=sub.grace_until
        ? new Date(sub.grace_until).getTime():null;
      const state=sub.blocked_at?"blocked"
        : nextCharge&&nextCharge<now
          ? graceUntil&&graceUntil>=now?"grace":"overdue"
          : String(sub.subscription_status||"active");
      if(state!=="active"&&state!=="grace")
        return deny(403,"US_MANUAL_MASTER_BILLING_BLOCKED");
    }
    }
    const row=target.rows[0];
    await resolveUsSalonLocation(db,{
      salonId:Number(row.salon_id),locationCode:body.location_code,
      marketContext:{market_code:"US",country_code:"US"},
    });
    const market=await resolveBusinessMarketContext(db,{
      salonId:Number(row.salon_id),
    });
    if(market?.market_code!=="US"||market?.country_code!=="US"||
       market?.currency_code!=="USD"||
       Number(market.market_id)!==Number(owner.market_id)||
       !market.country_pack_code||!market.country_pack_version)
      return deny(409,"US_MANUAL_MARKET_CONTRACT_INVALID");
    return {status:200,body:{
      ok:true,master_id:Number(row.master_id),
      salon_slug:String(row.salon_slug),market_context:market,
      shared_master:Boolean(shared),salon_id:Number(row.salon_id),
    }};
  });
}

export function buildUsMasterManualBookingRouter(pool) {
  if(!pool||typeof pool.connect!=="function")
    throw Error("US_MANUAL_BOOKING_DB_REQUIRED");
  const router=express.Router();
  router.post("/masters/:slug/us-manual-bookings",requireAuth,async(req,res)=>{
    res.set("Cache-Control","no-store");
    const masterSlug=req.params.slug;
    if(typeof masterSlug!=="string"||!SLUG.test(masterSlug))
      return res.status(400).json({
        ok:false,error:"US_MANUAL_MASTER_SLUG_INVALID",
      });
    const body=bodyContract(req.body);
    if(!body)return res.status(400).json({
      ok:false,error:"US_MANUAL_BOOKING_INPUT_INVALID",
    });
    const requestKey=String(req.headers["idempotency-key"]||"");
    if(!UUID.test(requestKey))return res.status(400).json({
      ok:false,error:"US_MANUAL_IDEMPOTENCY_REQUIRED",
    });
    try {
      const permission=await authorize(pool,{
        auth:req.auth,identity:req.identity,masterSlug,body,
      });
      if(permission.status!==200)
        return res.status(permission.status).json(permission.body);
      // The existing canonical transaction independently rechecks the
      // location, service, USD price revision, occupied slots and DST.
      const canonicalRequest={
        ...req,
        params:{...req.params,slug:permission.body.salon_slug},
        market_context:permission.body.market_context,
        headers:{...req.headers,"idempotency-key":permission.body.shared_master
          ?"usm-shared-"+permission.body.master_id+"-"+requestKey:"usm-"+requestKey},
        body:{
          master_id:permission.body.master_id,
          service_id:body.service_id,
          location_code:body.location_code,date:body.date,
          time:body.time,start_at:body.start_at,
          client_payload:body.client_payload,
          expected_us_price_version:body.expected_us_price_version,
          expected_us_amount_minor:body.expected_us_amount_minor,
        },
      };
      if(permission.body.shared_master)
        return await createUsSharedMasterBooking(canonicalRequest,res,{
          db:pool,auth:req.auth,masterSlug,salonId:permission.body.salon_id,
          masterId:permission.body.master_id,
        });
      return publicCreateBooking(canonicalRequest,res);
    } catch(problem) {
      if([403,409].includes(problem?.status)&&/^US_(ROLE_CONTEXT|MASTER_|SAAS_)/.test(String(problem?.code||"")))
        return res.status(403).json({ok:false,error:"US_SAAS_BOOKING_DISABLED"});
      const known=Number.isSafeInteger(problem?.statusCode)&&
        String(problem?.code||"").startsWith("US_");
      if(known)return res.status(problem.statusCode).json({
        ok:false,error:problem.code,
      });
      console.error("US_MANUAL_BOOKING_ERROR",
        String(problem?.code||"INTERNAL"));
      return res.status(503).json({
        ok:false,error:"US_MANUAL_BOOKING_UNAVAILABLE",
      });
    }
  });
  return router;
}
