// services/wallet/ledger.service.js
// =================================
// Ledger Service (Postgres core)
// - Append-only ledger
// - Idempotent writes by UNIQUE(wallet_id, reference_type, reference_id, direction)
// - Prevent overdraft on debit (balance check inside TX)
// =================================

import { pool } from "../../db/index.js";

function requirePool() {
  if (!pool) throw new Error("[Ledger] Postgres pool not available. DB_MODE must be POSTGRES and DATABASE_URL set.");
}

export async function addLedgerEntry({ walletId, direction, amountCents, referenceType, referenceId }) {
  requirePool();
  if (!walletId) throw new Error("walletId required");
  if (!direction) throw new Error("direction required");
  if (direction !== "credit" && direction !== "debit") throw new Error("direction must be credit|debit");
  if (!referenceType) throw new Error("referenceType required");
  if (referenceId === undefined || referenceId === null || referenceId === "") throw new Error("referenceId required");
  if (!Number.isFinite(amountCents) || amountCents <= 0) throw new Error("amountCents must be positive");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock wallet row to serialize spend (prevents race double-spend)
    await client.query("SELECT id FROM wallets WHERE id = $1 FOR UPDATE", [walletId]);

    if (direction === "debit") {
      // Compute balance from ledger under the same lock
      const balRes = await client.query(
        `
        SELECT COALESCE(SUM(
          CASE WHEN direction='credit' THEN amount_cents ELSE -amount_cents END
        ),0)::bigint AS bal
        FROM ledger_entries
        WHERE wallet_id = $1
        `,
        [walletId]
      );

      const bal = Number(balRes.rows[0].bal);
      if (bal < amountCents) {
        await client.query("ROLLBACK");
        const err = new Error("insufficient funds");
        err.code = "INSUFFICIENT_FUNDS";
        throw err;
      }
    }

    // Idempotent insert: if duplicate, do nothing
    const ins = await client.query(
      `
      INSERT INTO ledger_entries (wallet_id, direction, amount_cents, reference_type, reference_id)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (wallet_id, reference_type, reference_id, direction)
      DO NOTHING
      RETURNING id
      `,
      [walletId, direction, amountCents, referenceType, String(referenceId)]
    );

    await client.query("COMMIT");

    return { inserted: ins.rowCount === 1, id: ins.rows[0]?.id || null };
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

// Explicit helpers (optional use)
export async function credit({ walletId, amountCents, referenceType, referenceId }) {
  return addLedgerEntry({ walletId, direction: "credit", amountCents, referenceType, referenceId });
}

export async function debit({ walletId, amountCents, referenceType, referenceId }) {
  return addLedgerEntry({ walletId, direction: "debit", amountCents, referenceType, referenceId });
}
