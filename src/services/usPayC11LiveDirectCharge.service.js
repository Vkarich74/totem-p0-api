/**
 * US-PAY-C11 / LIVE direct-charge PaymentIntent preparation.
 *
 * Only actual authenticated client-cabinet owner; exact immutable USD cents
 * and independently verified US Standard seller; NO browser-supplied amounts,
 * recipient IDs, payment mode, state, or Stripe customer parameters.
 *
 * Never mark a booking paid from browser or Stripe REST create/retrieve.
 * Stripe's signed LIVE payment webhook is the ONLY settlement authority.
 *
 * Flag remains OFF by default; no client payment is created until explicitly
 * released after production migration/backup and first US seller acceptance.
 */
import { randomUUID } from "node:crypto";
import { verifyClientCabinetAccess } from "./clientCabinetTokenAccess.js";
import {
  createLiveUsDirectChargeIntent,
  retrieveLiveUsDirectChargeIntent,
  publicLiveStripePaymentCredentials,
} from "./usPayC11LiveDirectCharge.stripe.js";

const ID = /^[1-9]\d*$/;
const NEW_INTENT_ALLOWED = new Set(["requires_payment_method","requires_action","requires_confirmation"]);
const RECONCILIATION_WINDOW_MS = 20*60*60*1000;

function validId(x) {
  const s=String(x??"");
  if(!ID.test(s))return null;
  const n=Number(s);
  return Number.isSafeInteger(n) ? n : null;
}
function reject(status,error){
  return {status,body:{ok:false,error}};
}
async function tx(pool,cb) {
  const db=await pool.connect();
  let started=false,errorOnRelease;
  try{
    await db.query("BEGIN");
    started=true;
    await db.query("SET LOCAL statement_timeout='5000ms'");
    await db.query("SET LOCAL lock_timeout='2000ms'");
    const r=await cb(db);
    if(r.status>=200 && r.status<300) {
      await db.query("COMMIT");
      started=false;
    }
    return r;
  }finally{
    if(started){
      try{await db.query("ROLLBACK");}
      catch(e){errorOnRelease=e;}
    }
    db.release(errorOnRelease||undefined);
  }
}

async function verifiedUsdBooking(db,clientId,bookingId) {
  const r=await db.query(
    `SELECT
       b.id,b.salon_id,b.master_id,b.service_id,b.status,b.currency_code,
       salon.enabled AS salon_enabled,salon.status AS salon_status,
       master.active AS master_active,
       CASE WHEN sb.owner_type='salon' THEN EXISTS(
         SELECT 1 FROM public.owner_salon own
          WHERE own.salon_id=b.salon_id
            AND own.owner_id=sb.created_by_user_id::text
            AND own.status='active'
       ) WHEN sb.owner_type='master' THEN
         (master.user_id=sb.created_by_user_id AND EXISTS(
           SELECT 1 FROM public.master_salon ms
            WHERE ms.salon_id=b.salon_id AND ms.master_id=b.master_id
              AND ms.status='active'
         )) ELSE false END AS current_seller_owner_authorized,
       m.id AS market_id,m.code AS market_code,m.default_currency,m.active AS market_active,
       snap.amount_minor::text AS service_base_minor,
       snap.currency_code AS price_currency,
       snap.market_id AS price_market,snap.service_price_version,
       tq.booking_id AS tax_booking_id,tq.market_id AS tax_market,
       tq.currency_code AS tax_currency,tq.payment_purpose AS tax_purpose,
       tq.collector_owner_type AS tax_owner_type,
       tq.collector_owner_id AS tax_owner_id,
       tq.collector_revision AS tax_collector_revision,
       tq.service_base_minor::text AS tax_service_base_minor,
       tq.service_tax_minor::text AS tax_minor,
       tq.charge_total_minor::text AS amount_minor,
       sms.id AS service_link_id,sms.salon_id AS service_link_salon,
       sms.master_id AS service_link_master,sms.service_pk AS service_link_service,
       sms.currency_code AS service_link_currency,
       col.market_id AS collector_market,col.collector_owner_type,
       col.collector_owner_id,col.verification_status AS collector_verification,
       col.verified_at AS collector_verified_at,col.revision AS collector_revision,
       col.selection_source,col.selected_by_user_id,
       sb.id AS seller_binding_id,sb.market_id AS seller_market,
       sb.owner_type AS seller_owner_type,sb.owner_id AS seller_owner_id,
       sb.stripe_account_id,sb.stripe_mode,sb.account_type,
       sb.verification_status AS seller_verification,sb.verified_at AS seller_verified_at,
       sb.last_checked_at AS seller_last_checked,
       sb.charges_enabled,sb.payouts_enabled,sb.details_submitted,
       sb.card_payments_status,sb.transfers_status
     FROM public.bookings b
     JOIN public.salons salon ON salon.id=b.salon_id
     JOIN public.masters master ON master.id=b.master_id
     JOIN public.tenant_market_settings tm ON tm.salon_id=b.salon_id
     JOIN public.markets m ON m.id=tm.market_id
     JOIN public.us_booking_price_snapshots snap ON snap.booking_id=b.id
     JOIN public.us_booking_service_tax_snapshots tq
       ON tq.booking_id=b.id AND tq.market_id=snap.market_id
     JOIN public.salon_master_services sms
       ON sms.id=snap.salon_master_service_id
     JOIN public.us_booking_payment_collectors col ON col.booking_id=b.id
     JOIN public.us_stripe_live_seller_bindings sb
       ON sb.market_id=col.market_id
      AND sb.owner_type=col.collector_owner_type
      AND sb.owner_id=col.collector_owner_id AND sb.stripe_mode='LIVE'
     WHERE b.id=$1 AND b.client_id=$2
     FOR UPDATE OF b`,
    [bookingId,clientId]
  );
  return r.rows[0]||null;
}

function eligible(row) {
  if(!row || row.market_code!=="US" ||
     row.salon_enabled!==true || row.salon_status!=="active" ||
     row.master_active!==true ||
     row.current_seller_owner_authorized!==true ||
     row.market_active!==true || row.default_currency!=="USD" ||
     row.currency_code!=="USD" || row.price_currency!=="USD" ||
     row.service_link_currency!=="USD" ||
     !["reserved","confirmed"].includes(row.status) ||
     String(row.market_id)!==String(row.price_market) ||
     String(row.market_id)!==String(row.tax_market) ||
     String(row.tax_booking_id)!==String(row.id) ||
     row.tax_currency!=="USD" || row.tax_purpose!=="beauty_service" ||
     !/^[1-9]\d*$/.test(String(row.service_base_minor||"")) ||
     String(row.tax_service_base_minor)!==String(row.service_base_minor) ||
     !/^\d+$/.test(String(row.tax_minor||"")) ||
     String(row.tax_owner_type)!==String(row.collector_owner_type) ||
     String(row.tax_owner_id)!==String(row.collector_owner_id) ||
     String(row.tax_collector_revision)!==String(row.collector_revision) ||
     String(row.market_id)!==String(row.collector_market) ||
     String(row.market_id)!==String(row.seller_market) ||
     String(row.salon_id)!==String(row.service_link_salon) ||
     String(row.master_id)!==String(row.service_link_master) ||
     String(row.service_id)!==String(row.service_link_service) ||
     String(row.collector_owner_type)!==String(row.seller_owner_type) ||
     String(row.collector_owner_id)!==String(row.seller_owner_id) ||
     (row.collector_owner_type==="salon" &&
      String(row.salon_id)!==String(row.collector_owner_id)) ||
     (row.collector_owner_type==="master" &&
      String(row.master_id)!==String(row.collector_owner_id)) ||
     row.collector_verification!=="verified" ||
     row.collector_verified_at==null ||
     row.seller_verification!=="verified" ||
     row.seller_verified_at==null ||
     row.stripe_mode!=="LIVE" || row.account_type!=="standard" ||
     row.charges_enabled!==true || row.payouts_enabled!==true ||
     row.details_submitted!==true ||
     row.card_payments_status!=="active" ||
     row.transfers_status!=="active" ||
     row.selection_source!=="owner_authorized" ||
     !validId(row.selected_by_user_id) ||
     !validId(row.collector_revision) ||
     !/^acct_[A-Za-z0-9]{8,}$/.test(String(row.stripe_account_id||"")) ||
     !/^[1-9]\d*$/.test(String(row.amount_minor||"")))return false;
  const age=Date.now()-new Date(row.seller_last_checked).getTime();
  if(!Number.isFinite(age)||age<0||age>3600000)return false;
  const cents=BigInt(row.amount_minor);
  const base=BigInt(row.service_base_minor);
  const tax=BigInt(row.tax_minor);
  return cents>=50n&&cents<=99999999n&&
    base>0n&&base<=cents&&tax===cents-base;
}

function sameReservation(attempt,booking) {
  return attempt &&
    String(attempt.market_id)===String(booking.market_id) &&
    String(attempt.seller_binding_id)===String(booking.seller_binding_id) &&
    String(attempt.stripe_account_id)===String(booking.stripe_account_id) &&
    String(attempt.amount_minor)===String(booking.amount_minor) &&
    attempt.currency_code==="USD" &&
    attempt.collector_owner_type===booking.collector_owner_type &&
    String(attempt.collector_owner_id)===String(booking.collector_owner_id) &&
    String(attempt.collector_revision)===String(booking.collector_revision);
}

function reservationResponse(row,attempt) {
  return {
    status:200,body:{ok:true,
      bookingId:Number(row.id),marketId:String(row.market_id),
      sellerBindingId:String(row.seller_binding_id),
      stripeAccountId:row.stripe_account_id,amountMinor:row.amount_minor,
      serviceBaseMinor:row.service_base_minor,
      serviceTaxMinor:row.tax_minor,
      amountSource:"us_booking_service_tax_snapshots",
      reservationToken:String(attempt.reservation_token),
      intentId:attempt.stripe_payment_intent_id||null,
      previousStatus:attempt.status,
      createdAt:new Date(attempt.created_at).toISOString(),
    },
  };
}

export async function prepareUsC11LiveDirectCharge(pool,{
  clientId,clientToken,bookingId,secretKey,stripePublishableKey,fetchImpl,
}={}) {
  const client=validId(clientId),booking=validId(bookingId);
  if(!client||!booking)return reject(400,"US_C11_CLIENT_OR_BOOKING_ID_INVALID");
  if(typeof clientToken!=="string"||clientToken.length<12 ||
     typeof secretKey!=="string"||!secretKey.startsWith("sk_live_") ||
     typeof stripePublishableKey!=="string" ||
     !stripePublishableKey.startsWith("pk_live_")) {
    return reject(503,"US_C11_LIVE_PAYMENTS_NOT_CONFIGURED");
  }

  const reserved=await tx(pool,async db=>{
    const access=await verifyClientCabinetAccess(db,client,clientToken);
    if(!access.ok)return reject(access.status,access.error);

    const row=await verifiedUsdBooking(db,client,booking);
    if(!row)return reject(404,"US_C11_LIVE_BOOKING_NOT_FOUND");
    if(!eligible(row))return reject(409,"US_C11_LIVE_BOOKING_NOT_PAYABLE");

    const old=await db.query(
      `SELECT * FROM public.us_stripe_live_payment_intents
        WHERE booking_id=$1 LIMIT 1 FOR UPDATE`,
      [booking]
    );
    let attempt=old.rows[0]||null;
    if(attempt) {
      if(!sameReservation(attempt,row)) {
        return reject(409,"US_C11_PAYMENT_RESERVATION_CONFLICT");
      }
      if(["succeeded","refunded","disputed"].includes(attempt.status)){
        return reject(409,"US_C11_PAYMENT_ALREADY_SETTLED");
      }
      if(["requires_review","canceled","failed","processing"].includes(attempt.status)){
        return reject(409,"US_C11_PAYMENT_MANUAL_RECONCILIATION_REQUIRED");
      }
      if(!attempt.stripe_payment_intent_id &&
         Date.now()-new Date(attempt.created_at).getTime()>RECONCILIATION_WINDOW_MS){
        return reject(409,"US_C11_PAYMENT_CREATION_RECONCILIATION_REQUIRED");
      }
    }else{
      const t=randomUUID();
      const inserted=await db.query(
        `INSERT INTO public.us_stripe_live_payment_intents
         (booking_id,market_id,seller_binding_id,collector_owner_type,
          collector_owner_id,collector_revision,stripe_account_id,
          amount_minor,reservation_token)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [booking,row.market_id,row.seller_binding_id,
          row.collector_owner_type,row.collector_owner_id,
          row.collector_revision,row.stripe_account_id,row.amount_minor,t]
      );
      attempt=inserted.rows[0];
    }
    return reservationResponse(row,attempt);
  });
  if(reserved.status!==200)return reserved;

  const {
    bookingId:booked,amountMinor,stripeAccountId,reservationToken,intentId,
  }=reserved.body;

  // Direct charge on the seller (Stripe-Account), not the TOTEM platform.
  // Every retry uses the exact SAME Stripe idempotency key (reservation).
  const intent=intentId ?
    await retrieveLiveUsDirectChargeIntent({
      stripeAccountId,stripePaymentIntentId:intentId,bookingId:booked,
      amountMinor,reservationToken,secretKey,fetchImpl,
    }):
    await createLiveUsDirectChargeIntent({
      stripeAccountId,bookingId:booked,amountMinor,reservationToken,
      secretKey,fetchImpl,
    });

  if(!NEW_INTENT_ALLOWED.has(intent.status)){
    // Never claim payment success based on an API response.
    return reject(409,"US_C11_PAYMENT_STATUS_REQUIRES_RECONCILIATION");
  }

  const committed=await tx(pool,async db=>{
    const access=await verifyClientCabinetAccess(db,client,clientToken);
    if(!access.ok)return reject(access.status,access.error);
    const locked=await db.query(
      `SELECT * FROM public.us_stripe_live_payment_intents
        WHERE booking_id=$1 LIMIT 1 FOR UPDATE`,
      [booked]
    );
    const attempt=locked.rows[0];
    if(!attempt || String(attempt.reservation_token)!==reservationToken ||
       attempt.stripe_account_id!==stripeAccountId ||
       String(attempt.amount_minor)!==String(amountMinor) ||
       (attempt.stripe_payment_intent_id&&
        attempt.stripe_payment_intent_id!==intent.id)){
      return reject(409,"US_C11_LIVE_PAYMENT_RESERVATION_CHANGED");
    }
    if(["succeeded","refunded","disputed","canceled","requires_review","failed"]
      .includes(attempt.status)){
      return reject(409,"US_C11_PAYMENT_NOT_CONFIRMABLE");
    }
    if(attempt.status==="processing"){
      return reject(409,"US_C11_PAYMENT_PROCESSING");
    }
    await db.query(
      `UPDATE public.us_stripe_live_payment_intents
          SET stripe_payment_intent_id=$2,status=$3
        WHERE booking_id=$1 AND
              (stripe_payment_intent_id IS NULL OR
               stripe_payment_intent_id=$2)`,
      [booked,intent.id,intent.status]
    );
    return {status:200,body:{ok:true}};
  });
  if(committed.status!==200)return committed;

  const credentials=publicLiveStripePaymentCredentials({
    stripePublishableKey,stripeAccountId,intent,
  });
  return {
    status:200,body:{
      ok:true,contract_version:"US-PAY-C11-live-direct-v1",
      market_code:"US",currency_code:"USD",stripe_mode:"LIVE",
      booking_id:booked,amount_minor:amountMinor,
      amount_source:"us_booking_service_tax_snapshots",
      ...credentials,
    },
  };
}
