// core/refunds.js (ESM)
// Refunds & chargebacks logic
// Rules:
// - refund/chargeback updates booking_payments.status
// - if payout NOT created yet -> affects future payout (no adjustment)
// - if payout ALREADY created -> create negative adjustment in payouts (debt)

function getPaymentByBooking(db, bookingId) {
  return db.prepare(`
    SELECT *
    FROM booking_payments
    WHERE booking_id = ?
    LIMIT 1
  `).get(bookingId);
}

function getRelatedPayout(db, bookingId) {
  return db.prepare(`
    SELECT p.*
    FROM payouts p
    JOIN payout_items pi ON pi.payout_id = p.id
    WHERE pi.booking_id = ?
    LIMIT 1
  `).get(bookingId);
}

function insertRefund(db, { booking_id, payment_id, amount, currency, reason, type }) {
  const result = db.prepare(`
    INSERT INTO refunds (booking_id, payment_id, amount, currency, reason, type)
    VALUES (?,?,?,?,?,?)
  `).run(
    booking_id,
    payment_id || null,
    amount,
    currency,
    reason || null,
    type
  );

  return result.lastInsertRowid;
}

function updatePaymentStatus(db, paymentId, status) {
  db.prepare(`
    UPDATE booking_payments
    SET status = ?
    WHERE id = ?
  `).run(status, paymentId);
}

function createNegativeAdjustment(db, payoutId, bookingId, amount, commission) {
  // Negative adjustment is stored as negative values in payout_items
  db.prepare(`
    INSERT INTO payout_items (payout_id, booking_id, amount, commission, net)
    VALUES (?,?,?,?,?)
  `).run(
    payoutId,
    bookingId,
    -Math.abs(amount),
    -Math.abs(commission || 0),
    -Math.abs(amount - (commission || 0))
  );
}

/**
 * CREATE REFUND / CHARGEBACK
 * @param {Object} opts
 * @param {number} opts.bookingId
 * @param {number} opts.amount
 * @param {string} opts.currency
 * @param {string} opts.type - refund | chargeback
 * @param {string} opts.reason
 */
export function createRefund(db, { bookingId, amount, currency, type, reason }) {
  if (!bookingId || !amount || !currency || !type) {
    const e = new Error("Missing refund fields");
    e.code = "REFUND_FIELDS_REQUIRED";
    throw e;
  }

  if (!["refund", "chargeback"].includes(type)) {
    const e = new Error("Invalid refund type");
    e.code = "INVALID_REFUND_TYPE";
    throw e;
  }

  const payment = getPaymentByBooking(db, bookingId);
  if (!payment) {
    const e = new Error("Payment not found for booking");
    e.code = "PAYMENT_NOT_FOUND";
    throw e;
  }

  if (payment.status !== "succeeded") {
    const e = new Error("Payment not refundable");
    e.code = "PAYMENT_NOT_REFUNDABLE";
    throw e;
  }

  // Insert refund ledger
  insertRefund(db, {
    booking_id: bookingId,
    payment_id: payment.id,
    amount,
    currency,
    reason,
    type
  });

  // Update payment status
  const newStatus = type === "refund" ? "refunded" : "chargeback";
  updatePaymentStatus(db, payment.id, newStatus);

  // Check if payout already exists for this booking
  const payout = getRelatedPayout(db, bookingId);

  if (!payout) {
    // No payout yet → future payouts will account naturally
    return {
      booking_id: bookingId,
      status: newStatus,
      adjustment: "NONE"
    };
  }

  // Payout already done → create negative adjustment (debt)
  createNegativeAdjustment(
    db,
    payout.id,
    bookingId,
    amount,
    0 // commission already accounted; keep 0 to avoid double subtract
  );

  return {
    booking_id: bookingId,
    status: newStatus,
    adjustment: "NEGATIVE_PAYOUT_ADJUSTMENT",
    payout_id: payout.id
  };
}
