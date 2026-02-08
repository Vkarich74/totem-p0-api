// services/invoice/service-invoice.service.js
// ===========================================
// Service Invoices (Postgres core)
// - debit from source wallet (blocks overdraft)
// - credit to system wallet
// - idempotent per wallet+direction+reference
// ===========================================

import { pool } from "../../db/index.js";
import { debit, credit } from "../wallet/ledger.service.js";

function requirePool() {
  if (!pool) throw new Error("[Invoice] Postgres pool not available. DB_MODE must be POSTGRES and DATABASE_URL set.");
}

export async function createServiceInvoice({ sourceWalletId, systemWalletId, description, amountCents }) {
  requirePool();
  if (!sourceWalletId) throw new Error("sourceWalletId required");
  if (!systemWalletId) throw new Error("systemWalletId required");
  if (!description) throw new Error("description required");
  if (!Number.isFinite(amountCents) || amountCents <= 0) throw new Error("amountCents must be positive");

  const ins = await pool.query(
    `
    INSERT INTO service_invoices (system_wallet, description, amount_cents)
    VALUES ($1,$2,$3)
    RETURNING id
    `,
    [systemWalletId, description, amountCents]
  );

  const invoiceId = ins.rows[0].id;

  // Debit source (blocks overdraft)
  await debit({
    walletId: sourceWalletId,
    amountCents,
    referenceType: "service_invoice",
    referenceId: String(invoiceId),
  });

  // Credit system
  await credit({
    walletId: systemWalletId,
    amountCents,
    referenceType: "service_invoice",
    referenceId: String(invoiceId),
  });

  return invoiceId;
}
