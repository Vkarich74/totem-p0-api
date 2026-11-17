// US-PAY-C11: pure server-side contract; no database writes or provider calls.
// All inputs MUST come from authenticated, tenant-scoped database queries.
// Never populate from client request, mutable service catalog, Stripe redirect,
// or legacy KG/KZ payment rows.
const BOOKING_STATUSES = new Set(["reserved","confirmed","completed","canceled","cancelled"]);
const PAYMENT_STATUSES = new Set(["unpaid","awaiting_payment","paid","refunded","disputed","requires_review"]);
const OWNER_TYPES = new Set(["salon","master"]);
const MAX_SAFE_CENTS = BigInt(Number.MAX_SAFE_INTEGER);

function safeText(value) { return typeof value === "string" ? value.trim() : ""; }
function positiveIdentifier(value) {
  const v = String(value ?? "");
  if (!/^[1-9]\d*$/.test(v)) return null;
  const n = Number(v);
  return Number.isSafeInteger(n) ? n : null;
}

/** Canonical integer minor units only: 1050 = exactly $10.50. */
export function validateUsdMinorAmount(value) {
  if (typeof value !== "string" && typeof value !== "bigint") return null;
  const raw = String(value);
  if (!/^[1-9]\d*$/.test(raw)) return null;
  const cents = BigInt(raw);
  if (cents > MAX_SAFE_CENTS) return null;
  return cents.toString();
}

/**
 * priceSnapshot: immutable US booking price sidecar; never bookings.price_snapshot.
 * collector: booking-scoped verified owner anchor; never client-selected data.
 * payment: verified US Stripe read projection; never legacy payments.
 */
export function buildUsPayC11ReadModel({ booking, priceSnapshot, collector, payment } = {}) {
  if (!booking || booking.market_code !== "US" || booking.currency_code !== "USD") {
    throw new Error("US_PAY_C11_MARKET_MISMATCH");
  }
  const bookingId = positiveIdentifier(booking.id);
  if (!bookingId) throw new Error("US_PAY_C11_BOOKING_ID_INVALID");
  const appointmentStatus = safeText(booking.status).toLowerCase();
  const validAppointmentStatus = BOOKING_STATUSES.has(appointmentStatus);

  const priceValid = priceSnapshot?.booking_id != null &&
    positiveIdentifier(priceSnapshot.booking_id) === bookingId &&
    priceSnapshot.currency === "USD" &&
    priceSnapshot.market_code === "US" &&
    priceSnapshot.immutable_verified === true;
  const amountMinor = priceValid ? validateUsdMinorAmount(priceSnapshot.amount_minor) : null;

  const collectorValid = collector?.booking_id != null &&
    positiveIdentifier(collector.booking_id) === bookingId &&
    collector.market_code === "US" && collector.currency_code === "USD" &&
    collector.verified === true && collector.conflicted !== true &&
    OWNER_TYPES.has(collector.owner_type) &&
    Boolean(positiveIdentifier(collector.owner_id)) &&
    Boolean(safeText(collector.display_name));

  const paymentStatus = safeText(payment?.service_payment_status).toLowerCase();
  const paymentValid = payment?.booking_id != null &&
    positiveIdentifier(payment.booking_id) === bookingId &&
    payment.market_code === "US" && payment.currency_code === "USD" &&
    payment.verified_projection === true && PAYMENT_STATUSES.has(paymentStatus);
  // A booking confirmation or browser Checkout return does not imply payment.
  const resolvedPayment = paymentValid ? paymentStatus : "requires_review";
  const recipient = collectorValid ? {
    owner_type: collector.owner_type,
    display_name: safeText(collector.display_name),
    verified: true,
  } : null;
  const amount = amountMinor ? {
    amount_minor: amountMinor,
    currency_code: "USD",
    source: "us_booking_price_snapshots",
  } : null;
  const merchantReady = paymentValid && payment.merchant_binding_verified === true &&
    (payment.mode === "TEST" || payment.mode === "LIVE");
  return {
    booking_id: bookingId,
    market_code: "US",
    currency_code: "USD",
    booking_status: validAppointmentStatus ? appointmentStatus : "unavailable",
    price: amount,
    payment: {
      service_payment_status: resolvedPayment,
      provider: paymentValid ? "stripe" : null,
    },
    collector: recipient,
    payment_ready: Boolean(amount && recipient && merchantReady && validAppointmentStatus &&
      (appointmentStatus === "reserved" || appointmentStatus === "confirmed") &&
      (resolvedPayment === "unpaid" || resolvedPayment === "awaiting_payment")),
  };
}
