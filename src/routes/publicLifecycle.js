import { pool } from "../db.js";
import { actorFor, checkSession } from "../services/usServiceTaxSettings.service.js";
import { checkUsSaasTransactionalWrite } from "../services/billing/usSaasTransactionalWriteGuard.js";
import { createNotification } from "../services/notifications/notificationService.js";
import { buildBookingLifecycleNotificationTemplate } from "../services/notifications/notificationTemplates.js";
import { releaseCalendarSlotForBooking } from "../services/calendarSlots.service.js";

function getPublicLifecyclePaymentLabelRu(provider, status, hasPayment) {
  if (!hasPayment) {
    return "Оплата не выбрана";
  }

  const normalizedProvider = String(provider || "").trim().toLowerCase();
  const normalizedStatus = String(status || "").trim().toLowerCase();

  if (normalizedProvider === "direct" && normalizedStatus === "pending") {
    return "Наличные ожидают подтверждения";
  }

  if (normalizedProvider === "direct" && normalizedStatus === "confirmed") {
    return "Оплата наличными подтверждена";
  }

  if (normalizedProvider === "xpay" && normalizedStatus === "pending") {
    return "Ожидаем оплату XPAY";
  }

  if (normalizedProvider === "xpay" && normalizedStatus === "confirmed") {
    return "Оплата получена";
  }

  if (normalizedStatus === "failed") {
    return "Оплата не прошла";
  }

  if (normalizedStatus === "refunded") {
    return "Оплата возвращена";
  }

  return "Оплата не выбрана";
}

function buildLifecycleActionUrl(booking, targetType) {
  const salonSlug = String(booking?.salon_slug || "").trim();
  const masterSlug = String(booking?.master_slug || "").trim();

  if (targetType === "salon" && salonSlug) {
    return `#/salon/${salonSlug}/dashboard`;
  }

  if (targetType === "master" && masterSlug) {
    return `#/master/${masterSlug}/dashboard`;
  }

  if (targetType === "client") {
    return null;
  }

  return null;
}

// Public US booking lifecycle is an OWNER action, not a client booking action.
// Only the existing valid owner session may act. Tenant and booking are
// selected by the canonical route; authorization is verified in PostgreSQL.
export function checkUsLifecycleSession(auth) {
  if(auth?.source!=="session" || !auth?.session_id ||
     !Number.isSafeInteger(Number(auth?.user_id)) || Number(auth.user_id)<1) {
    return {ok:false,status:401,error:"US_LIFECYCLE_SESSION_REQUIRED"};
  }
  if(auth.role!=="salon_admin" && auth.role!=="master") {
    return {ok:false,status:403,error:"US_LIFECYCLE_ROLE_FORBIDDEN"};
  }
  return {ok:true,user_id:Number(auth.user_id),role:auth.role};
}

// Shared owner-session guard. Public pages never authorize writes or
// personal booking reads merely because a salon is publicly bookable.
export function checkBookingOwnerSession(auth){
  const result=checkUsLifecycleSession(auth);
  if(result.ok)return result;
  return {...result,error:result.error.replace(/^US_LIFECYCLE_/,"BOOKING_OWNER_")};
}

// Legacy direct salon binding applies ONLY when a numeric owner_salon
// membership does not exist. Existing owners always require an ACTIVE row.
async function activeSalonAdminRelation(db,userId,salonId,lock=false){
  // Preserve existing direct/legacy fallback rule. Lock any membership rows
  // before evaluating it inside a write transaction.
  if(lock)await db.query("SELECT id FROM public.owner_salon WHERE owner_id=$1::text ORDER BY id FOR SHARE",[userId]);
  return db.query(
    `SELECT 1
       FROM public.auth_users u
       JOIN public.salons s ON s.id=$2
      WHERE u.id=$1 AND u.enabled=true AND u.role='salon_admin'
        AND (
          EXISTS(
            SELECT 1 FROM public.owner_salon os
             WHERE os.owner_id=u.id::text
               AND os.salon_id=s.id AND os.status='active'
          ) OR (
            NOT EXISTS(
              SELECT 1 FROM public.owner_salon os
               WHERE os.owner_id=u.id::text
            )
            AND (u.salon_id=s.id::text OR u.salon_slug=s.slug)
          )
        )
      LIMIT 1${lock?" FOR SHARE OF u,s":""}`,
    [userId,salonId]
  );
}

// This resource contains real client names and booking prices; only a
// signed-in owner of THIS salon can list it. Master uses his own cabinet.
export async function authorizePublicSalonBookingReader(db,auth,salonId){
  const session=checkBookingOwnerSession(auth);
  if(!session.ok)return session;
  if(session.role!=="salon_admin"){
    return {ok:false,status:403,error:"BOOKING_OWNER_ROLE_FORBIDDEN"};
  }
  const salon=Number(salonId);
  if(!Number.isSafeInteger(salon)||salon<1){
    return {ok:false,status:403,error:"BOOKING_OWNER_SCOPE_INVALID"};
  }
  const relation=await activeSalonAdminRelation(db,session.user_id,salon);
  if(relation.rows?.length!==1){
    return {ok:false,status:403,error:"BOOKING_OWNER_FORBIDDEN"};
  }
  return {ok:true};
}

export async function authorizeUsLifecycleActor(db,auth,salonId,masterId,lock=false) {
  const session=checkUsLifecycleSession(auth);
  if(!session.ok)return session;
  const salon=Number(salonId);
  const master=Number(masterId);
  if(!Number.isSafeInteger(salon)||salon<1 ||
     !Number.isSafeInteger(master)||master<1) {
    return {ok:false,status:403,error:"US_LIFECYCLE_SCOPE_INVALID"};
  }
  const relation=session.role==="salon_admin"
    ? await activeSalonAdminRelation(db,session.user_id,salon,lock)
    : await db.query(
      `SELECT 1 FROM public.auth_users u
         JOIN public.masters m ON m.user_id=u.id
         JOIN public.master_salon ms ON ms.master_id=m.id
        WHERE u.id=$1 AND u.enabled=true AND u.role='master'
          AND m.id=$3 AND m.active=true
          AND ms.salon_id=$2 AND ms.status='active'
        LIMIT 1${lock?" FOR SHARE OF u,m,ms":""}`,
      [session.user_id,salon,master]);
  if(relation.rows?.length!==1) {
    return {ok:false,status:403,error:"US_LIFECYCLE_OWNER_FORBIDDEN"};
  }
  return {ok:true};
}

export async function authorizeBookingLifecycleActor(db,auth,salonId,masterId,lock=false){
  const session=checkBookingOwnerSession(auth);
  if(!session.ok)return session;
  const result=await authorizeUsLifecycleActor(db,auth,salonId,masterId,lock);
  if(result.ok)return result;
  return {...result,error:result.error==="US_LIFECYCLE_OWNER_FORBIDDEN"
    ? "BOOKING_OWNER_FORBIDDEN"
    : result.error.replace(/^US_LIFECYCLE_/,"BOOKING_OWNER_")};
}

// Existing cabinet billing policy, identical to both internal owner routers.
// No new tariff, grace period, missing-master-subscription or status rule.
function resolveBillingAccessState(billing){
if(!billing){
return "active";
}

if(billing.blocked_at){
return "blocked";
}

const now = Date.now();
const nextChargeAt = billing.next_charge_at ? new Date(billing.next_charge_at).getTime() : null;
const graceUntil = billing.grace_until ? new Date(billing.grace_until).getTime() : null;

if(nextChargeAt && nextChargeAt < now){
if(graceUntil && graceUntil >= now){
return "grace";
}
return "overdue";
}

return billing.subscription_status || "active";
}

const denied=(error,http=403)=>({http,body:{ok:false,error}});

// The salon public-access guard remains in the existing route. Recheck its
// subscription and the acting owner's write authority on the SAME client.
// A typed Odoo owner may never fall back to a legacy wallet decision.
async function authorizeLifecycleWrite(db,auth,booking,marketCode,marketId){
  const ownerType=auth.role==="master"?"master":"salon";
  const actor=actorFor(auth,null,ownerType);
  if(!actor||!await checkSession(db,actor,true))
    return denied("BOOKING_OWNER_SESSION_INVALID");
  const market=await db.query(
    `SELECT m.id AS market_id,m.code,m.active
       FROM public.tenant_market_settings t
       JOIN public.markets m ON m.id=t.market_id
      WHERE t.salon_id=$1 FOR SHARE OF t,m`,[Number(booking.salon_id)]);
  const bound=market.rows[0];
  if(market.rows.length!==1||bound.active!==true||bound.code!==marketCode||
     !Number.isSafeInteger(Number(bound.market_id))||Number(bound.market_id)<1||
     (marketId!=null&&Number(bound.market_id)!==Number(marketId)))
    return denied("BOOKING_OWNER_MARKET_SCOPE_INVALID",409);
  const ownership=marketCode==="US"
    ? await authorizeUsLifecycleActor(db,auth,booking.salon_id,booking.master_id,true)
    : await authorizeBookingLifecycleActor(db,auth,booking.salon_id,booking.master_id,true);
  if(!ownership.ok)return denied(ownership.error,ownership.status);
  const owners=[["salon",Number(booking.salon_id)]];
  if(ownerType==="master")owners.push(["master",Number(booking.master_id)]);
  for(const [type,id] of owners){
    const scope={owner_id:id,market_id:Number(bound.market_id)};
    if(marketCode==="US"){
      const commercial=await checkUsSaasTransactionalWrite(db,type,scope);
      if(commercial)return {http:commercial.status,body:commercial.body};
      continue;
    }
    const source=await db.query(
      `SELECT id FROM public.owner_opening_requests
        WHERE owner_type=$1 AND created_owner_id=$2 AND source_namespace='odoo_online'
          AND (source_company_id=4 OR source_website_id=5)
        ORDER BY id LIMIT 2 FOR SHARE`,[type,id]);
    const rows=await db.query(
      `SELECT subscription_status,blocked_at,next_charge_at,grace_until,provider_namespace
         FROM public.billing_subscriptions WHERE owner_type=$1 AND owner_id=$2
         ORDER BY id LIMIT 2 FOR SHARE`,[type,id]);
    if(rows.rows.length>1)return denied("BOOKING_OWNER_BILLING_SCOPE_INVALID",409);
    const billing=rows.rows[0]||null;
    if(source.rows.length||billing?.provider_namespace==="odoo_online"){
      // Cross-market or unverified typed source cannot acquire legacy rights.
      return denied("US_SAAS_COMMERCIAL_ACCESS_DENIED");
    }
    // Preserve the existing public salon guard: missing billing is denied.
    // Only the cabinet master's own missing legacy row is active by default.
    if(type==="salon"&&(!billing||billing.blocked_at||
        !["active","grace"].includes(String(billing.subscription_status||"").trim().toLowerCase())))
      return denied("PUBLIC_BOOKING_DISABLED");
    if(type===ownerType&&!["active","grace"].includes(resolveBillingAccessState(billing)))
      return denied("BILLING_BLOCKED");
  }
  return null;
}

// Historical exported name retained. All markets use the existing booking
// row transaction; legacy transition/payment/notification rules are preserved.
// No caller-provided commercial permission or test bypass exists.
export async function executeUsLifecycleTransaction(db, {auth, salonId, bookingId, action,marketCode="US",marketId=null}) {
  const session=marketCode==="US"?checkUsLifecycleSession(auth):checkBookingOwnerSession(auth);
  if(!session.ok)return {http:session.status,body:{ok:false,error:session.error}};
  if(!Number.isSafeInteger(Number(salonId)) || Number(salonId)<1 ||
     !Number.isSafeInteger(Number(bookingId)) || Number(bookingId)<1 ||
     !["US","KG","KZ"].includes(marketCode) ||
     !["confirm","complete","cancel"].includes(action)) {
    return {http:400,body:{ok:false,error:marketCode==="US"?"US_LIFECYCLE_REQUEST_INVALID":"BOOKING_LIFECYCLE_REQUEST_INVALID"}};
  }
  const isUsMarket=marketCode==="US";
  const tx=await db.connect();
  let opened=false;
  try{
    await tx.query("BEGIN");
    opened=true;
    await tx.query("SET LOCAL statement_timeout = '5000ms'");
    await tx.query("SET LOCAL lock_timeout = '2000ms'");
    const selected=await tx.query(
      `SELECT b.id,b.status,b.salon_id,b.salon_slug,b.master_id,
              m.slug AS master_slug,b.client_id,b.service_id,
              b.start_at,b.end_at,b.price_snapshot
         FROM public.bookings b
         LEFT JOIN public.masters m ON m.id=b.master_id
        WHERE b.id=$1 AND b.salon_id=$2
        FOR UPDATE OF b`,
      [Number(bookingId),Number(salonId)]
    );
    const booking=selected.rows?.[0];
    if(!booking){
      await tx.query("ROLLBACK");opened=false;
      return {http:404,body:{ok:false,error:"BOOKING_NOT_FOUND"}};
    }
    const authority=await authorizeLifecycleWrite(tx,auth,booking,marketCode,marketId);
    if(authority){
      await tx.query("ROLLBACK");opened=false;
      return authority;
    }
    const previous=String(booking.status||"").toLowerCase();
    if(action==="confirm" && (isUsMarket?previous==="confirmed":booking.status==="confirmed")){
      await tx.query("COMMIT");opened=false;
      return {http:200,body:{ok:true,status:"already_confirmed"}};
    }
    if(isUsMarket && action==="cancel" && (previous==="cancelled" || previous==="canceled")){
      await tx.query("COMMIT");opened=false;
      return {http:200,body:{ok:true,status:"already_cancelled"}};
    }
    if(isUsMarket){
      if(action==="complete" && previous==="reserved"){
        await tx.query("ROLLBACK");opened=false;
        return {http:409,body:{ok:false,error:"BOOKING_PAYMENT_REQUIRED",status:booking.status}};
      }
      if(previous!=="reserved" && !(previous==="confirmed" &&
        (action==="complete" || action==="cancel"))){
        await tx.query("ROLLBACK");opened=false;
        const error=action==="cancel" && previous==="completed"
          ? "CANNOT_CANCEL_COMPLETED" : "INVALID_STATUS";
        return {http:409,body:{ok:false,error,status:booking.status}};
      }
    }else if((action==="confirm"&&["completed","cancelled","canceled"].includes(previous))||
             (action==="cancel"&&booking.status==="completed")){
      await tx.query("ROLLBACK");opened=false;
      return {http:409,body:{ok:false,error:action==="cancel"?"CANNOT_CANCEL_COMPLETED":"INVALID_STATUS",status:booking.status}};
    }
    if(isUsMarket&&action==="cancel"){
      // A Stripe LIVE attempt has financial existence outside PostgreSQL.
      // Never release a US slot while a corresponding intent may be active,
      // settled, or still being created. Owner reconciliation is required;
      // do NOT initiate a Stripe cancel/refund or alter the payment sidecar.
      // Lock order for all US writers: bookings row -> LIVE intent row.
      const live=await tx.query(
        `SELECT status,stripe_payment_intent_id
           FROM public.us_stripe_live_payment_intents
          WHERE booking_id=$1 LIMIT 1 FOR UPDATE`,
        [Number(bookingId)]
      );
      if(live.rows?.length){
        await tx.query("ROLLBACK");opened=false;
        return {http:409,body:{
          ok:false,error:"US_LIFECYCLE_STRIPE_RECONCILIATION_REQUIRED",
        }};
      }
    }
    if(action==="complete"){
      // Check pending cash while the booking row remains locked.
      const payment=await tx.query(
        `SELECT id,provider,status,is_active
           FROM public.payments
          WHERE booking_id=$1 AND provider='direct'
            AND status='pending' AND is_active=true
          ORDER BY updated_at DESC NULLS LAST,id DESC LIMIT 1`,
        [Number(bookingId)]
      );
      if(payment.rows?.length){
        const p=payment.rows[0];
        await tx.query("ROLLBACK");opened=false;
        return {http:409,body:{
          ok:false,error:"CASH_PAYMENT_PENDING_CONFIRMATION",
          message_ru:"Нельзя завершить визит: наличные ожидают подтверждения.",
          payment_label_ru:getPublicLifecyclePaymentLabelRu(
            p.provider,p.status,Boolean(p.id)),
          cash_pending_alert:true,
        }};
      }
      if(!isUsMarket&&booking.status!=="confirmed"){
        await tx.query("ROLLBACK");opened=false;
        return {http:409,body:{ok:false,error:booking.status==="reserved"?"BOOKING_PAYMENT_REQUIRED":"INVALID_STATUS",status:booking.status}};
      }
    }
    const next=action==="confirm"?"confirmed":
      action==="complete"?"completed":"cancelled";
    const update=action==="confirm"
      ? `UPDATE public.bookings SET status='confirmed',confirmed_at=NOW()
           WHERE id=$1 AND salon_id=$2 AND status IS NOT DISTINCT FROM $3 RETURNING id`
      : `UPDATE public.bookings SET status=$4
           WHERE id=$1 AND salon_id=$2 AND status IS NOT DISTINCT FROM $3 RETURNING id`;
    const parameters=action==="confirm"
      ? [Number(bookingId),Number(salonId),booking.status]
      : [Number(bookingId),Number(salonId),booking.status,next];
    const updated=await tx.query(update,parameters);
    if(updated.rowCount!==1){
      await tx.query("ROLLBACK");opened=false;
      return {http:409,body:{ok:false,error:isUsMarket?"US_LIFECYCLE_STATUS_CONFLICT":"BOOKING_LIFECYCLE_STATUS_CONFLICT"}};
    }
    if(action==="cancel"){
      await tx.query(
        `UPDATE public.payments
            SET status='rejected',is_active=false,rejected_at=NOW(),
                rejection_reason='booking_cancelled',updated_at=NOW()
          WHERE booking_id=$1 AND provider='direct'
            AND status='pending' AND is_active=true`,
        [Number(bookingId)]
      );
      await releaseCalendarSlotForBooking(tx,Number(bookingId),"booking_cancelled");
    }
    const commitAuthority=await authorizeLifecycleWrite(tx,auth,booking,marketCode,marketId);
    if(commitAuthority){
      await tx.query("ROLLBACK");opened=false;
      return commitAuthority;
    }
    await tx.query("COMMIT");opened=false;
    return {http:200,body:{ok:true,status:next},
      notify:action!=="confirm",booking,action};
  }catch(error){
    if(opened){
      try{await tx.query("ROLLBACK");}catch(rollbackError){
        console.error("US_LIFECYCLE_ROLLBACK_ERROR",rollbackError);
      }
    }
    throw error;
  }finally{
    tx.release();
  }
}

// Same existing completion/cancellation notification payload for all markets.
// Notify only AFTER the transaction commits.
async function notifyUsLifecycleAfterCommit(booking,action) {
  const nextStatus=action==="complete"?"completed":"cancelled";
  const notificationAction=action==="complete"?"completed":"cancel";
  const payload={
    booking_id:Number(booking.id),
    salon_id:Number(booking.salon_id),
    salon_slug:String(booking.salon_slug||""),
    master_id:Number(booking.master_id),
    client_id:Number(booking.client_id),
    service_id:Number(booking.service_id),
    start_at:booking.start_at ? new Date(booking.start_at).toISOString() : null,
    end_at:booking.end_at ? new Date(booking.end_at).toISOString() : null,
    price:Number(booking.price_snapshot||0),
    lifecycle_action:action,next_status:nextStatus,
  };
  for(const targetType of ["client","master","salon"]){
    const targetId=targetType==="client"?String(booking.client_id):
      targetType==="master"?String(booking.master_id):String(booking.salon_id);
    const template=buildBookingLifecycleNotificationTemplate(
      notificationAction,targetType);
    await createNotification(pool,{
      target_type:targetType,target_id:targetId,
      owner_type:"salon",owner_id:booking.salon_id,channel:"in_app",
      ...template,action_url:buildLifecycleActionUrl(booking,targetType),
      status:"sent",payload_json:payload,
    });
  }
}

export async function publicLifecycle(req, res) {
  try {
    const { salon_id } = req.tenant;
    const bookingId = Number(req.params.id);
    const { action } = req.body || {};
    if (!Number.isSafeInteger(bookingId) || bookingId <= 0)
      return res.status(400).json({ok:false,error:"BOOKING_ID_INVALID"});
    if (!["confirm","complete","cancel"].includes(action))
      return res.status(400).json({ok:false,error:"INVALID_ACTION"});
    const marketCode=req.market_context?.market_code;
    const marketId=req.market_context?.market_id;
    const isUsMarket=marketCode==="US";
    const session=isUsMarket?checkUsLifecycleSession(req.auth):checkBookingOwnerSession(req.auth);
    if(!session.ok)return res.status(session.status).json({ok:false,error:session.error});
    if(!["KG","KZ","US"].includes(marketCode)||!Number.isSafeInteger(marketId)||marketId<1)
      return res.status(409).json({ok:false,error:"BOOKING_OWNER_MARKET_SCOPE_INVALID"});
    const result=await executeUsLifecycleTransaction(pool,{
      auth:req.auth,salonId:salon_id,bookingId,action,marketCode,marketId,
    });
    if(result.notify){
      try{await notifyUsLifecycleAfterCommit(result.booking,result.action);}
      catch(error){console.error("BOOKING_LIFECYCLE_NOTIFICATION_ERROR",error);}
    }
    return res.status(result.http).json(result.body);
  }catch(err){
    console.error("PUBLIC_LIFECYCLE_ERROR",String(err?.code||"UNKNOWN"));
    return res.status(500).json({ok:false,error:"INTERNAL_ERROR"});
  }
}
