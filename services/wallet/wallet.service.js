// services/wallet/wallet.service.js
// =================================
// Wallet Service (Postgres core)
// Balance is derived from ledger
// =================================

import { pool } from "../../db/index.js";

function requirePool() {
  if (!pool) throw new Error("[Wallet] Postgres pool not available. DB_MODE must be POSTGRES and DATABASE_URL set.");
}

export async function getOrCreateWallet({ ownerType, ownerId, currency = "USD" }) {
  requirePool();
  if (!ownerType) throw new Error("ownerType required");
  if (ownerId === undefined || ownerId === null) throw new Error("ownerId required");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const sel = await client.query(
      `
      SELECT id FROM wallets
      WHERE owner_type=$1 AND owner_id=$2 AND currency=$3
      FOR UPDATE
      `,
      [ownerType, ownerId, currency]
    );

    if (sel.rows.length) {
      await client.query("COMMIT");
      return sel.rows[0].id;
    }

    const ins = await client.query(
      `
      INSERT INTO wallets (owner_type, owner_id, currency)
      VALUES ($1,$2,$3)
      RETURNING id
      `,
      [ownerType, ownerId, currency]
    );

    await client.query("COMMIT");
    return ins.rows[0].id;
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

export async function getWalletBalance(walletId) {
  requirePool();
  const res = await pool.query(
    `
    SELECT COALESCE(SUM(
      CASE WHEN direction='credit' THEN amount_cents ELSE -amount_cents END
    ),0)::bigint AS balance_cents
    FROM ledger_entries
    WHERE wallet_id=$1
    `,
    [walletId]
  );
  return Number(res.rows[0].balance_cents);
}
