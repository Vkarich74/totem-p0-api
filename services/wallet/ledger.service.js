// services/wallet/ledger.service.js
// =================================
// Ledger Service — append-only
// ESM compatible
// =================================

import { pool } from "../../db/index.js";

/**
 * Append ledger entry.
 * No balance mutation here.
 */
export async function addLedgerEntry({
  walletId,
  direction,        // 'debit' | 'credit'
  amountCents,
  referenceType,
  referenceId,
}) {
  if (!walletId) throw new Error("walletId required");
  if (!direction) throw new Error("direction required");
  if (amountCents <= 0) throw new Error("amountCents must be positive");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock wallet row to avoid concurrent race
    await client.query(
      `SELECT id FROM wallets WHERE id = $1 FOR UPDATE`,
      [walletId]
    );

    await client.query(
      `
      INSERT INTO ledger_entries
        (wallet_id, direction, amount_cents, reference_type, reference_id)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [walletId, direction, amountCents, referenceType, referenceId]
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
