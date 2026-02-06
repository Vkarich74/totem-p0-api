// core/payments.js — Postgres helpers (PROD)

export async function hasSucceededPayment(client, bookingId) {
  const { rows } = await client.query(
    `
    SELECT 1
    FROM payments
    WHERE booking_id = $1
      AND status = 'confirmed'
      AND is_active = true
    LIMIT 1
    `,
    [bookingId]
  );

  return rows.length > 0;
}
