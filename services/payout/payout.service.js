// services/payout/payout.service.js
// =================================
// Payout Flow — withdrawals
// =================================

import { pool } from "../../db/index.js";
import { getWalletBalance } from "../wallet/wallet.service.js";
import { addLedgerEntry } from "../wallet/ledger.service.js";

/**
 * Request payout.
 * Money is reserved immediately via ledger (debit).
 */
export async function requestPayout({ walletId, amountCents }) {
  if (!walletId) throw new Error("walletId required");
  if (amountCents <= 0) throw new Error("amountCents must be positive");

  const balance = await getWalletBalance(walletId);
  if (balance < amountCents) {
    throw new Error("insufficient funds");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const res = await client.query(
      `
      INSERT INTO payouts (wallet_id, amount_cents, status)
      VALUES ($1, $2, 'requested')
      RETURNING id
      `,
      [walletId, amountCents]
    );

    const payoutId = res.rows[0].id;

    await client.query("COMMIT");

    // Reserve funds
    await addLedgerEntry({
      walletId,
      direction: "debit",
      amountCents,
      referenceType: "payout",
      referenceId: payoutId,
    });

    return payoutId;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Mark payout as completed.
 * No ledger action here (already reserved).
 */
export async function markPayoutCompleted({ payoutId }) {
  const res = await pool.query(
    `
    UPDATE payouts
    SET status = 'completed', completed_at = now()
    WHERE id = $1 AND status = 'requested'
    RETURNING id
    `,
    [payoutId]
  );

  if (res.rowCount === 0) {
    throw new Error("payout not found or invalid state");
  }
}

/**
 * Fail payout and rollback funds via ledger.
 */
export async function markPayoutFailed({ payoutId }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const res = await client.query(
      `
      SELECT id, wallet_id, amount_cents, status
      FROM payouts
      WHERE id = $1
      FOR UPDATE
      `,
      [payoutId]
    );

    if (res.rows.length === 0) {
      throw new Error("payout not found");
    }

    const payout = res.rows[0];

    if (payout.status !== "requested") {
      throw new Error("payout not in requested state");
    }

    await client.query(
      `
      UPDATE payouts
      SET status = 'failed'
      WHERE id = $1
      `,
      [payoutId]
    );

    await client.query("COMMIT");

    // Rollback reserved funds
    await addLedgerEntry({
      walletId: payout.wallet_id,
      direction: "credit",
      amountCents: payout.amount_cents,
      referenceType: "payout_rollback",
      referenceId: payoutId,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
