// services/invoice/service-invoice.service.js
// ===========================================
// Service Invoices — platform billing
// ===========================================

import { pool } from "../../db/index.js";
import { getWalletBalance } from "../wallet/wallet.service.js";
import { addLedgerEntry } from "../wallet/ledger.service.js";

/**
 * Create service invoice and immediately collect funds.
 * Funds move: source wallet -> system wallet.
 */
export async function createServiceInvoice({
  sourceWalletId,
  systemWalletId,
  description,
  amountCents,
}) {
  if (!sourceWalletId) throw new Error("sourceWalletId required");
  if (!systemWalletId) throw new Error("systemWalletId required");
  if (!description) throw new Error("description required");
  if (amountCents <= 0) throw new Error("amountCents must be positive");

  const balance = await getWalletBalance(sourceWalletId);
  if (balance < amountCents) {
    throw new Error("insufficient funds");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const res = await client.query(
      `
      INSERT INTO service_invoices
        (system_wallet, description, amount_cents)
      VALUES ($1, $2, $3)
      RETURNING id
      `,
      [systemWalletId, description, amountCents]
    );

    const invoiceId = res.rows[0].id;

    await client.query("COMMIT");

    // Debit source wallet
    await addLedgerEntry({
      walletId: sourceWalletId,
      direction: "debit",
      amountCents,
      referenceType: "service_invoice",
      referenceId: invoiceId,
    });

    // Credit system wallet
    await addLedgerEntry({
      walletId: systemWalletId,
      direction: "credit",
      amountCents,
      referenceType: "service_invoice",
      referenceId: invoiceId,
    });

    return invoiceId;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
