/**
 * US-PAY-C11: verified LIVE financial observation, NO money movement.
 * Connect account identity and signed raw Stripe events are mandatory.
 * Each event is re-read with Stripe REST on the *same* connected account
 * before a narrow US booking / seller balance audit can be updated.
 *
 * Direct-charge refunds reduce the connected seller's Stripe balance,
 * never the platform's ledger. Payouts aggregate the SELLER balance and
 * must NEVER be represented as a payout of one salon appointment.
 */
import {createHash} from "node:crypto";
import {verifyStripeRawSignature} from "./usStripeTestWebhook.service.js";
import {verifyUsConnectPlatform} from "./usPayC11LiveStripeApi.js";

const EVT=/^evt_[A-Za-z0-9_]{8,}$/;
const ACC=/^acct_[A-Za-z0-9]{8,}$/;
const REFUND=/^re_[A-Za-z0-9_]{8,}$/;
const DISPUTE=/^du_[A-Za-z0-9_]{8,}$/;
const PAYOUT=/^po_[A-Za-z0-9_]{8,}$/;
const TXN=/^txn_[A-Za-z0-9_]{8,}$/;
const SECRET=/^sk_live_[A-Za-z0-9_]+$/;
const TYPES=new Set([
  "refund.created","refund.updated","refund.failed",
  "charge.dispute.created","charge.dispute.updated","charge.dispute.closed",
  "charge.dispute.funds_withdrawn","charge.dispute.funds_reinstated",
  "payout.created","payout.updated","payout.paid","payout.failed",
  "payout.canceled","payout.reconciliation_completed",
]);
const REFUND_STATES=new Set([
  "pending","requires_action","succeeded","failed","canceled"
]);
const DISPUTE_STATES=new Set([
  "needs_response","under_review","won","lost",
  "warning_needs_response","warning_under_review","warning_closed",
  "prevented",
]);
const PAYOUT_STATES=new Set([
  "pending","in_transit","paid","failed","canceled"
]);
function fail(status,code){return {status,body:{ok:false,error:code}};}
function objectId(type,id) {
  return typeof id==="string" &&
    (type==="refund"?REFUND:type==="dispute"?DISPUTE:PAYOUT).test(id);
}

function eventFromSignature(raw,signature,webhookSecret) {
  if(!Buffer.isBuffer(raw)||raw.length<2||raw.length>131072||
      !verifyStripeRawSignature(raw,signature,webhookSecret))
    return null;
  let event;
  try{event=JSON.parse(raw.toString("utf8"));}
  catch{return null;}
  const type=event?.type;
  const kind=type?.startsWith("refund.")?"refund":
    type?.startsWith("charge.dispute.")?"dispute":
      type?.startsWith("payout.")?"payout":null;
  if(event?.object!=="event"||event.livemode!==true||
     !EVT.test(String(event.id||""))||
     !ACC.test(String(event.account||""))||
     !TYPES.has(type) || !kind ||
     !Number.isSafeInteger(event.created)||event.created<1||
     event.data?.object?.object!==kind||
     !objectId(kind,event.data.object.id))return null;
  return {event,kind,objectId:event.data.object.id};
}

async function getStripeObject({secretKey,accountId,kind,id,fetchImpl}) {
  if(!SECRET.test(String(secretKey||"")) ||
     !ACC.test(accountId) || !objectId(kind,id) ||
     typeof fetchImpl!=="function") {
    throw Error("US_C11_FINANCE_STRIPE_CONFIG_REQUIRED");
  }
  const resource=kind==="dispute"?"disputes":
    kind==="refund"?"refunds":"payouts";
  const r=await fetchImpl("https://api.stripe.com/v1/"+resource+"/"+id,{
    method:"GET",
    headers:{Authorization:"Bearer "+secretKey,
      "Stripe-Account":accountId,Accept:"application/json"},
    redirect:"error",signal:AbortSignal.timeout(12000),
  });
  if(!r.ok)throw Error("US_C11_FINANCE_STRIPE_READ_FAILED");
  const o=await r.json();
  if(o?.object!==kind || o.id!==id ||
     o.livemode===false || o.currency!=="usd") {
    throw Error("US_C11_FINANCE_STRIPE_OBJECT_MISMATCH");
  }
  return o;
}

async function listAutomaticPayoutItems({
  secretKey,accountId,payoutId,fetchImpl,
}) {
  let cursor=null,rounds=0;
  const records=[],seen=new Set();
  do{
    if(++rounds>50)throw Error("US_C11_PAYOUT_TOO_MANY_BALANCE_ITEMS");
    const url=new URL("https://api.stripe.com/v1/balance_transactions");
    url.searchParams.set("payout",payoutId);
    url.searchParams.set("limit","100");
    if(cursor)url.searchParams.set("starting_after",cursor);
    const r=await fetchImpl(url.toString(),{
      method:"GET",
      headers:{Authorization:"Bearer "+secretKey,
        "Stripe-Account":accountId,Accept:"application/json"},
      redirect:"error",signal:AbortSignal.timeout(20000),
    });
    if(!r.ok)throw Error("US_C11_PAYOUT_ITEMS_STRIPE_READ_FAILED");
    const data=await r.json();
    if(data?.object!=="list"||!Array.isArray(data.data)||
       typeof data.has_more!=="boolean"||
       data.data.length>100) {
      throw Error("US_C11_PAYOUT_ITEMS_FORMAT_INVALID");
    }
    for(const item of data.data){
      if(item.object!=="balance_transaction"||
         !TXN.test(String(item.id||"")) ||
         seen.has(item.id) ||
         item.currency!=="usd"||
         !Number.isSafeInteger(item.amount)||
         !Number.isSafeInteger(item.net)||
         !Number.isSafeInteger(item.fee)||
         item.fee<0 || item.net!==item.amount-item.fee ||
         typeof item.reporting_category!=="string"||
         item.reporting_category.length>100) {
        throw Error("US_C11_PAYOUT_BALANCE_ITEM_UNTRUSTED");
      }
      seen.add(item.id);
      records.push({
        id:item.id,gross:item.amount,net:item.net,fee:item.fee,
        category:item.reporting_category,
        source:typeof item.source==="string"&&item.source.length<150?
          item.source:null,
      });
    }
    if(!data.has_more)break;
    if(!data.data.length)throw Error("US_C11_PAYOUT_PAGINATION_STALLED");
    cursor=data.data.at(-1).id;
  }while(true);
  const net=records.reduce((n,item)=>n+BigInt(item.net),0n);
  return {records,net};
}

async function withTx(pool,fn) {
  const db=await pool.connect();
  let started=false,releaseError;
  try{
    await db.query("BEGIN");
    started=true;
    await db.query("SET LOCAL statement_timeout='6500ms'");
    await db.query("SET LOCAL lock_timeout='2000ms'");
    const result=await fn(db);
    await db.query("COMMIT");
    started=false;
    return result;
  }finally{
    if(started){
      try{await db.query("ROLLBACK");}
      catch(error){releaseError=error;}
    }
    db.release(releaseError||undefined);
  }
}
async function sellerForAccount(pool,accountId){
  const r=await pool.query(
    `SELECT b.id,b.stripe_account_id
       FROM public.us_stripe_live_seller_bindings b
       JOIN public.markets m ON m.id=b.market_id
      WHERE b.stripe_account_id=$1 AND b.stripe_mode='LIVE'
        AND b.account_type='standard'
        AND m.code='US' AND m.default_currency='USD' AND m.active=true
      LIMIT 1`,
    [accountId]
  );
  return r.rows[0]||null;
}
async function bookedIntent(db,accountId,intentId){
  if(typeof intentId!=="string"||
     !/^pi_[A-Za-z0-9_]{8,}$/.test(intentId))return null;
  const r=await db.query(
    `SELECT booking_id,amount_minor,stripe_payment_intent_id,status
       FROM public.us_stripe_live_payment_intents
      WHERE stripe_account_id=$1 AND stripe_payment_intent_id=$2
      LIMIT 1 FOR UPDATE`,[accountId,intentId]);
  const row=r.rows[0]||null;
  return row && ["succeeded","refunded","disputed"].includes(row.status)?
    row:null;
}
async function receipt(db,{event,kind,objectId,raw},bookingId,result){
  const r=await db.query(
    `INSERT INTO public.us_c11_live_financial_receipts
      (stripe_event_id,stripe_account_id,object_id,event_type,
       event_created,body_sha256,signature_verified,result,booking_id)
     VALUES($1,$2,$3,$4,$5,$6,true,$7,$8)
     ON CONFLICT(stripe_event_id) DO NOTHING
     RETURNING stripe_event_id`,
    [event.id,event.account,objectId,event.type,event.created,
      createHash("sha256").update(raw).digest("hex"),result,bookingId]
  );
  return r.rows.length===1;
}

async function observeRefund(db,context,o){
  const pi=typeof o.payment_intent==="string"?o.payment_intent:null;
  const booking=await bookedIntent(db,context.event.account,pi);
  const amount=o.amount;
  const valid=booking&&Number.isSafeInteger(amount)&&amount>0 &&
    BigInt(amount)<=BigInt(booking.amount_minor) &&
    REFUND_STATES.has(o.status);
  if(!valid) {
    await receipt(db,context,null,"unlinked");
    return "unlinked";
  }
  const inserted=await receipt(db,context,booking.booking_id,"observed");
  if(!inserted)return "duplicate";
  await db.query(
    `INSERT INTO public.us_c11_live_refunds
      (stripe_refund_id,booking_id,stripe_account_id,
       stripe_payment_intent_id,amount_minor,status,
       stripe_balance_transaction_id,last_event_created,last_event_id)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT(stripe_refund_id) DO UPDATE
       SET status=EXCLUDED.status,
           stripe_balance_transaction_id=EXCLUDED.stripe_balance_transaction_id,
           last_event_created=EXCLUDED.last_event_created,
           last_event_id=EXCLUDED.last_event_id
     WHERE public.us_c11_live_refunds.last_event_created<=EXCLUDED.last_event_created`,
    [o.id,booking.booking_id,context.event.account,pi,amount,o.status,
      typeof o.balance_transaction==="string"?o.balance_transaction:null,
      context.event.created,context.event.id]
  );
  const agg=await db.query(
    `SELECT COALESCE(SUM(amount_minor) FILTER
       (WHERE status='succeeded'),0)::text AS refunded
       FROM public.us_c11_live_refunds
      WHERE booking_id=$1`,
    [booking.booking_id]
  );
  if(BigInt(agg.rows[0].refunded)>BigInt(booking.amount_minor)) {
    throw Error("US_C11_REFUND_SUM_EXCEEDS_CAPTURE");
  }

  // Link the signed Stripe refund to the ORIGINAL authorized owner request.
  // An unrecognized external Stripe refund is still observable, but it
  // must NEVER pretend that a specific TOTEM owner approved it.
  const authorized=await db.query(
    `SELECT request_id,amount_minor,stripe_payment_intent_id,
            stripe_account_id,state
       FROM public.us_c11_live_refund_requests
      WHERE stripe_refund_id=$1 LIMIT 1 FOR UPDATE`,
    [o.id]
  );
  if(authorized.rows.length) {
    const request=authorized.rows[0];
    if(String(request.amount_minor)!==String(amount) ||
       request.stripe_account_id!==context.event.account ||
       request.stripe_payment_intent_id!==pi) {
      throw Error("US_C11_SIGNED_REFUND_AUTHORIZATION_MISMATCH");
    }
    if(["succeeded","failed","canceled"].includes(o.status) &&
       (["reserved","submitted","requires_review"].includes(request.state) ||
        (request.state==="succeeded"&&o.status==="failed"))) {
      await db.query(
        `UPDATE public.us_c11_live_refund_requests
            SET state=$2 WHERE request_id=$1`,
        [request.request_id,o.status]
      );
    }
  }
  return "observed";
}

async function observeDispute(db,context,o){
  const pi=typeof o.payment_intent==="string"?o.payment_intent:null;
  const booking=await bookedIntent(db,context.event.account,pi);
  const valid=booking&&Number.isSafeInteger(o.amount)&&
    o.amount>0 && DISPUTE_STATES.has(o.status);
  if(!valid) {
    await receipt(db,context,null,"unlinked");
    return "unlinked";
  }
  const inserted=await receipt(db,context,booking.booking_id,"observed");
  if(!inserted)return "duplicate";
  await db.query(
    `INSERT INTO public.us_c11_live_disputes
      (stripe_dispute_id,booking_id,stripe_account_id,
       stripe_payment_intent_id,amount_minor,status,
       last_event_created,last_event_id)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT(stripe_dispute_id) DO UPDATE
       SET status=EXCLUDED.status,
           last_event_created=EXCLUDED.last_event_created,
           last_event_id=EXCLUDED.last_event_id
     WHERE public.us_c11_live_disputes.last_event_created<=EXCLUDED.last_event_created`,
    [o.id,booking.booking_id,context.event.account,pi,
      o.amount,o.status,context.event.created,context.event.id]
  );
  return "observed";
}

async function observePayout(db,context,o,seller,items){
  if(!Number.isSafeInteger(o.amount) || o.amount<1 ||
     !PAYOUT_STATES.has(o.status) || typeof o.automatic!=="boolean"||
     (o.arrival_date!=null && !Number.isSafeInteger(o.arrival_date))) {
    await receipt(db,context,null,"unlinked");
    return "unlinked";
  }
  const inserted=await receipt(db,context,null,"observed");
  if(!inserted)return "duplicate";
  let reconciled="unreconciled";
  const net=items?.net;
  if(o.automatic===false)reconciled="manual_unattributed";
  if(items)reconciled=net===BigInt(o.amount)?
    "automatic_verified":"variance";
  await db.query(
    `INSERT INTO public.us_c11_live_payouts
      (stripe_payout_id,seller_binding_id,stripe_account_id,
       amount_minor,stripe_status,automatic,arrival_date,
       balance_transaction_id,balance_items_count,balance_items_net_minor,
       reconciliation_status,last_event_created,last_event_id)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT(stripe_payout_id) DO UPDATE
       SET stripe_status=EXCLUDED.stripe_status,
           arrival_date=EXCLUDED.arrival_date,
           balance_transaction_id=EXCLUDED.balance_transaction_id,
           balance_items_count=CASE WHEN EXCLUDED.reconciliation_status IN
             ('automatic_verified','variance') THEN EXCLUDED.balance_items_count
             ELSE public.us_c11_live_payouts.balance_items_count END,
           balance_items_net_minor=CASE WHEN EXCLUDED.reconciliation_status IN
             ('automatic_verified','variance') THEN EXCLUDED.balance_items_net_minor
             ELSE public.us_c11_live_payouts.balance_items_net_minor END,
           reconciliation_status=CASE WHEN EXCLUDED.reconciliation_status IN
             ('automatic_verified','variance') THEN EXCLUDED.reconciliation_status
             ELSE public.us_c11_live_payouts.reconciliation_status END,
           last_event_created=EXCLUDED.last_event_created,
           last_event_id=EXCLUDED.last_event_id,
           refreshed_at=now()
     WHERE public.us_c11_live_payouts.last_event_created<=EXCLUDED.last_event_created`,
    [o.id,seller.id,context.event.account,o.amount,o.status,o.automatic,
      o.arrival_date?new Date(o.arrival_date*1000):null,
      typeof o.balance_transaction==="string"?o.balance_transaction:null,
      items?.records.length||0,items?.net.toString()||null,
      reconciled,context.event.created,context.event.id]
  );
  if(items && reconciled==="automatic_verified") {
    for(const item of items.records){
      await db.query(
        `INSERT INTO public.us_c11_live_payout_balance_items
          (stripe_payout_id,stripe_balance_transaction_id,
           net_minor,gross_minor,stripe_fee_minor,reporting_category,
           stripe_source_id)
         VALUES($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT(stripe_payout_id,stripe_balance_transaction_id)
         DO NOTHING`,
        [o.id,item.id,item.net,item.gross,item.fee,item.category,item.source]
      );
    }
  }
  return reconciled;
}

export async function acceptUsC11SignedLiveFinancialEvent({
  pool,rawBody,stripeSignature,webhookSecret,secretKey,
  fetchImpl=globalThis.fetch,
}={}) {
  const context=eventFromSignature(rawBody,stripeSignature,webhookSecret);
  if(!context)return fail(400,"US_C11_FINANCIAL_SIGNATURE_OR_EVENT_INVALID");
  if(!SECRET.test(String(secretKey||""))){
    return fail(503,"US_C11_FINANCIAL_REST_NOT_CONFIGURED");
  }
  const seller=await sellerForAccount(pool,context.event.account);
  if(!seller) {
    // No merchant creates or implicit trust in any other Stripe account.
    return {status:200,body:{ok:true,result:"unlinked"}};
  }
  await verifyUsConnectPlatform({secretKey,fetchImpl});
  const object=await getStripeObject({
    secretKey,accountId:context.event.account,kind:context.kind,
    id:context.objectId,fetchImpl,
  });
  // NEVER reconcile a settlement from event order or browser callbacks.
  // Always read the current Stripe object using that seller's account.
  let items=null;
  if(context.kind==="payout" &&
     context.event.type==="payout.reconciliation_completed" &&
     object.automatic===true) {
    items=await listAutomaticPayoutItems({
      secretKey,accountId:context.event.account,
      payoutId:context.objectId,fetchImpl,
    });
  }
  const result=await withTx(pool,async db=>{
    const prior=await db.query(
      `SELECT 1 FROM public.us_c11_live_financial_receipts
        WHERE stripe_event_id=$1 LIMIT 1`,
      [context.event.id]
    );
    if(prior.rows.length)return "duplicate";
    const c={...context,raw:rawBody};
    if(context.kind==="refund")return observeRefund(db,c,object);
    if(context.kind==="dispute")return observeDispute(db,c,object);
    return observePayout(db,c,object,seller,items);
  });
  return {status:200,body:{ok:true,result}};
}
