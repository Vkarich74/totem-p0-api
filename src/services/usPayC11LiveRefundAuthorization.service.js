/**
 * US-PAY-C11 / LIVE Standard direct-charge REFUND INITIATION.
 *
 * Authoritative server-side USD sum, seller binding, real session-backed
 * owner permission and one immutable approved amount. Stripe-Account
 * must equal the seller on the already signed successful direct charge.
 *
 * OFF by default in the route. Zero writes outside isolated US sidecars.
 * Never retry an unresolved POST after 20h (Stripe idempotency can expire).
 * NEVER expose Stripe key, raw response or credentials to browser/logs.
 */
import {verifyUsLiveSellerOwnerScope} from
  "./usPayC11LiveSellerOnboarding.service.js";
import {verifyUsConnectPlatform} from "./usPayC11LiveStripeApi.js";

const POSITIVE=/^[1-9]\d*$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const SECRET=/^sk_live_[a-zA-Z0-9_]+$/;
const ACCOUNT=/^acct_[A-Za-z0-9]{8,}$/;
const REFUND=/^re_[A-Za-z0-9_]{8,}$/;
const REASONS=new Set(["requested_by_customer","duplicate","fraudulent"]);
const REFUND_STATES=new Set(["pending","requires_action","succeeded","failed","canceled"]);
const RETRY_MAX_MS=20*60*60*1000;
const IN_FLIGHT_DELAY_MS=60*1000;

function deny(status,error){return {status,body:{ok:false,error}};}
function pos(raw){
  const s=String(raw??"");
  if(!POSITIVE.test(s))return null;
  const n=Number(s);
  return Number.isSafeInteger(n)?n:null;
}
function amount(raw){
  const s=String(raw??"");
  if(!POSITIVE.test(s))return null;
  const n=BigInt(s);
  return n<=99999999n?n:null;
}
async function withTx(pool,fn) {
  const db=await pool.connect();
  let started=false,errorOnRelease;
  try {
    await db.query("BEGIN");
    started=true;
    await db.query("SET LOCAL statement_timeout='5000ms'");
    await db.query("SET LOCAL lock_timeout='2000ms'");
    const answer=await fn(db);
    if(answer.status>=200 && answer.status<300){
      await db.query("COMMIT");
      started=false;
    }
    return answer;
  } finally {
    if(started) {
      try{await db.query("ROLLBACK");}
      catch(error){errorOnRelease=error;}
    }
    db.release(errorOnRelease||undefined);
  }
}

async function bookedUsDirectCharge(db,bookingId) {
  const q=await db.query(
    `SELECT pay.booking_id,pay.market_id,pay.seller_binding_id,
            pay.stripe_account_id,pay.stripe_payment_intent_id,
            pay.amount_minor::text AS amount_minor,pay.currency_code,
            pay.status,pay.last_event_id,
            seller.owner_type,seller.owner_id,
            seller.stripe_account_id AS binding_stripe_account,
            seller.market_id AS seller_market,
            seller.stripe_mode,seller.account_type,
            seller.verification_status,
            b.salon_id,b.master_id,b.status AS booking_status,
            m.code AS market_code,m.active AS market_active,
            m.default_currency AS market_currency,
            receipt.event_type AS last_event_type,
            receipt.signature_verified AS signed,
            receipt.result AS last_receipt_result
       FROM public.us_stripe_live_payment_intents pay
       JOIN public.bookings b ON b.id=pay.booking_id
       JOIN public.markets m ON m.id=pay.market_id
       JOIN public.us_stripe_live_seller_bindings seller
         ON seller.id=pay.seller_binding_id
       LEFT JOIN public.us_stripe_live_payment_receipts receipt
         ON receipt.stripe_event_id=pay.last_event_id
      WHERE pay.booking_id=$1
      LIMIT 1 FOR UPDATE OF pay`,
    [bookingId]
  );
  return q.rows[0]||null;
}

function authorizedCharge(row,ownerType,ownerId,marketId){
  return row && row.market_code==="US" &&
    row.market_active===true && row.market_currency==="USD" &&
    String(row.market_id)===String(marketId) &&
    String(row.seller_market)===String(marketId) &&
    row.currency_code==="USD" && row.status==="succeeded" &&
    row.last_event_type==="payment_intent.succeeded" &&
    row.signed===true && row.last_receipt_result==="accepted" &&
    row.stripe_mode==="LIVE" && row.account_type==="standard" &&
    row.verification_status==="verified" &&
    row.owner_type===ownerType &&
    String(row.owner_id)===String(ownerId) &&
    (ownerType!=="salon" || String(row.salon_id)===String(ownerId)) &&
    (ownerType!=="master" || String(row.master_id)===String(ownerId)) &&
    ACCOUNT.test(String(row.stripe_account_id||"")) &&
    row.stripe_account_id===row.binding_stripe_account &&
    /^pi_[A-Za-z0-9_]{8,}$/.test(String(row.stripe_payment_intent_id||"")) &&
    amount(row.amount_minor)!==null;
}

async function remainingRefundable(db,bookingId,totalMinor) {
  const q=await db.query(
    `SELECT
      COALESCE((
        SELECT SUM(amount_minor) FROM public.us_c11_live_refunds
         WHERE booking_id=$1 AND status='succeeded'
      ),0)::text AS already_refunded,
      COALESCE((
        SELECT SUM(r.amount_minor)
          FROM public.us_c11_live_refund_requests r
         WHERE r.booking_id=$1
           AND r.state IN ('reserved','submitted','requires_review')
      ),0)::text AS outstanding,
      EXISTS (
        SELECT 1 FROM public.us_c11_live_disputes d
         WHERE d.booking_id=$1 AND d.status IN
         ('needs_response','under_review','lost',
          'warning_needs_response','warning_under_review')
      ) AS disputed`,
    [bookingId]
  );
  const x=q.rows[0];
  const remain=totalMinor-BigInt(x.already_refunded)-BigInt(x.outstanding);
  return {remain,outstanding:BigInt(x.outstanding),disputed:x.disputed===true};
}

async function reserveOwnerConsent(pool,{
  auth,ownerType,ownerId,bookingId,requestId,amountMinor,reason,
  expectedRemainingMinor,
}){
  return withTx(pool,async db=>{
    const owner=await verifyUsLiveSellerOwnerScope(db,{
      auth,ownerType,ownerId,
    });
    if(!owner)return deny(404,"US_C11_REFUND_OWNER_NOT_AUTHORIZED");
    const b=await bookedUsDirectCharge(db,bookingId);
    if(!authorizedCharge(b,ownerType,owner.ownerId,owner.marketId)){
      return deny(409,"US_C11_REFUND_VERIFIED_PAYMENT_REQUIRED");
    }
    const existing=await db.query(
      `SELECT * FROM public.us_c11_live_refund_requests
        WHERE request_id=$1 LIMIT 1 FOR UPDATE`,
      [requestId]
    );
    if(existing.rows.length){
      const old=existing.rows[0];
      if(old.booking_id!==bookingId ||
         old.authorized_user_id!==owner.userId ||
         old.authorized_session_id!==owner.sessionId ||
         old.authorized_owner_type!==ownerType ||
         String(old.authorized_owner_id)!==String(owner.ownerId) ||
         String(old.amount_minor)!==String(amountMinor) ||
         old.reason!==reason ||
         old.stripe_account_id!==b.stripe_account_id ||
         old.stripe_payment_intent_id!==b.stripe_payment_intent_id){
        return deny(409,"US_C11_REFUND_REQUEST_ID_REUSED_DIFFERENTLY");
      }
      if(old.state!=="reserved"){
        return {status:200,body:{ok:true,result:"existing_request",
          request_id:requestId,state:old.state,refund_id:old.stripe_refund_id||null,
          refund_confirmed:old.state==="succeeded"}};
      }
      const age=Date.now()-new Date(old.created_at).getTime();
      if(age<0||age>RETRY_MAX_MS){
        await db.query(
          `UPDATE public.us_c11_live_refund_requests
             SET state='requires_review'
           WHERE request_id=$1 AND state='reserved'`,[requestId]
        );
        return {status:200,body:{ok:true,result:"manual_review_required",
          request_id:requestId,state:"requires_review",refund_confirmed:false}};
      }
      const recent=old.last_attempt_at?
        Date.now()-new Date(old.last_attempt_at).getTime():Infinity;
      if(recent<IN_FLIGHT_DELAY_MS){
        return deny(409,"US_C11_REFUND_REQUEST_ALREADY_PROCESSING");
      }
      await db.query(
        `UPDATE public.us_c11_live_refund_requests SET last_attempt_at=now()
          WHERE request_id=$1 AND state='reserved'`,[requestId]
      );
      return {status:200,body:{ok:true,result:"send_stripe",
        request_id:requestId,account:b.stripe_account_id,
        payment_intent:b.stripe_payment_intent_id,
        cents:amountMinor,reason}};
    }
    const tally=await remainingRefundable(
      db,bookingId,BigInt(b.amount_minor)
    );
    if(tally.disputed)return deny(409,"US_C11_REFUND_DISPUTE_MANUAL_REVIEW");
    if(tally.outstanding>0n)return deny(409,"US_C11_REFUND_PREVIOUS_OUTCOME_PENDING");
    if(tally.remain<=0n)return deny(409,"US_C11_REFUND_NOTHING_REMAINING");
    if(tally.remain!==BigInt(expectedRemainingMinor)){
      return deny(409,"US_C11_REFUND_REMAINING_AMOUNT_STALE");
    }
    if(BigInt(amountMinor)>tally.remain){
      return deny(409,"US_C11_REFUND_EXCEEDS_VERIFIED_REMAINDER");
    }

    await db.query(
      `INSERT INTO public.us_c11_live_refund_requests
         (request_id,booking_id,seller_binding_id,stripe_account_id,
          stripe_payment_intent_id,amount_minor,reason,authorized_owner_type,
          authorized_owner_id,authorized_user_id,authorized_session_id,
          explicit_consent,last_attempt_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true,now())`,
      [requestId,bookingId,b.seller_binding_id,
       b.stripe_account_id,b.stripe_payment_intent_id,
       amountMinor,reason,ownerType,owner.ownerId,owner.userId,
       owner.sessionId]
    );
    await db.query(
      `INSERT INTO public.us_c11_live_refund_consents
        (request_id,actor_user_id,actor_session_id,
         consent_amount_minor,consent_reason)
       VALUES ($1,$2,$3,$4,$5)`,
      [requestId,owner.userId,owner.sessionId,amountMinor,reason]
    );
    return {status:200,body:{ok:true,result:"send_stripe",
      request_id:requestId,account:b.stripe_account_id,
      payment_intent:b.stripe_payment_intent_id,cents:amountMinor,reason}};
  });
}

async function sendStripeRefund({
  secretKey,account,requestId,paymentIntent,amountMinor,reason,fetchImpl,
}) {
  if(!SECRET.test(String(secretKey||""))||
     !ACCOUNT.test(String(account||"")) ||
     !UUID.test(String(requestId||""))) {
    throw Error("US_C11_REFUND_LIVE_STRIPE_CONFIG_INVALID");
  }
  await verifyUsConnectPlatform({secretKey,fetchImpl});
  const response=await fetchImpl("https://api.stripe.com/v1/refunds",{
    method:"POST",
    headers:{
      Authorization:"Bearer "+secretKey,
      "Stripe-Account":account,
      "Idempotency-Key":"totem-us-c11-refund-"+requestId,
      "Content-Type":"application/x-www-form-urlencoded",
      Accept:"application/json",
    },
    body:new URLSearchParams({
      payment_intent:paymentIntent,
      amount:String(amountMinor),
      reason,
      "metadata[totem_us_c11_refund_request]":requestId,
    }).toString(),
    redirect:"error",
    signal:AbortSignal.timeout(12000),
  });
  if(!response.ok)throw Error("US_C11_REFUND_STRIPE_REQUEST_FAILED");
  const r=await response.json();
  if(r?.object!=="refund"||!REFUND.test(String(r.id||""))||
     r.livemode!==true||r.payment_intent!==paymentIntent||
     String(r.amount)!==String(amountMinor)||
     r.currency!=="usd"||!REFUND_STATES.has(r.status) ||
     r.metadata?.totem_us_c11_refund_request!==requestId){
    throw Error("US_C11_REFUND_STRIPE_RESPONSE_IDENTITY_MISMATCH");
  }
  return {id:r.id,status:r.status};
}

export async function authorizeUsC11LiveRefund(pool,{
  auth,ownerType,ownerId,bookingId,body,
  secretKey,fetchImpl=globalThis.fetch,
}={}) {
  const bid=pos(bookingId),oid=pos(ownerId);
  if(!bid||!oid||!["salon","master"].includes(ownerType)){
    return deny(400,"US_C11_REFUND_ID_INVALID");
  }
  if(!body || typeof body!=="object" || Array.isArray(body) ||
     Object.keys(body).sort().join(",")!==
       ["amount_minor","consent","expected_remaining_minor","reason","request_id"].sort().join(",") ||
     body.consent!==true ||
     typeof body.request_id!=="string"||!UUID.test(body.request_id)||
     typeof body.reason!=="string"||!REASONS.has(body.reason)||
     amount(body.amount_minor)===null ||
     amount(body.expected_remaining_minor)===null){
    return deny(400,"US_C11_REFUND_EXPLICIT_CONSENT_AND_AMOUNT_REQUIRED");
  }
  if(!SECRET.test(String(secretKey||""))){
    return deny(503,"US_C11_REFUND_LIVE_STRIPE_NOT_CONFIGURED");
  }

  const reserve=await reserveOwnerConsent(pool,{
    auth,ownerType,ownerId:oid,bookingId:bid,
    requestId:body.request_id,
    amountMinor:String(body.amount_minor),
    expectedRemainingMinor:String(body.expected_remaining_minor),
    reason:body.reason,
  });
  if(reserve.status!==200)return reserve;
  const x=reserve.body;
  if(x.result!=="send_stripe"){
    return {status:200,body:{...x,payment_ready:false}};
  }
  let stripe;
  try{
    stripe=await sendStripeRefund({
      secretKey,account:x.account,paymentIntent:x.payment_intent,
      requestId:body.request_id,amountMinor:x.cents,reason:x.reason,
      fetchImpl,
    });
  }catch{
    // Network timeout may happen AFTER Stripe accepted a refund.
    // Keep reservation. Same UUID idempotency key can be retried within
    // 20h; NEVER start another refund while this one is unresolved.
    return deny(503,"US_C11_REFUND_OUTCOME_UNCERTAIN_RETRY_SAME_REQUEST");
  }

  const saved=await withTx(pool,async db=>{
    const scope=await verifyUsLiveSellerOwnerScope(db,{
      auth,ownerType,ownerId:oid,
    });
    if(!scope)return deny(403,"US_C11_REFUND_OWNER_SESSION_EXPIRED");
    const q=await db.query(
      `SELECT * FROM public.us_c11_live_refund_requests
        WHERE request_id=$1 LIMIT 1 FOR UPDATE`,[body.request_id]
    );
    const row=q.rows[0];
    if(!row || row.stripe_account_id!==x.account ||
       row.stripe_payment_intent_id!==x.payment_intent ||
       String(row.amount_minor)!==String(x.cents) ||
       (row.stripe_refund_id && row.stripe_refund_id!==stripe.id)){
      return deny(409,"US_C11_REFUND_RESERVATION_IDENTITY_CHANGED");
    }
    await db.query(
      `UPDATE public.us_c11_live_refund_requests
         SET stripe_refund_id=$2,
             state=CASE WHEN state='reserved' THEN 'submitted' ELSE state END
       WHERE request_id=$1`,[body.request_id,stripe.id]
    );
    // Stripe's signed event may arrive before this API's response.
    const signed=await db.query(
      `SELECT status,amount_minor,booking_id,stripe_account_id
         FROM public.us_c11_live_refunds WHERE stripe_refund_id=$1`,
      [stripe.id]
    );
    const event=signed.rows[0];
    const matching=event &&
      event.booking_id===bid &&
      event.stripe_account_id===x.account &&
      String(event.amount_minor)===String(x.cents);
    if(matching&&["succeeded","failed","canceled"].includes(event.status)) {
      await db.query(
        `UPDATE public.us_c11_live_refund_requests
           SET state=$2 WHERE request_id=$1`,
        [body.request_id,event.status]
      );
    }
    const result=await db.query(
      "SELECT state FROM public.us_c11_live_refund_requests WHERE request_id=$1",
      [body.request_id]
    );
    return {status:200,body:{ok:true,
      contract_version:"US-PAY-C11-refund-authorization-v1",
      request_id:body.request_id,state:result.rows[0].state,
      stripe_refund_id:stripe.id,payment_ready:false,
      refund_confirmed:result.rows[0].state==="succeeded",
    }};
  });
  return saved;
}


/**
 * Owner-only refund quote. No refund starts here.
 * Seller/price are read from immutable trusted signed US booking data.
 */
export async function quoteUsC11LiveRefund(pool,{
  auth,ownerType,ownerId,bookingId,
}={}){
  const bid=pos(bookingId),oid=pos(ownerId);
  if(!bid||!oid||!["salon","master"].includes(ownerType)){
    return deny(400,"US_C11_REFUND_ID_INVALID");
  }
  return withTx(pool,async db=>{
    const owner=await verifyUsLiveSellerOwnerScope(db,{
      auth,ownerType,ownerId:oid,
    });
    if(!owner)return deny(404,"US_C11_REFUND_OWNER_NOT_AUTHORIZED");
    const b=await bookedUsDirectCharge(db,bid);
    if(!authorizedCharge(b,ownerType,oid,owner.marketId)){
      return deny(409,"US_C11_REFUND_VERIFIED_PAYMENT_REQUIRED");
    }
    const total=BigInt(b.amount_minor);
    const tally=await remainingRefundable(db,bid,total);
    return {status:200,body:{
      ok:true,contract_version:"US-PAY-C11-refund-quote-v1",
      market_code:"US",currency_code:"USD",booking_id:bid,
      owner_type:ownerType,owner_id:oid,
      paid_amount_minor:total.toString(),
      remaining_minor:tally.remain>0n?tally.remain.toString():"0",
      outstanding_request:tally.outstanding>0n,
      dispute_block:tally.disputed,
      refundable:tally.remain>0n&&tally.outstanding===0n&&!tally.disputed,
      refund_confirmed:false,
      payment_ready:false,
    }};
  });
}
