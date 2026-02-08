// services/payment/payment.service.js
// ====================================
// Payment Lifecycle — provider-agnostic
// ====================================

import { pool } from "../../db/index.js";
import { addLedgerEntry } from "../wallet/ledger.service.js";

/**
 * Create business payment (PENDING).
 */
export async function createPayment({
  clientRef,
  targetWalletId,
  amountCents,
}) {
  if (!clientRef) throw new Error("clientRef required");
  if (!targetWalletId) throw new Error("targetWalletId required");
  if (amountCents <= 0) throw new Error("amountCents must be positive");

  const res = await pool.query(
    `
    INSERT INTO payments (client_ref, target_wallet, amount_cents, status)
    VALUES ($1, $2, $3, 'pending')
    RETURNING id
    `,
    [clientRef, targetWalletId, amountCents]
  );

  return res.rows[0].id;
}

/**
 * Mark payment as PAID and credit wallet via ledger.
 */
export async function markPaymentPaid({ paymentId }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const pay = await client.query(
      `
      SELECT id, target_wallet, amount_cents, status
      FROM payments
      WHERE id = $1
      FOR UPDATE
      `,
      [paymentId]
    );

    if (pay.rows.length === 0) {
      throw new Error("payment not found");
    }

    const payment = pay.rows[0];

    if (payment.status !== "pending") {
      throw new Error("payment not in pending state");
    }

    await client.query(
      `
      UPDATE payments
      SET status = 'paid', paid_at = now()
      WHERE id = $1
      `,
      [paymentId]
    );

    await client.query("COMMIT");

    // Ledger entry AFTER payment state is fixed
    await addLedgerEntry({
      walletId: payment.target_wallet,
      direction: "credit",
      amountCents: payment.amount_cents,
      referenceType: "payment",
      referenceId: paymentId,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Mark payment as FAILED (no ledger impact).
 */
export async function markPaymentFailed({ paymentId }) {
  const res = await pool.query(
    `
    UPDATE payments
    SET status = 'failed'
    WHERE id = $1 AND status = 'pending'
    RETURNING id
    `,
    [paymentId]
  );

  if (res.rowCount === 0) {
    throw new Error("payment not found or not pending");
  }
}
