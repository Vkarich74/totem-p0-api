import { pool } from "../db/index.js";
import { getOrCreateWallet, getWalletBalance } from "../services/wallet/wallet.service.js";
import { credit, debit } from "../services/wallet/ledger.service.js";
import { createPayment, markPaymentPaid } from "../services/payment/payment.service.js";
import { requestPayout } from "../services/payout/payout.service.js";

function assert(c, m) { if (!c) throw new Error(m); }

async function resetDB() {
  await pool.query(`
    TRUNCATE
      ledger_entries,
      payouts,
      payments,
      service_invoices
    RESTART IDENTITY
    CASCADE
  `);
}

async function main() {
  console.log("NEGATIVE_TEST_START");

  await resetDB();

  const systemWalletId = await getOrCreateWallet({ ownerType: "system", ownerId: 1 });
  const masterWalletId = await getOrCreateWallet({ ownerType: "master", ownerId: 100 });

  await credit({ walletId: masterWalletId, amountCents: 5000, referenceType: "seed", referenceId: "s1" });
  assert(await getWalletBalance(masterWalletId) === 5000, "seed");

  try {
    await debit({ walletId: masterWalletId, amountCents: 6000, referenceType: "neg", referenceId: "o1" });
    throw new Error("overdraft allowed");
  } catch {}

  await debit({ walletId: masterWalletId, amountCents: 3000, referenceType: "neg", referenceId: "d1" });
  assert(await getWalletBalance(masterWalletId) === 2000, "after debit");

  await credit({ walletId: masterWalletId, amountCents: 8000, referenceType: "seed", referenceId: "s2" });
  assert(await getWalletBalance(masterWalletId) === 10000, "reseed");

  await requestPayout({ walletId: masterWalletId, amountCents: 9000 });
  assert(await getWalletBalance(masterWalletId) === 1000, "payout");

  await resetDB();

  const pid = await createPayment({
    clientRef: "c1",
    targetWalletId: masterWalletId,
    amountCents: 7000,
  });

  await markPaymentPaid({ paymentId: pid });
  await markPaymentPaid({ paymentId: pid });
  assert(await getWalletBalance(masterWalletId) === 7000, "idempotent");

  console.log("NEGATIVE_TEST_PASS");
}

main().catch(e => {
  console.error("NEGATIVE_TEST_FAIL");
  console.error(e.stack);
  process.exit(1);
});
