// US-PAY-C11 Connect LIVE account-lifecycle webhook.
// Signed Stripe Connect notifications only; NO PaymentIntent, charge,
// payout, transfer, refund, ledger settlement, or KG/KZ mutation.
// At most recheck an EXISTING owner-consented US merchant binding and
// update the verified recipient flag on an already selected US booking.
import { createHash } from "node:crypto";
import { verifyStripeRawSignature } from "./usStripeTestWebhook.service.js";
import {
  getUsStandardSeller,
  isLiveUsStandardAccount,
  liveSellerReadiness,
} from "./usPayC11LiveStripeApi.js";

const EVENT = /^evt_[a-zA-Z0-9_]{8,}$/;
const ACCOUNT = /^acct_[a-zA-Z0-9]{8,}$/;
const EVENTS = new Set([
  "account.updated",
  "account.application.deauthorized",
]);
const MAX_BODY = 128 * 1024;

function fail(status, code) {
  return { status, body: { ok: false, error: code } };
}

async function withTransaction(pool, fn) {
  const db = await pool.connect();
  let started = false;
  let releaseError = null;
  try {
    await db.query("BEGIN");
    started = true;
    await db.query("SET LOCAL statement_timeout = '4000ms'");
    await db.query("SET LOCAL lock_timeout = '2000ms'");
    const outcome = await fn(db);
    await db.query("COMMIT");
    started = false;
    return outcome;
  } finally {
    if (started) {
      try { await db.query("ROLLBACK"); }
      catch (error) { releaseError = error; }
    }
    db.release(releaseError || undefined);
  }
}

function validEvent(rawBody, signature, webhookSecret) {
  if (!Buffer.isBuffer(rawBody) || rawBody.length < 2 ||
      rawBody.length > MAX_BODY ||
      !verifyStripeRawSignature(rawBody, signature, webhookSecret)) {
    return { error: "US_LIVE_CONNECT_SIGNATURE_INVALID" };
  }
  let event;
  try { event = JSON.parse(rawBody.toString("utf8")); }
  catch { return { error: "US_LIVE_CONNECT_INVALID_JSON" }; }

  if (event?.object !== "event" || event.livemode !== true ||
      !EVENT.test(String(event.id || "")) ||
      !ACCOUNT.test(String(event.account || "")) ||
      !Number.isSafeInteger(event.created) || event.created <= 0 ||
      !EVENTS.has(event.type)) {
    return { error: "US_LIVE_CONNECT_EVENT_NOT_ACCEPTED" };
  }
  // "account.updated" carries an Account object. Verify its subject exactly
  // equals the connected account whose webhook Stripe signed.
  if (event.type === "account.updated" &&
      (event.data?.object?.object !== "account" ||
       event.data?.object?.id !== event.account)) {
    return { error: "US_LIVE_CONNECT_EVENT_ACCOUNT_MISMATCH" };
  }
  return { event };
}

async function findBinding(pool, accountId) {
  const r = await pool.query(
    `SELECT b.id, b.owner_type, b.owner_id, b.market_id,
            b.stripe_account_id, b.verification_status
       FROM public.us_stripe_live_seller_bindings b
       JOIN public.markets m ON m.id = b.market_id
      WHERE b.stripe_account_id=$1 AND b.stripe_mode='LIVE'
        AND b.account_type='standard'
        AND m.code='US' AND m.default_currency='USD' AND m.active IS TRUE
      LIMIT 1`,
    [accountId]
  );
  return r.rows[0] || null;
}

async function applyBindingState(db, binding, accountId, readiness, revoke) {
  let next;
  if (revoke) {
    next = {
      status:"revoked", charges:false, payouts:false, details:false,
      card:"inactive", transfers:"inactive", verifiedAt:null,
    };
  } else {
    next = {
      status:readiness.state,
      charges:readiness.charges_enabled===true,
      payouts:readiness.payouts_enabled===true,
      details:readiness.details_submitted===true,
      card:readiness.card_payments_status||"unknown",
      transfers:readiness.transfers_status||"unknown",
      verifiedAt:readiness.ready ? "now" : null,
    };
  }

  const updated = await db.query(
    `UPDATE public.us_stripe_live_seller_bindings
        SET verification_status=$2,charges_enabled=$3,payouts_enabled=$4,
            details_submitted=$5,card_payments_status=$6,transfers_status=$7,
            verified_at=CASE WHEN $2='verified' THEN now() ELSE NULL END,
            last_checked_at=now()
      WHERE id=$1 AND stripe_account_id=$8 AND stripe_mode='LIVE'
        AND verification_status<>'revoked'
      RETURNING id,verification_status`,
    [
      binding.id,next.status,next.charges,next.payouts,next.details,
      next.card,next.transfers,accountId,
    ]
  );
  if (updated.rows.length!==1) return "ignored_owner_changed";

  if (next.status==="verified") {
    await db.query(
      `UPDATE public.us_booking_payment_collectors c
          SET verification_status='verified',verified_at=now()
         FROM public.bookings bk
        WHERE c.booking_id=bk.id AND bk.status IN ('reserved','confirmed')
          AND c.market_id=$1
          AND c.collector_owner_type=$2 AND c.collector_owner_id=$3
          AND c.selection_source='owner_authorized'
          AND c.selected_by_user_id IS NOT NULL
          AND c.verification_status='pending'
          AND EXISTS (
            SELECT 1 FROM public.us_booking_price_snapshots s
             WHERE s.booking_id=c.booking_id AND s.market_id=$1
          )`,
      [binding.market_id,binding.owner_type,binding.owner_id]
    );
  } else {
    await db.query(
      `UPDATE public.us_booking_payment_collectors
          SET verification_status='pending',verified_at=NULL
        WHERE market_id=$1 AND collector_owner_type=$2
          AND collector_owner_id=$3 AND verification_status='verified'`,
      [binding.market_id,binding.owner_type,binding.owner_id]
    );
  }

  if (binding.verification_status !== next.status) {
    const evt = next.status==="verified" ? "stripe_verified"
      : next.status==="revoked" ? "stripe_revoked" : "stripe_restricted";
    await db.query(
      `INSERT INTO public.us_stripe_live_seller_events
         (binding_id,actor_user_id,event,stripe_mode)
        VALUES ($1,NULL,$2,'LIVE')`,
      [binding.id,evt]
    );
  }
  return next.status;
}

export async function acceptSignedUsLiveConnectWebhook({
  pool,rawBody,stripeSignature,webhookSecret,liveSecretKey,fetchImpl,
}={}) {
  const parsed = validEvent(rawBody,stripeSignature,webhookSecret);
  if(parsed.error) return fail(400,parsed.error);

  const e = parsed.event;
  const previous = await pool.query(
    `SELECT 1 FROM public.us_stripe_live_connect_event_receipts
      WHERE stripe_event_id=$1 LIMIT 1`,
    [e.id]
  );
  if(previous.rows.length) {
    return {status:200,body:{ok:true,result:"duplicate",payment_ready:false}};
  }

  const binding = await findBinding(pool,e.account);
  let readiness=null;
  if (binding && binding.verification_status!=="revoked" &&
      e.type==="account.updated") {
    // Stripe's signed event is only a notification. Read CURRENT seller
    // capabilities directly from the platform-owned LIVE Stripe API.
    // Never trust capabilities embedded in a webhook payload.
    const current = await getUsStandardSeller({
      secretKey:liveSecretKey,stripeAccountId:e.account,fetchImpl,
    });
    readiness = isLiveUsStandardAccount(current,e.account)
      ? liveSellerReadiness(current,e.account)
      : {ready:false,state:"restricted",
        charges_enabled:false,payouts_enabled:false,details_submitted:false,
        card_payments_status:"inactive",transfers_status:"inactive"};
  }

  return withTransaction(pool,async db=>{
    let latest=null;
    if(binding) {
      const q=await db.query(
        `SELECT id,owner_type,owner_id,market_id,stripe_account_id,
                verification_status
           FROM public.us_stripe_live_seller_bindings
          WHERE id=$1 AND stripe_account_id=$2 AND stripe_mode='LIVE'
          LIMIT 1 FOR UPDATE`,
        [binding.id,e.account]
      );
      latest=q.rows[0]||null;
    }
    let result="ignored_unlinked";
    if(latest) {
      if(latest.verification_status==="revoked") {
        result="ignored_already_revoked";
      } else {
        result = await applyBindingState(db,latest,e.account,readiness,
          e.type==="account.application.deauthorized");
      }
    }

    const inserted=await db.query(
      `INSERT INTO public.us_stripe_live_connect_event_receipts
         (stripe_event_id,binding_id,stripe_account_id,event_type,
          event_created,stripe_mode,signature_verified,payload_sha256,
          processing_result)
         VALUES ($1,$2,$3,$4,$5,'LIVE',true,$6,$7)
         ON CONFLICT(stripe_event_id) DO NOTHING
         RETURNING stripe_event_id`,
      [e.id,latest?.id||null,e.account,e.type,e.created,
        createHash("sha256").update(rawBody).digest("hex"),result]
    );
    if(!inserted.rows.length) {
      // In case of a race, two webhook deliveries must not mutate twice.
      // A duplicate's mutation in THIS TX rolls back before replying.
      throw new Error("US_LIVE_CONNECT_EVENT_RACE");
    }
    return {status:200,body:{ok:true,result,payment_ready:false}};
  });
}
