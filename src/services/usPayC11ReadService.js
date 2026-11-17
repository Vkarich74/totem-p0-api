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

function selectedCollectorFromRow(row) {
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

/**
 * Must be called inside a read-only transaction AFTER the existing
 * verifyClientCabinetAccess check has accepted a non-revoked client token.
 * One parameterized SELECT with US sidecar LEFT JOINs; no KG/KZ writes.
 * Missing sidecar tables: route returns 503, never a fabricated price.
 */
export async function readUsPayC11Booking(db, { clientId, bookingId } = {}) {
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
        upc.verified_at AS collector_verified_at
      FROM public.bookings b
      JOIN public.tenant_market_settings tms ON tms.salon_id = b.salon_id
      JOIN public.markets m ON m.id = tms.market_id
      LEFT JOIN public.salons salon ON salon.id = b.salon_id
      LEFT JOIN public.masters master ON master.id = b.master_id
      LEFT JOIN public.us_booking_price_snapshots ups ON ups.booking_id = b.id
      LEFT JOIN public.salon_master_services sms
        ON sms.id = ups.salon_master_service_id
      LEFT JOIN public.us_booking_payment_collectors upc
        ON upc.booking_id = b.id
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

  const projection = buildUsPayC11ReadModel({
    booking: row,
    priceSnapshot: priceSnapshotFromRow(row),
    collector: selectedCollectorFromRow(row),
    payment: null, // No verified Stripe ledger/read projection at this stage.
  });

  const unavailable = [];
  if (!projection.price) unavailable.push("US_PRICE_SNAPSHOT_UNAVAILABLE");
  if (!projection.collector) unavailable.push("US_VERIFIED_COLLECTOR_UNAVAILABLE");
  unavailable.push("US_STRIPE_PAYMENT_PROJECTION_UNAVAILABLE");

  return {
    status: 200,
    body: {
      ok: true,
      contract_version: "US-PAY-C11-read-v1",
      ...projection,
      payment_ready: false,
      unavailable_reason: unavailable.join(","),
    },
  };
}
