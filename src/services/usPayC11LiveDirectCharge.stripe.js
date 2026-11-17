// US-PAY-C11: LIVE Stripe DIRECT charges on the selected Standard seller.
// Caller is trusted only after server-side booking/merchant authorization.
// Financial execution remains OFF unless an independently approved flag is
// set; no real network calls should occur in CI, tests inject fetchImpl.
// Never accept price, seller ID, currency or idempotency key from browser.
import {
  verifyUsConnectPlatform, getUsStandardSeller, liveSellerReadiness,
} from "./usPayC11LiveStripeApi.js";

const ACCOUNT = /^acct_[A-Za-z0-9]{8,}$/;
const PAYMENT_INTENT = /^pi_[A-Za-z0-9_]{8,}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIVE_KEY = /^sk_live_[A-Za-z0-9_]+$/;
const LIVE_PUBLISHABLE = /^pk_live_[A-Za-z0-9_]+$/;
const ENDPOINT = "https://api.stripe.com";
const ALLOWED = new Set([
  "requires_payment_method", "requires_confirmation",
  "requires_action", "processing", "succeeded", "canceled",
]);

function requiredSecret(secretKey) {
  if (!LIVE_KEY.test(String(secretKey || ""))) {
    throw new Error("US_C11_LIVE_STRIPE_SECRET_UNCONFIGURED");
  }
}
function positiveId(x) {
  const str = String(x ?? "");
  if (!/^[1-9]\d*$/.test(str)) return null;
  const n = Number(str);
  return Number.isSafeInteger(n) ? n : null;
}
function allowedUsdCents(value) {
  if (!/^[1-9]\d*$/.test(String(value ?? ""))) return false;
  const n = BigInt(String(value));
  return n >= 50n && n <= 99999999n;
}

async function stripeCall({
  secretKey,stripeAccountId,method,path,fields,idempotencyKey,
  fetchImpl=globalThis.fetch,
}={}) {
  requiredSecret(secretKey);
  if (!ACCOUNT.test(String(stripeAccountId||"")) ||
      !/^\/v1\/payment_intents(?:\/pi_[A-Za-z0-9_]{8,})?$/.test(path) ||
      !["GET","POST"].includes(method) ||
      typeof fetchImpl!=="function") {
    throw new Error("US_C11_STRIPE_DIRECT_REQUEST_INVALID");
  }
  const headers={
    Authorization:"Bearer "+secretKey,
    "Stripe-Account":stripeAccountId,
    Accept:"application/json",
  };
  if(method==="POST"){
    if(!fields || typeof idempotencyKey!=="string" ||
       !/^totem-us-c11-live-[0-9a-f-]{36}$/.test(idempotencyKey)){
      throw new Error("US_C11_IDEMPOTENCY_REQUIRED");
    }
    headers["Content-Type"]="application/x-www-form-urlencoded";
    headers["Idempotency-Key"]=idempotencyKey;
  }
  const response=await fetchImpl(ENDPOINT+path,{
    method,headers,redirect:"error",
    ...(method==="POST"?{body:new URLSearchParams(fields).toString()}:{}),
    signal:AbortSignal.timeout(12000),
  });
  if(!response.ok) {
    const error=new Error("US_C11_STRIPE_DIRECT_REQUEST_FAILED");
    error.httpStatus=response.status;
    // NEVER log or return Stripe API response: it may hold client details.
    throw error;
  }
  return response.json();
}

function requireCorrectIntent(intent,{
  stripePaymentIntentId,amountMinor,bookingId,reservationToken,
}={}) {
  if (intent?.object!=="payment_intent" ||
      !PAYMENT_INTENT.test(String(intent.id||"")) ||
      (stripePaymentIntentId && intent.id!==stripePaymentIntentId) ||
      intent.currency!=="usd" ||
      String(intent.amount)!==String(amountMinor) ||
      intent.livemode!==true ||
      intent.capture_method!=="automatic" ||
      !ALLOWED.has(intent.status) ||
      String(intent.metadata?.totem_us_booking_id||"")!==String(bookingId) ||
      intent.metadata?.totem_us_reservation!==String(reservationToken) ||
      !/^pi_[A-Za-z0-9_]{8,}_secret_[A-Za-z0-9_]+$/.test(
        String(intent.client_secret||""))) {
    throw new Error("US_C11_LIVE_INTENT_ACCOUNT_AMOUNT_OR_ID_MISMATCH");
  }
  return intent;
}

export async function assertLiveUsDirectChargeSeller({
  stripeAccountId,secretKey,fetchImpl,
}={}) {
  requiredSecret(secretKey);
  if(!ACCOUNT.test(String(stripeAccountId||""))) {
    throw new Error("US_C11_LIVE_SELLER_ACCOUNT_INVALID");
  }
  const account=await getUsStandardSeller({
    stripeAccountId,secretKey,fetchImpl,
  });
  const current=liveSellerReadiness(account,stripeAccountId);
  if(!current.ready) throw new Error("US_C11_LIVE_SELLER_NOT_READY");
  return true;
}

export async function createLiveUsDirectChargeIntent({
  stripeAccountId,bookingId,amountMinor,reservationToken,
  secretKey,fetchImpl,
}={}) {
  const booking=positiveId(bookingId);
  if(!booking || !allowedUsdCents(amountMinor) ||
     !UUID.test(String(reservationToken||""))) {
    throw new Error("US_C11_DIRECT_CHARGE_INPUT_INVALID");
  }
  await assertLiveUsDirectChargeSeller({
    stripeAccountId,secretKey,fetchImpl,
  });
  const result=await stripeCall({
    secretKey,stripeAccountId,fetchImpl,method:"POST",
    path:"/v1/payment_intents",
    idempotencyKey:"totem-us-c11-live-"+reservationToken,
    fields:{
      amount:String(amountMinor),
      currency:"usd",
      "automatic_payment_methods[enabled]":"true",
      capture_method:"automatic",
      confirm:"false",
      "metadata[totem_market]":"US",
      "metadata[totem_us_booking_id]":String(booking),
      "metadata[totem_us_reservation]":reservationToken,
    },
  });
  return requireCorrectIntent(result,{
    amountMinor,bookingId:booking,reservationToken,
  });
}

export async function retrieveLiveUsDirectChargeIntent({
  stripeAccountId,stripePaymentIntentId,bookingId,amountMinor,
  reservationToken,secretKey,fetchImpl,
}={}) {
  if(!PAYMENT_INTENT.test(String(stripePaymentIntentId||"")) ||
     !positiveId(bookingId) || !allowedUsdCents(amountMinor) ||
     !UUID.test(String(reservationToken||""))) {
    throw new Error("US_C11_DIRECT_CHARGE_READ_INVALID");
  }
  // Also verifies that the LIVE API secret belongs to the pinned platform.
  await verifyUsConnectPlatform({secretKey,fetchImpl});
  const result=await stripeCall({
    secretKey,stripeAccountId,fetchImpl,method:"GET",
    path:"/v1/payment_intents/"+stripePaymentIntentId,
  });
  return requireCorrectIntent(result,{
    stripePaymentIntentId,bookingId,amountMinor,reservationToken,
  });
}

export function publicLiveStripePaymentCredentials({
  stripePublishableKey,stripeAccountId,intent,
}={}) {
  if(!LIVE_PUBLISHABLE.test(String(stripePublishableKey||"")) ||
     !ACCOUNT.test(String(stripeAccountId||"")) ||
     !intent?.client_secret) {
    throw new Error("US_C11_PAYMENT_CLIENT_CREDENTIALS_NOT_READY");
  }
  return {
    stripe_publishable_key:stripePublishableKey,
    stripe_account_id:stripeAccountId,
    payment_intent_client_secret:intent.client_secret,
    payment_status:"awaiting_confirmation",
    payment_ready:false,
    // Must be used with Stripe.js connected-account scoped Payment Element.
    // Browser MUST NEVER treat redirect as proof of payment.
  };
}
