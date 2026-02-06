/**
 * DRY-RUN PAYOUTS (AGGREGATED)
 * ---------------------------
 * Based on real DB schema:
 * - payments: source of money
 * - payouts: aggregated by entity + period
 *
 * NO DB WRITES. READ ONLY.
 */

import db from "../db.js";

async function run() {
  console.log("[DB] MODE: SQLITE");
  console.log("DRY-RUN PAYOUTS (AGGREGATED)");
  console.log("--------------------------------");

  // 1. Take succeeded payments
  const payments = await db.all(`
    SELECT
      id,
      booking_id,
      amount,
      currency
    FROM payments
    WHERE status = 'succeeded'
  `);

  if (payments.length === 0) {
    console.log("No succeeded payments found.");
    return;
  }

  // 2. Aggregate (simplest model: one global payout bucket)
  const totalAmount = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

  // 3. Dry-run payout aggregate
  const payout = {
    entity_type: "system",
    entity_id: "dry_run",
    period_from: payments[0].id,
    period_to: payments[payments.length - 1].id,
    total_paid: totalAmount,
    total_commission: 0,
    net_amount: totalAmount,
    currency: "KGS",
    status: "settled"
  };

  // 4. REPORT
  console.log("DRY-RUN PAYOUT REPORT");
  console.log("--------------------------------");
  console.log(`payments_used: ${payments.length}`);
  console.log(`total_paid: ${payout.total_paid} KGS`);
  console.log(`commission: ${payout.total_commission} KGS`);
  console.log(`net_amount: ${payout.net_amount} KGS`);
  console.log(`entity: ${payout.entity_type}:${payout.entity_id}`);
  console.log(`status: ${payout.status}`);
  console.log("--------------------------------");

  console.log("DETAIL PAYMENTS:");
  payments.forEach(p => {
    console.log(
      `- payment_id=${p.id} booking=${p.booking_id} amount=${p.amount}`
    );
  });

  console.log("\nDRY-RUN STATUS: OK");
}

run()
  .then(() => process.exit(0))
  .catch(err => {
    console.error("DRY-RUN ERROR:", err);
    process.exit(1);
  });
