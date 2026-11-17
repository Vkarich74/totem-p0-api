// US-PAY-C11 signed STRIPE TEST webhook. Never accepts livemode events.
// Exact raw-body HMAC/timestamp verification. Writes only new US test sidecars.
// Does not create charges, payouts, transfers or modify legacy KG/KZ ledgers.
import { createHmac, createHash, timingSafeEqual } from "node:crypto";

const EVENT_ID = /^evt_[a-zA-Z0-9_]{8,}$/;
const PAYMENT_INTENT = /^pi_[a-zA-Z0-9_]{8,}$/;
const STRIPE_ACCOUNT = /^acct_[a-zA-Z0-9]{8,}$/;
const MAX_RAW_BYTES = 131072;
const SIGNATURE_TOLERANCE_SECONDS = 300;

export function verifyStripeRawSignature(
  rawBody, stripeSignature, webhookSecret, nowSeconds = Math.floor(Date.now() / 1000)
) {
  if (!Buffer.isBuffer(rawBody) || rawBody.length < 2 ||
      rawBody.length > MAX_RAW_BYTES ||
      typeof webhookSecret !== "string" ||
      !/^whsec_[a-zA-Z0-9_+-]{12,}$/.test(webhookSecret) ||
      typeof stripeSignature !== "string" || stripeSignature.length > 4096) {
    return false;
  }

  const parts = stripeSignature.split(",").map(part => part.trim());
  const timestampParts = parts.filter(part => /^t=\d+$/.test(part));
  const candidates = parts.filter(part => /^v1=[a-fA-F0-9]{64}$/.test(part));
  if (timestampParts.length !== 1 || !candidates.length) return false;

  const timestamp = Number(timestampParts[0].slice(2));
  if (!Number.isSafeInteger(timestamp) ||
      !Number.isSafeInteger(nowSeconds) ||
      Math.abs(nowSeconds - timestamp) > SIGNATURE_TOLERANCE_SECONDS) {
    return false;
  }

  const digest = createHmac("sha256", webhookSecret)
    .update(String(timestamp))
    .update(".")
    .update(rawBody)
    .digest();
  return candidates.some(candidate => {
    const provided = Buffer.from(candidate.slice(3), "hex");
    return provided.length === digest.length && timingSafeEqual(provided, digest);
  });
}

function acceptedStatus(eventType, intent) {
  if (eventType === "payment_intent.succeeded" &&
      intent.status === "succeeded" &&
      Number.isSafeInteger(intent.amount_received) &&
      intent.amount_received === intent.amount) return "paid";

  if (eventType === "payment_intent.processing" &&
      intent.status === "processing") return "awaiting_payment";

  if (eventType === "payment_intent.payment_failed" &&
      (intent.status === "requires_payment_method" ||
       intent.status === "canceled")) return "requires_review";

  if (eventType === "payment_intent.canceled" &&
      intent.status === "canceled") return "requires_review";

  return null;
}

/**
 * Invoked only AFTER verifying raw header signature.
 * Pending checkout/PaymentIntent association cannot be created by this route.
 * Unknown signed events are archived as ignored and cannot assert "paid".
 */
export async function acceptSignedStripeTestWebhook({
  pool, rawBody, stripeSignature, webhookSecret, nowSeconds,
} = {}) {
  if (!verifyStripeRawSignature(rawBody, stripeSignature, webhookSecret, nowSeconds)) {
    return { status: 400, body: { ok: false, error: "US_STRIPE_SIGNATURE_INVALID" } };
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return { status: 400, body: { ok: false, error: "US_STRIPE_EVENT_MALFORMED" } };
  }
  if (!event || event.object !== "event" || event.livemode !== false ||
      !EVENT_ID.test(String(event.id || "")) ||
      !STRIPE_ACCOUNT.test(String(event.account || "")) ||
      !Number.isSafeInteger(event.created) || event.created <= 0 ||
      typeof event.type !== "string" || event.type.length > 128 ||
      event.data?.object?.object !== "payment_intent" ||
      !PAYMENT_INTENT.test(String(event.data.object.id || "")) ||
      !Number.isSafeInteger(event.data.object.amount) ||
      event.data.object.amount <= 0 ||
      event.data.object.amount > 99999999 ||
      event.data.object.currency !== "usd") {
    return { status: 400, body: { ok: false, error: "US_STRIPE_TEST_EVENT_INVALID" } };
  }

  const intent = event.data.object;
  const newStatus = acceptedStatus(event.type, intent);
  const db = await pool.connect();
  let open = false;
  let releaseError;
  try {
    await db.query("BEGIN");
    open = true;
    await db.query("SET LOCAL statement_timeout = '4000ms'");
    await db.query("SET LOCAL lock_timeout = '2000ms'");

    // Lock the only previously server-provisioned attempt. No synthetic
    // idempotency key, metadata or browser booking ID is trusted.
    const r = await db.query(
      `SELECT a.id, a.booking_id, a.market_id, a.amount_minor,
              a.stripe_mode, a.currency_code, a.payment_status,
              a.status_event_created, a.last_event_id,
              a.stripe_connected_account_id, a.merchant_binding_id,
              b.owner_type AS binding_owner_type, b.owner_id AS binding_owner_id,
              b.market_id AS binding_market_id,
              b.stripe_connected_account_id AS binding_account_id,
              b.stripe_mode AS binding_stripe_mode,
              b.verification_status AS binding_verification_status,
              b.last_checked_at AS binding_last_checked_at,
              col.collector_owner_type, col.collector_owner_id,
              col.verification_status AS collector_verification_status,
              s.amount_minor AS snapshot_amount_minor,
              m.code AS market_code
         FROM public.us_stripe_payment_attempts a
         JOIN public.us_stripe_merchant_bindings b ON b.id = a.merchant_binding_id
         JOIN public.us_booking_payment_collectors col ON col.booking_id = a.booking_id
         JOIN public.us_booking_price_snapshots s ON s.booking_id = a.booking_id
         JOIN public.markets m ON m.id = a.market_id
        WHERE a.stripe_payment_intent_id = $1
        LIMIT 1 FOR UPDATE OF a`,
      [intent.id]
    );
    const attempt = r.rows[0] || null;

    let outcome = "ignored_unlinked";
    if (attempt) {
      const fresh = attempt.binding_last_checked_at instanceof Date &&
        Date.now() - attempt.binding_last_checked_at.getTime() >= 0 &&
        Date.now() - attempt.binding_last_checked_at.getTime() < 86400000;

      const bound = attempt.market_code === "US" &&
        String(attempt.market_id) === String(attempt.binding_market_id) &&
        attempt.stripe_mode === "TEST" && attempt.binding_stripe_mode === "TEST" &&
        attempt.binding_verification_status === "verified" && fresh &&
        attempt.collector_verification_status === "verified" &&
        attempt.collector_owner_type === attempt.binding_owner_type &&
        Number(attempt.collector_owner_id) === Number(attempt.binding_owner_id) &&
        attempt.stripe_connected_account_id === attempt.binding_account_id &&
        event.account === attempt.binding_account_id;

      const correctAmount = String(attempt.amount_minor) === String(intent.amount) &&
        String(attempt.snapshot_amount_minor) === String(intent.amount) &&
        attempt.currency_code === "USD";

      if (!bound) outcome = "rejected_binding";
      else if (!correctAmount) outcome = "rejected_data";
      else if (!newStatus) outcome = "ignored_event";
      else if (attempt.payment_status === "paid" && newStatus !== "paid") {
        outcome = "ignored_event"; // never regress a settled verified payment
      } else if (attempt.status_event_created != null &&
                 Number(attempt.status_event_created) > event.created) {
        outcome = "ignored_event"; // signed events may arrive out of order
      } else {
        outcome = "accepted";
      }
    }

    const digest = createHash("sha256").update(rawBody).digest("hex");
    const inserted = await db.query(
      `INSERT INTO public.us_stripe_event_ledger (
          stripe_event_id, stripe_mode, stripe_connected_account_id,
          stripe_payment_intent_id, event_type, event_created,
          payload_sha256, signature_verified, processing_result
        ) VALUES ($1,'TEST',$2,$3,$4,$5,$6,true,$7)
        ON CONFLICT (stripe_event_id) DO NOTHING
        RETURNING stripe_event_id`,
      [event.id, event.account, intent.id, event.type, event.created, digest, outcome]
    );

    if (!inserted.rows.length) {
      await db.query("COMMIT");
      open = false;
      return { status: 200, body: { ok: true, result: "duplicate", payment_ready: false } };
    }

    if (outcome === "accepted") {
      await db.query(
        `UPDATE public.us_stripe_payment_attempts
            SET payment_status=$2, status_event_created=$3, last_event_id=$4
          WHERE id=$1`,
        [attempt.id, newStatus, event.created, event.id]
      );
    }
    await db.query("COMMIT");
    open = false;
    return { status: 200, body: { ok: true, result: outcome, payment_ready: false } };
  } catch (error) {
    if (open) {
      try { await db.query("ROLLBACK"); open = false; }
      catch (rollbackError) { releaseError = rollbackError; }
    }
    throw error;
  } finally {
    if (open) {
      try { await db.query("ROLLBACK"); } catch (error) { releaseError = error; }
    }
    db.release(releaseError || undefined);
  }
}
