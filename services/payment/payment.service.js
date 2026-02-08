// services/payment/payment.service.js
// ====================================
// Payment Lifecycle (Postgres core)
// - provider-agnostic
// - idempotent markPaid: repeated calls must not double-credit
// ====================================

import { pool } from "../../db/index.js";
import { credit } from "../wallet/ledger.service.js";

function requirePool() {
  if (!pool) throw new Error("[Payment] Postgres pool not available. DB_MODE must be POSTGRES and DATABASE_URL set.");
}

export async function createPayment({ clientRef, targetWalletId, amountCents }) {
  requirePool();
  if (!clientRef) throw new Error("clientRef required");
  if (!targetWalletId) throw new Error("targetWalletId required");
  if (!Number.isFinite(amountCents) || amountCents <= 0) throw new Error("amountCents must be positive");

  const res = await pool.query(
    `
    INSERT INTO payments (client_ref, target_wallet, amount_cents, status)
    VALUES ($1,$2,$3,'pending')
    RETURNING id
    `,
    [clientRef, targetWalletId, amountCents]
  );
  return res.rows[0].id;
}

export async function markPaymentPaid({ paymentId }) {
  requirePool();
  if (!paymentId) throw new Error("paymentId required");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const sel = await client.query(
      `
      SELECT id, target_wallet, amount_cents, status
      FROM payments
      WHERE id=$1
      FOR UPDATE
      `,
      [paymentId]
    );

    if (sel.rows.length === 0) throw new Error("payment not found");
    const p = sel.rows[0];

    // Idempotent behavior: if already paid -> exit without new credit
    if (p.status === "paid") {
      await client.query("COMMIT");
      return { ok: true, idempotent: true };
    }

    if (p.status !== "pending") throw new Error("payment not in pending state");

    await client.query(
      `UPDATE payments SET status='paid', paid_at=now() WHERE id=$1`,
      [paymentId]
    );

    await client.query("COMMIT");

    // Credit via ledger (ledger enforces idempotency by UNIQUE constraint)
    const r = await credit({
      walletId: p.target_wallet,
      amountCents: Number(p.amount_cents),
      referenceType: "payment",
      referenceId: String(paymentId),
    });

    return { ok: true, idempotent: !r.inserted };
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

export async function markPaymentFailed({ paymentId }) {
  requirePool();
  if (!paymentId) throw new Error("paymentId required");

  const res = await pool.query(
    `
    UPDATE payments
    SET status='failed'
    WHERE id=$1 AND status='pending'
    RETURNING id
    `,
    [paymentId]
  );

  if (res.rowCount === 0) throw new Error("payment not found or not pending");
  return { ok: true };
}
