// US-PAY-C11-API: booking-owned, US-only financial read model.
// All identifiers and money sources are server-side, scoped to ONE booking.
// Never infer USD cents from legacy bookings.price_snapshot or service.price.
// Never infer Stripe payment success from booking status or browser redirect.
import { buildUsPayC11ReadModel } from "./usPayC11ReadModel.js";

function validId(value) {
  const text = String(value ?? "");
  if (!/^[1-9]\d*$/.test(text)) return null;
  const id = Number(text);
  return Number.isSafeInteger(id) ? id : null;
}

function sameId(left, right) {
  return validId(left) !== null && validId(left) === validId(right);
}

function priceSnapshotFromRow(row) {
  if (!sameId(row.us_price_booking_id, row.id) ||
      !sameId(row.us_price_market_id, row.market_id) ||
      !sameId(row.us_price_link_id, row.price_service_link_id) ||
      !sameId(row.price_link_salon_id, row.salon_id) ||
      !sameId(row.price_link_master_id, row.master_id) ||
      !sameId(row.price_link_service_pk, row.service_id) ||
      !validId(row.us_price_version) ||
      row.us_price_currency !== "USD" ||
      row.price_link_currency !== "USD") {
    return null;
  }
  return {
    booking_id: row.us_price_booking_id,
    market_code: "US",
    currency: "USD",
    amount_minor: row.us_amount_minor,
    immutable_verified: true,
  };
}

// Freeze the original service price separately from the tax-inclusive gross.
// Do not trust a tax row if its owner, revision, market or arithmetic drift.
function validatedTaxQuoteFromRow(row,price) {
  if(!price ||
     !sameId(row.us_tax_booking_id,row.id) ||
     !sameId(row.us_tax_market_id,row.market_id) ||
     row.us_tax_purpose!=="beauty_service" ||
     row.us_tax_currency!=="USD" ||
     row.us_tax_owner_type!==row.collector_owner_type ||
     !sameId(row.us_tax_owner_id,row.collector_owner_id) ||
     !sameId(row.us_tax_collector_revision,row.collector_revision) ||
     String(row.us_tax_base_minor)!==String(price.amount_minor) ||
     !Number.isInteger(row.us_tax_rate_bps) ||
     row.us_tax_rate_bps<0 || row.us_tax_rate_bps>10000 ||
     !/^\d+$/.test(String(row.us_tax_minor??"")) ||
     !/^[1-9]\d*$/.test(String(row.us_tax_total_minor??""))) return null;
  const base=BigInt(price.amount_minor);
  const tax=BigInt(row.us_tax_minor);
  const total=BigInt(row.us_tax_total_minor);
  if(total>99999999n || base<1n || base>99999999n ||
     tax!==(base*BigInt(row.us_tax_rate_bps)+5000n)/10000n ||
     total!==base+tax) return null;
  return {
    rate_bps:row.us_tax_rate_bps,
    service_tax_minor:tax.toString(),
    charge_total_minor:total.toString(),
  };
}

function testedMerchantBindingFromRow(row, allowTestStripeMode) {
  if (!allowTestStripeMode || row.us_binding_id == null ||
      row.us_binding_status !== "verified" ||
      row.us_binding_mode !== "TEST" ||
      row.us_binding_country !== "US" ||
      row.us_binding_card_payments !== "active" ||
      row.us_binding_charges_enabled !== true ||
      row.us_binding_payouts_enabled !== true ||
      row.us_binding_details_submitted !== true ||
      row.us_binding_verified_at == null ||
      row.us_binding_owner_type !== row.collector_owner_type ||
      !sameId(row.us_binding_owner_id, row.collector_owner_id) ||
      !sameId(row.us_binding_market_id, row.market_id)) {
    return false;
  }

  const checked = new Date(row.us_binding_last_checked_at).getTime();
  const age = Date.now() - checked;
  return Number.isFinite(checked) && age >= 0 && age < 86400000;
}

function liveSellerBindingFromRow(row) {
  if (!row.us_live_binding_id ||
      row.us_live_binding_status !== "verified" ||
      row.us_live_binding_mode !== "LIVE" ||
      row.us_live_binding_type !== "standard" ||
      row.us_live_binding_card_payments !== "active" ||
      row.us_live_binding_transfers !== "active" ||
      row.us_live_binding_charges !== true ||
      row.us_live_binding_payouts !== true ||
      row.us_live_binding_details !== true ||
      row.us_live_binding_verified_at == null ||
      row.us_live_binding_owner_type !== row.collector_owner_type ||
      !sameId(row.us_live_binding_owner_id, row.collector_owner_id) ||
      !sameId(row.us_live_binding_market_id, row.market_id)) return false;
  const checked = new Date(row.us_live_binding_last_checked_at).getTime();
  const age = Date.now() - checked;
  return Number.isFinite(checked) && age >= 0 && age < 3600000;
}

function selectedCollectorFromRow(row, allowTestStripeMode) {
  // A real LIVE seller binding always takes precedence over synthetic TEST.
  // A restricted LIVE seller must NEVER be re-promoted via old TEST fixtures.
  if (row.us_live_binding_id) {
    if (!liveSellerBindingFromRow(row)) return null;
  } else if (!testedMerchantBindingFromRow(row, allowTestStripeMode)) {
    return null;
  }
  if (!sameId(row.collector_booking_id, row.id) ||
      !sameId(row.collector_market_id, row.market_id) ||
      row.collector_verification_status !== "verified" ||
      row.collector_verified_at == null ||
      row.collector_selection_source !== "owner_authorized" ||
      !validId(row.collector_selected_by_user_id)) {
    return null;
  }

  const type = row.collector_owner_type;
  const collectorId = row.collector_owner_id;
  const displayName =
    type === "salon" && sameId(collectorId, row.salon_id)
      ? row.salon_name
      : type === "master" && sameId(collectorId, row.master_id)
        ? row.master_name
        : null;

  if (typeof displayName !== "string" || !displayName.trim()) return null;
  return {
    booking_id: row.collector_booking_id,
    market_code: "US",
    currency_code: "USD",
    owner_type: type,
    owner_id: collectorId,
    display_name: displayName,
    verified: true,
    conflicted: false,
  };
}

function signedTestPaymentFromRow(row, allowTestStripeMode) {
  if (row.us_live_binding_id || !testedMerchantBindingFromRow(row, allowTestStripeMode) ||
      !sameId(row.us_attempt_booking_id, row.id) ||
      !sameId(row.us_attempt_market_id, row.market_id) ||
      !sameId(row.us_attempt_binding_id, row.us_binding_id) ||
      row.us_attempt_account_id !== row.us_binding_account_id ||
      row.us_attempt_mode !== "TEST" ||
      row.us_attempt_currency !== "USD" ||
      String(row.us_attempt_amount_minor) !== String(row.us_amount_minor) ||
      row.us_event_id !== row.us_attempt_last_event_id ||
      row.us_event_account_id !== row.us_binding_account_id ||
      row.us_event_payment_intent_id !== row.us_attempt_payment_intent_id ||
      row.us_event_mode !== "TEST" ||
      row.us_event_signature_verified !== true ||
      row.us_event_result !== "accepted" ||
      String(row.us_event_created) !== String(row.us_attempt_event_created)) {
    return null;
  }
  const expectedType = {
    paid: "payment_intent.succeeded",
    awaiting_payment: "payment_intent.processing",
    requires_review: null,
  };
  const status = row.us_attempt_payment_status;
  if (!Object.hasOwn(expectedType, status)) return null;
  if (status === "paid" && row.us_event_type !== expectedType.paid) return null;
  if (status === "awaiting_payment" &&
      row.us_event_type !== expectedType.awaiting_payment) return null;
  if (status === "requires_review" &&
      !["payment_intent.payment_failed","payment_intent.canceled"].includes(row.us_event_type)) return null;
  return {
    booking_id: row.id,
    market_code: "US",
    currency_code: "USD",
    service_payment_status: status,
    verified_projection: true,
    merchant_binding_verified: true,
    mode: "TEST",
  };
}

function signedLivePaymentFromRow(row) {
  // A real paid status comes only from signed Stripe LIVE event evidence.
  // The payment remains paid even if the seller later loses KYC capability.
  if (!sameId(row.us_live_attempt_booking_id,row.id) ||
      !sameId(row.us_live_attempt_market_id,row.market_id) ||
      !sameId(row.us_live_attempt_binding_id,row.us_live_binding_id) ||
      row.us_live_attempt_owner_type!==row.collector_owner_type ||
      !sameId(row.us_live_attempt_owner_id,row.collector_owner_id) ||
      !sameId(row.us_live_attempt_revision,row.collector_revision) ||
      row.us_live_attempt_account_id!==row.us_live_binding_account_id ||
      row.us_live_attempt_currency!=="USD" ||
      String(row.us_live_attempt_amount_minor)!==String(row.us_tax_total_minor) ||
      row.us_live_event_id!==row.us_live_attempt_last_event_id ||
      row.us_live_event_account_id!==row.us_live_attempt_account_id ||
      row.us_live_event_pi_id!==row.us_live_attempt_pi_id ||
      row.us_live_event_mode!=="LIVE" ||
      row.us_live_event_signature!==true ||
      row.us_live_event_result!=="accepted" ||
      String(row.us_live_event_created)!==String(row.us_live_attempt_event_created)) {
    return null;
  }
  const mapping={
    succeeded:["payment_intent.succeeded","paid"],
    processing:["payment_intent.processing","awaiting_payment"],
    requires_payment_method:["payment_intent.payment_failed","requires_review"],
    canceled:["payment_intent.canceled","requires_review"],
  };
  const checked=mapping[row.us_live_attempt_status];
  if(!checked||checked[0]!==row.us_live_event_type)return null;

  let observedStatus=checked[1];
  if(checked[1]==="paid") {
    const cents=BigInt(String(row.us_tax_total_minor));
    const refunded=/^\d+$/.test(String(row.us_live_succeeded_refund_minor)) ?
      BigInt(String(row.us_live_succeeded_refund_minor)) : -1n;
    if(refunded<0n || refunded>cents)return null; // corrupted ledger fail-closed
    if(row.us_live_dispute_active===true) observedStatus="disputed";
    else if(refunded===cents) observedStatus="refunded";
    else if(refunded>0n) observedStatus="partially_refunded";
  }
  return {
    booking_id:row.id,market_code:"US",currency_code:"USD",
    service_payment_status:observedStatus,verified_projection:true,
    merchant_binding_verified:true,mode:"LIVE",
  };
}

/**
 * Must be called inside a read-only transaction AFTER the existing
 * verifyClientCabinetAccess check has accepted a non-revoked client token.
 * One parameterized SELECT with US sidecar LEFT JOINs; no KG/KZ writes.
 * Missing sidecar tables: route returns 503, never a fabricated price.
 */
export async function readUsPayC11Booking(
  db, { clientId, bookingId, allowTestStripeMode = false } = {}
) {
  const client = validId(clientId);
  const booking = validId(bookingId);
  if (!client || !booking) {
    return { status: 400, body: { ok: false, error: "US_PAY_C11_IDS_INVALID" } };
  }

  const result = await db.query(
    `SELECT
        b.id, b.client_id, b.status, b.salon_id, b.master_id, b.service_id,
        b.currency_code, m.id AS market_id,
        m.code AS market_code, m.default_currency AS market_currency,
        salon.name AS salon_name, master.name AS master_name,
        ups.booking_id AS us_price_booking_id,
        ups.market_id AS us_price_market_id,
        ups.salon_master_service_id AS us_price_link_id,
        ups.amount_minor::text AS us_amount_minor,
        ups.currency_code AS us_price_currency,
        ups.service_price_version AS us_price_version,
        tq.booking_id AS us_tax_booking_id,
        tq.market_id AS us_tax_market_id,
        tq.payment_purpose AS us_tax_purpose,
        tq.collector_owner_type AS us_tax_owner_type,
        tq.collector_owner_id AS us_tax_owner_id,
        tq.collector_revision AS us_tax_collector_revision,
        tq.currency_code AS us_tax_currency,
        tq.service_base_minor::text AS us_tax_base_minor,
        tq.rate_bps AS us_tax_rate_bps,
        tq.service_tax_minor::text AS us_tax_minor,
        tq.charge_total_minor::text AS us_tax_total_minor,
        sms.id AS price_service_link_id,
        sms.salon_id AS price_link_salon_id,
        sms.master_id AS price_link_master_id,
        sms.service_pk AS price_link_service_pk,
        sms.currency_code AS price_link_currency,
        upc.booking_id AS collector_booking_id,
        upc.market_id AS collector_market_id,
        upc.collector_owner_type, upc.collector_owner_id,
        upc.selection_source AS collector_selection_source,
        upc.selected_by_user_id AS collector_selected_by_user_id,
        upc.verification_status AS collector_verification_status,
        upc.verified_at AS collector_verified_at,
        upc.revision AS collector_revision,
        sb.id AS us_binding_id, sb.market_id AS us_binding_market_id,
        sb.owner_type AS us_binding_owner_type,
        sb.owner_id AS us_binding_owner_id,
        sb.stripe_mode AS us_binding_mode,
        sb.stripe_connected_account_id AS us_binding_account_id,
        sb.verification_status AS us_binding_status,
        sb.card_payments_status AS us_binding_card_payments,
        sb.charges_enabled AS us_binding_charges_enabled,
        sb.payouts_enabled AS us_binding_payouts_enabled,
        sb.details_submitted AS us_binding_details_submitted,
        sb.country AS us_binding_country,
        sb.verified_at AS us_binding_verified_at,
        sb.last_checked_at AS us_binding_last_checked_at,
        ls.id AS us_live_binding_id,
        ls.stripe_account_id AS us_live_binding_account_id,
        ls.market_id AS us_live_binding_market_id,
        ls.owner_type AS us_live_binding_owner_type,
        ls.owner_id AS us_live_binding_owner_id,
        ls.stripe_mode AS us_live_binding_mode,
        ls.account_type AS us_live_binding_type,
        ls.verification_status AS us_live_binding_status,
        ls.charges_enabled AS us_live_binding_charges,
        ls.payouts_enabled AS us_live_binding_payouts,
        ls.details_submitted AS us_live_binding_details,
        ls.card_payments_status AS us_live_binding_card_payments,
        ls.transfers_status AS us_live_binding_transfers,
        ls.verified_at AS us_live_binding_verified_at,
        ls.last_checked_at AS us_live_binding_last_checked_at,
        pa.booking_id AS us_attempt_booking_id,
        pa.market_id AS us_attempt_market_id,
        pa.merchant_binding_id AS us_attempt_binding_id,
        pa.stripe_connected_account_id AS us_attempt_account_id,
        pa.stripe_mode AS us_attempt_mode,
        pa.currency_code AS us_attempt_currency,
        pa.amount_minor::text AS us_attempt_amount_minor,
        pa.stripe_payment_intent_id AS us_attempt_payment_intent_id,
        pa.payment_status AS us_attempt_payment_status,
        pa.status_event_created AS us_attempt_event_created,
        pa.last_event_id AS us_attempt_last_event_id,
        ev.stripe_event_id AS us_event_id,
        ev.stripe_connected_account_id AS us_event_account_id,
        ev.stripe_payment_intent_id AS us_event_payment_intent_id,
        ev.stripe_mode AS us_event_mode,
        ev.event_type AS us_event_type,
        ev.event_created AS us_event_created,
        ev.signature_verified AS us_event_signature_verified,
        ev.processing_result AS us_event_result,
        livepi.booking_id AS us_live_attempt_booking_id,
        livepi.market_id AS us_live_attempt_market_id,
        livepi.seller_binding_id AS us_live_attempt_binding_id,
        livepi.collector_owner_type AS us_live_attempt_owner_type,
        livepi.collector_owner_id AS us_live_attempt_owner_id,
        livepi.collector_revision AS us_live_attempt_revision,
        livepi.stripe_account_id AS us_live_attempt_account_id,
        livepi.amount_minor::text AS us_live_attempt_amount_minor,
        livepi.currency_code AS us_live_attempt_currency,
        livepi.stripe_payment_intent_id AS us_live_attempt_pi_id,
        livepi.status AS us_live_attempt_status,
        livepi.stripe_event_created AS us_live_attempt_event_created,
        livepi.last_event_id AS us_live_attempt_last_event_id,
        lr.stripe_event_id AS us_live_event_id,
        lr.stripe_account_id AS us_live_event_account_id,
        lr.stripe_payment_intent_id AS us_live_event_pi_id,
        lr.stripe_mode AS us_live_event_mode,
        lr.event_type AS us_live_event_type,
        lr.event_created AS us_live_event_created,
        lr.signature_verified AS us_live_event_signature,
        lr.result AS us_live_event_result,
        COALESCE(refund_totals.succeeded_minor,'0') AS us_live_succeeded_refund_minor,
        COALESCE(dispute_totals.dispute_active,false) AS us_live_dispute_active
      FROM public.bookings b
      JOIN public.tenant_market_settings tms ON tms.salon_id = b.salon_id
      JOIN public.markets m ON m.id = tms.market_id
      LEFT JOIN public.salons salon ON salon.id = b.salon_id
      LEFT JOIN public.masters master ON master.id = b.master_id
      LEFT JOIN public.us_booking_price_snapshots ups ON ups.booking_id = b.id
      LEFT JOIN public.us_booking_service_tax_snapshots tq
        ON tq.booking_id=b.id AND tq.market_id=m.id
      LEFT JOIN public.salon_master_services sms
        ON sms.id = ups.salon_master_service_id
      LEFT JOIN public.us_booking_payment_collectors upc
        ON upc.booking_id = b.id
      LEFT JOIN public.us_stripe_merchant_bindings sb
        ON sb.market_id = upc.market_id
       AND sb.owner_type = upc.collector_owner_type
       AND sb.owner_id = upc.collector_owner_id
       AND sb.stripe_mode = 'TEST'
      LEFT JOIN public.us_stripe_live_seller_bindings ls
        ON ls.market_id = upc.market_id
       AND ls.owner_type = upc.collector_owner_type
       AND ls.owner_id = upc.collector_owner_id
       AND ls.stripe_mode = 'LIVE'
      LEFT JOIN public.us_stripe_payment_attempts pa
        ON pa.booking_id = b.id AND pa.merchant_binding_id = sb.id
      LEFT JOIN public.us_stripe_event_ledger ev
        ON ev.stripe_event_id = pa.last_event_id
      LEFT JOIN public.us_stripe_live_payment_intents livepi
        ON livepi.booking_id = b.id AND livepi.market_id = m.id
      LEFT JOIN public.us_stripe_live_payment_receipts lr
        ON lr.stripe_event_id = livepi.last_event_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(amount_minor) FILTER (WHERE status='succeeded'),0)::text AS succeeded_minor
          FROM public.us_c11_live_refunds rf
         WHERE rf.booking_id=b.id
      ) refund_totals ON true
      LEFT JOIN LATERAL (
        SELECT COALESCE(bool_or(status IN (
          'needs_response','under_review','lost','warning_needs_response',
          'warning_under_review'
        )),false) AS dispute_active
          FROM public.us_c11_live_disputes dp
         WHERE dp.booking_id=b.id
      ) dispute_totals ON true
      WHERE b.id = $1 AND b.client_id = $2
      LIMIT 1`,
    [booking, client]
  );

  if (!Array.isArray(result.rows) || result.rows.length !== 1) {
    return { status: 404, body: { ok: false, error: "US_BOOKING_NOT_FOUND" } };
  }
  const row = result.rows[0];
  if (row.market_code !== "US") {
    return { status: 404, body: { ok: false, error: "US_BOOKING_NOT_FOUND" } };
  }
  if (row.market_currency !== "USD" || row.currency_code !== "USD") {
    return { status: 409, body: { ok: false, error: "US_BOOKING_CURRENCY_MISMATCH" } };
  }

  const price = priceSnapshotFromRow(row);
  const tax = validatedTaxQuoteFromRow(row,price);
  const verifiedCollector = selectedCollectorFromRow(row, allowTestStripeMode);
  // A paid projection must never survive loss/corruption of its booking snapshot
  // or a revoked/unverified owner recipient.
  const verifiedPayment = price
    ? ((tax ? signedLivePaymentFromRow(row) : null) ||
       (verifiedCollector
         ? signedTestPaymentFromRow(row, allowTestStripeMode) : null))
    : null;
  const projection = buildUsPayC11ReadModel({
    booking: row,
    priceSnapshot: price,
    collector: verifiedCollector,
    payment: verifiedPayment,
  });

  // The signed payment record is independent of appointment lifecycle.
  // An already-cancelled US appointment with a non-terminal Stripe attempt
  // or verified funds requires human reconciliation; never hide received
  // money or automatically refund it. Derived from existing joined rows.
  const cancelled=["cancelled","canceled"].includes(projection.booking_status);
  const liveAttemptPresent=sameId(row.us_live_attempt_booking_id,row.id);
  const paymentConflict=cancelled && liveAttemptPresent &&
    String(row.us_live_attempt_status||"")!=="canceled";

  const unavailable = [];
  if (!projection.price) unavailable.push("US_PRICE_SNAPSHOT_UNAVAILABLE");
  if (!tax) unavailable.push("US_TAX_QUOTE_UNAVAILABLE");
  if (!projection.collector) unavailable.push("US_VERIFIED_COLLECTOR_UNAVAILABLE");
  if (projection.payment.provider !== "stripe") {
    unavailable.push("US_STRIPE_PAYMENT_PROJECTION_UNAVAILABLE");
  }

  return {
    status: 200,
    body: {
      ok: true,
      contract_version: "US-PAY-C11-read-v1",
      ...projection,
      ...(tax ? {
        service_tax: {
          rate_bps:tax.rate_bps,
          amount_minor:tax.service_tax_minor,
          currency_code:"USD",
          source:"us_booking_service_tax_snapshots",
        },
        charge_total_minor:tax.charge_total_minor,
        total_source:"us_booking_service_tax_snapshots",
      } : {}),
      payment_ready: false,
      financial_consistency_status:paymentConflict?"manual_review":"consistent",
      reconciliation_required:paymentConflict,
      unavailable_reason: unavailable.join(","),
    },
  };
}
