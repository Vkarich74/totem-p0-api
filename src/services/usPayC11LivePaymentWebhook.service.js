/**
 * US-PAY-C11: Stripe LIVE connected-account PaymentIntent webhook.
 * Only signed raw payloads; event.account must be the pinned seller.
 * Only this service can record payment succeeded; browser redirects and
 * payment creation responses never mark booking paid.
 * Does not mutate legacy bookings, KG/KZ finance or payouts.
 */
import { createHash } from "node:crypto";
import { verifyStripeRawSignature } from "./usStripeTestWebhook.service.js";

const EVENT=/^evt_[A-Za-z0-9_]{8,}$/;
const ACCOUNT=/^acct_[A-Za-z0-9]{8,}$/;
const INTENT=/^pi_[A-Za-z0-9_]{8,}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED=new Set([
  "payment_intent.succeeded","payment_intent.processing",
  "payment_intent.payment_failed","payment_intent.canceled",
]);

function deny(status,error){return {status,body:{ok:false,error}};}

function inspect(raw,stripeSignature,webhookSecret) {
  if(!Buffer.isBuffer(raw)||raw.length<2||raw.length>131072||
     !verifyStripeRawSignature(raw,stripeSignature,webhookSecret)){
    return {error:"US_C11_LIVE_PAYMENT_SIGNATURE_INVALID"};
  }
  let e;
  try{e=JSON.parse(raw.toString("utf8"));}
  catch{return {error:"US_C11_LIVE_PAYMENT_EVENT_JSON_INVALID"};}
  if(e?.object!=="event"||e.livemode!==true||
     !EVENT.test(String(e.id||"")) ||
     !ACCOUNT.test(String(e.account||"")) ||
     !ALLOWED.has(e.type) ||
     !Number.isSafeInteger(e.created)||e.created<1 ||
     e.data?.object?.object!=="payment_intent" ||
     !INTENT.test(String(e.data.object.id||"")) ||
     e.data.object.livemode!==true ||
     e.data.object.currency!=="usd" ||
     !Number.isSafeInteger(e.data.object.amount) ||
     e.data.object.amount<50 ||
     e.data.object.amount>99999999 ||
     !/^[1-9]\d*$/.test(String(e.data.object.metadata?.totem_us_booking_id||"")) ||
     !UUID.test(String(e.data.object.metadata?.totem_us_reservation||"")) ||
     e.data.object.metadata?.totem_market!=="US") {
    return {error:"US_C11_LIVE_PAYMENT_EVENT_NOT_ACCEPTED"};
  }
  const pi=e.data.object;
  let status;
  if(e.type==="payment_intent.succeeded" && pi.status==="succeeded" &&
     Number.isSafeInteger(pi.amount_received) &&
     pi.amount_received===pi.amount) status="succeeded";
  else if(e.type==="payment_intent.processing" &&
          pi.status==="processing") status="processing";
  else if(e.type==="payment_intent.payment_failed" &&
          pi.status==="requires_payment_method") status="requires_payment_method";
  else if(e.type==="payment_intent.canceled" &&
          pi.status==="canceled") status="canceled";
  else return {error:"US_C11_LIVE_PAYMENT_EVENT_STATUS_MISMATCH"};
  const bookingId=Number(pi.metadata.totem_us_booking_id);
  if(!Number.isSafeInteger(bookingId)||bookingId<1) {
    return {error:"US_C11_LIVE_PAYMENT_BOOKING_ID_INVALID"};
  }
  return {e,pi,status,bookingId};
}

async function tx(pool,cb) {
  const db=await pool.connect();
  let started=false,releaseError=null;
  try {
    await db.query("BEGIN");
    started=true;
    await db.query("SET LOCAL statement_timeout='5000ms'");
    await db.query("SET LOCAL lock_timeout='2000ms'");
    const result=await cb(db);
    await db.query("COMMIT");
    started=false;
    return result;
  } finally {
    if(started){
      try{await db.query("ROLLBACK");}
      catch(error){releaseError=error;}
    }
    db.release(releaseError||undefined);
  }
}

export async function acceptSignedUsC11LivePaymentEvent({
  pool,rawBody,stripeSignature,webhookSecret,
}={}) {
  const examined=inspect(rawBody,stripeSignature,webhookSecret);
  if(examined.error) return deny(400,examined.error);
  const {e,pi,status,bookingId}=examined;

  return tx(pool,async db=>{
    const earlier=await db.query(
      `SELECT 1 FROM public.us_stripe_live_payment_receipts
        WHERE stripe_event_id=$1 LIMIT 1`,
      [e.id]
    );
    if(earlier.rows.length){
      return {status:200,body:{ok:true,result:"duplicate",payment_ready:false}};
    }
    const fetched=await db.query(
      `SELECT * FROM public.us_stripe_live_payment_intents
        WHERE booking_id=$1 LIMIT 1 FOR UPDATE`,
      [bookingId]
    );
    const attempt=fetched.rows[0]||null;
    // Signed Stripe events are not sufficient on their own: a valid event
    // may refer to an outdated base-only amount. Revalidate the frozen
    // tax-inclusive quote and collector identity inside this transaction.
    const quoteQuery=await db.query(
      `SELECT tq.market_id,tq.payment_purpose,
              tq.collector_owner_type,tq.collector_owner_id,
              tq.collector_revision,tq.currency_code,
              tq.service_base_minor::text AS base_minor,
              tq.service_tax_minor::text AS tax_minor,
              tq.charge_total_minor::text AS total_minor,
              bp.amount_minor::text AS authoritative_base,
              col.collector_owner_type AS live_owner_type,
              col.collector_owner_id AS live_owner_id,
              col.revision AS live_revision
         FROM public.us_booking_service_tax_snapshots tq
         JOIN public.us_booking_price_snapshots bp
           ON bp.booking_id=tq.booking_id AND bp.market_id=tq.market_id
         JOIN public.us_booking_payment_collectors col
           ON col.booking_id=tq.booking_id AND col.market_id=tq.market_id
        WHERE tq.booking_id=$1
        LIMIT 1 FOR SHARE OF tq,bp,col`,
      [bookingId]
    );
    const quote=quoteQuery.rows[0]||null;
    const quoteMatches=quote && attempt &&
      quote.payment_purpose==="beauty_service" &&
      quote.currency_code==="USD" &&
      String(quote.market_id)===String(attempt.market_id) &&
      String(quote.base_minor)===String(quote.authoritative_base) &&
      String(quote.total_minor)===String(attempt.amount_minor) &&
      String(quote.total_minor)===String(pi.amount) &&
      quote.collector_owner_type===attempt.collector_owner_type &&
      String(quote.collector_owner_id)===String(attempt.collector_owner_id) &&
      String(quote.collector_revision)===String(attempt.collector_revision) &&
      quote.live_owner_type===quote.collector_owner_type &&
      String(quote.live_owner_id)===String(quote.collector_owner_id) &&
      String(quote.live_revision)===String(quote.collector_revision);
    const matches=quoteMatches &&
      String(attempt.reservation_token)===pi.metadata.totem_us_reservation &&
      attempt.stripe_account_id===e.account &&
      String(attempt.amount_minor)===String(pi.amount) &&
      attempt.currency_code==="USD" &&
      (!attempt.stripe_payment_intent_id ||
        attempt.stripe_payment_intent_id===pi.id);
    const isOlder=matches&&attempt.stripe_event_created!=null&&
      Number(attempt.stripe_event_created)>e.created;
    const settled=matches&&["succeeded","refunded","disputed"].includes(attempt.status);
    let result=matches?"accepted":"ignored_unlinked";
    if(!matches&&attempt)result="rejected_mismatch";
    if(matches&&(isOlder||settled))result="stale";

    const inserted=await db.query(
      `INSERT INTO public.us_stripe_live_payment_receipts
        (stripe_event_id,booking_id,stripe_account_id,
         stripe_payment_intent_id,event_type,event_created,
         stripe_mode,signature_verified,body_sha256,result)
       VALUES($1,$2,$3,$4,$5,$6,'LIVE',true,$7,$8)
       ON CONFLICT(stripe_event_id) DO NOTHING
       RETURNING stripe_event_id`,
      [
        e.id,matches?bookingId:null,e.account,pi.id,e.type,e.created,
        createHash("sha256").update(rawBody).digest("hex"),result,
      ]
    );
    if(!inserted.rows.length) {
      return {status:200,body:{ok:true,result:"duplicate",payment_ready:false}};
    }
    if(result==="accepted") {
      const applied=await db.query(
        `UPDATE public.us_stripe_live_payment_intents
            SET stripe_payment_intent_id=$2,status=$3,
                stripe_event_created=$4,last_event_id=$5
          WHERE booking_id=$1
            AND stripe_account_id=$6
            AND reservation_token=$7
            AND (stripe_payment_intent_id IS NULL OR
                 stripe_payment_intent_id=$2)
          RETURNING booking_id`,
        [bookingId,pi.id,status,e.created,e.id,e.account,
         pi.metadata.totem_us_reservation]
      );
      if(applied.rows.length!==1){
        throw new Error("US_C11_SIGNED_PAYMENT_WRITE_CONFLICT");
      }
    }
    return {status:200,body:{
      ok:true,result,payment_ready:false,
      payment_status_updated:result==="accepted",
    }};
  });
}
