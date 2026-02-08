// services/payout/payout.service.js
// =================================
// Payout Service (Postgres core)
// - reserve by ledger debit (prevents overdraft)
// - rollback by ledger credit
// =================================

import { pool } from "../../db/index.js";
import { debit, credit } from "../wallet/ledger.service.js";

function requirePool() {
  if (!pool) throw new Error("[Payout] Postgres pool not available. DB_MODE must be POSTGRES and DATABASE_URL set.");
}

export async function requestPayout({ walletId, amountCents }) {
  requirePool();
  if (!walletId) throw new Error("walletId required");
  if (!Number.isFinite(amountCents) || amountCents <= 0) throw new Error("amountCents must be positive");

  // Create payout row first (business object), then reserve via ledger debit
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const ins = await client.query(
      `
      INSERT INTO payouts (wallet_id, amount_cents, status)
      VALUES ($1,$2,'requested')
      RETURNING id
      `,
      [walletId, amountCents]
    );

    const payoutId = ins.rows[0].id;
    await client.query("COMMIT");

    // Reserve: ledger will block overdraft and enforce idempotency for this (wallet,payoutId,debit)
    await debit({
      walletId,
      amountCents,
      referenceType: "payout",
      referenceId: String(payoutId),
    });

    return payoutId;
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

export async function markPayoutFailed({ payoutId }) {
  requirePool();
  if (!payoutId) throw new Error("payoutId required");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const sel = await client.query(
      `
      SELECT id, wallet_id, amount_cents, status
      FROM payouts
      WHERE id=$1
      FOR UPDATE
      `,
      [payoutId]
    );

    if (sel.rows.length === 0) throw new Error("payout not found");
    const p = sel.rows[0];
    if (p.status !== "requested") throw new Error("payout not in requested state");

    await client.query(`UPDATE payouts SET status='failed' WHERE id=$1`, [payoutId]);
    await client.query("COMMIT");

    // Rollback credit (idempotent by UNIQUE)
    await credit({
      walletId: p.wallet_id,
      amountCents: Number(p.amount_cents),
      referenceType: "payout_rollback",
      referenceId: String(payoutId),
    });

    return { ok: true };
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    throw e;
  } finally {
    client.release();
  }
}
