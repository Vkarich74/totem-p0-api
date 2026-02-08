// services/wallet/wallet.service.js
// =================================
// Wallet Service — Financial Core
// Source of truth: ledger
// ESM compatible
// =================================

import { pool } from "../../db/index.js";

/**
 * Get existing wallet or create a new one.
 * Wallet balance is NOT stored here.
 */
export async function getOrCreateWallet({ ownerType, ownerId, currency = "USD" }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const res = await client.query(
      `
      SELECT id
      FROM wallets
      WHERE owner_type = $1 AND owner_id = $2 AND currency = $3
      FOR UPDATE
      `,
      [ownerType, ownerId, currency]
    );

    if (res.rows.length > 0) {
      await client.query("COMMIT");
      return res.rows[0].id;
    }

    const insert = await client.query(
      `
      INSERT INTO wallets (owner_type, owner_id, currency)
      VALUES ($1, $2, $3)
      RETURNING id
      `,
      [ownerType, ownerId, currency]
    );

    await client.query("COMMIT");
    return insert.rows[0].id;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Calculate wallet balance from ledger (deterministic).
 */
export async function getWalletBalance(walletId) {
  const res = await pool.query(
    `
    SELECT
      COALESCE(
        SUM(
          CASE
            WHEN direction = 'credit' THEN amount_cents
            ELSE -amount_cents
          END
        ),
        0
      ) AS balance_cents
    FROM ledger_entries
    WHERE wallet_id = $1
    `,
    [walletId]
  );

  return Number(res.rows[0].balance_cents);
}
