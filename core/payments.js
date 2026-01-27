export function createPayment(db, bookingId, amount, provider, providerRef) {
  const existing = db
    .prepare(
      `SELECT id FROM booking_payments WHERE booking_id = ?`
    )
    .get(bookingId);

  if (existing) {
    const err = new Error("PAYMENT_ALREADY_EXISTS");
    err.code = "PAYMENT_ALREADY_EXISTS";
    throw err;
  }

  db.prepare(
    `INSERT INTO booking_payments
     (booking_id, amount, provider, provider_ref, status)
     VALUES (?, ?, ?, ?, 'succeeded')`
  ).run(
    bookingId,
    amount,
    provider,
    providerRef || null
  );

  return { bookingId, amount, provider, status: "succeeded" };
}

export function hasSucceededPayment(db, bookingId) {
  const row = db
    .prepare(
      `SELECT id FROM booking_payments
       WHERE booking_id = ? AND status = 'succeeded'`
    )
    .get(bookingId);

  return !!row;
}
