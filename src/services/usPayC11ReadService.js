// US-PAY-C11 — isolated, read-only, US-only booking context.
// The production schema reviewed 2026-11-16 has NO immutable USD cents
// snapshot, seller-authorized merchant binding or verified US payment ledger.
// Therefore missing sources MUST NOT be replaced by legacy integer/KGS data.
import { buildUsPayC11ReadModel } from "./usPayC11ReadModel.js";

function validId(value) {
  const text = String(value ?? "");
  if (!/^[1-9]\d*$/.test(text)) return null;
  const id = Number(text);
  return Number.isSafeInteger(id) ? id : null;
}

/**
 * Only existing, audited production columns are queried. No PII, bank details,
 * provider secrets, legacy payments or mutable service price are read.
 * Calling layer MUST verify a valid, non-revoked client cabinet token first.
 */
export async function readUsPayC11Booking(db, { clientId, bookingId } = {}) {
  const client = validId(clientId);
  const booking = validId(bookingId);
  if (!client || !booking) {
    return { status: 400, body: { ok: false, error: "US_PAY_C11_IDS_INVALID" } };
  }

  const result = await db.query(
    `SELECT b.id, b.status, b.currency_code, m.code AS market_code,
            m.default_currency AS market_currency
       FROM public.bookings b
       JOIN public.tenant_market_settings tms ON tms.salon_id = b.salon_id
       JOIN public.markets m ON m.id = tms.market_id
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

  // A US sidecar price/verified collector + Stripe signed-event projection
  // do not yet exist in the audited live schema. Never fabricate them.
  const projection = buildUsPayC11ReadModel({
    booking: row,
    priceSnapshot: null,
    collector: null,
    payment: null,
  });

  return {
    status: 200,
    body: {
      ok: true,
      contract_version: "US-PAY-C11-read-v1",
      ...projection,
      payment_ready: false,
      unavailable_reason: "US_PAYMENT_READ_SOURCES_NOT_PROVISIONED",
    },
  };
}
