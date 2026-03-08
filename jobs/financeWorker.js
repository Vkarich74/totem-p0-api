// jobs/financeWorker.js
// AUTOMATIC FINANCE ORCHESTRATOR
// Runs full financial pipeline safely

import pool from "../db/index.js";

export async function runFinanceWorker() {

  const client = await pool.connect();

  try {

    // 1️⃣ Find completed bookings without payout
    const bookings = await client.query(`
      SELECT b.id
      FROM bookings b
      WHERE b.status='completed'
      AND NOT EXISTS (
        SELECT 1 FROM payouts p
        WHERE p.booking_id=b.id
      )
      ORDER BY b.id
      LIMIT 50
    `);

    if (!bookings.rowCount) {
      return;
    }

    for (const row of bookings.rows) {

      const bookingId = row.id;

      try {

        // CREATE PAYOUT
        const payout = await client.query(`
          INSERT INTO payouts
            (booking_id,status,gross_amount,platform_fee,provider_amount)
          SELECT
            b.id,
            'created',
            p.amount,
            0,
            p.amount
          FROM bookings b
          JOIN payments p ON p.booking_id=b.id
          WHERE b.id=$1
          LIMIT 1
          RETURNING id
        `,[bookingId]);

        if (!payout.rowCount) {
          continue;
        }

        const payoutId = payout.rows[0].id;

        // ATTACH SETTLEMENT
        await client.query(`
          UPDATE payouts
          SET status='paid'
          WHERE id=$1
        `,[payoutId]);

        // FIND SALON
        const salon = await client.query(`
          SELECT salon_id
          FROM bookings
          WHERE id=$1
        `,[bookingId]);

        if (!salon.rowCount) {
          continue;
        }

        const salonId = salon.rows[0].salon_id;

        // FIND WALLET
        const wallet = await client.query(`
          SELECT id
          FROM totem_test.wallets
          WHERE owner_type='salon'
          AND owner_id=$1
          LIMIT 1
        `,[salonId]);

        if (!wallet.rowCount) {
          continue;
        }

        const walletId = wallet.rows[0].id;

        // GET PAYOUT AMOUNT
        const payoutData = await client.query(`
          SELECT provider_amount
          FROM payouts
          WHERE id=$1
        `,[payoutId]);

        const amount = payoutData.rows[0].provider_amount;

        // LEDGER DEBIT (PAYOUT)
        await client.query(`
          INSERT INTO totem_test.ledger_entries
          (
            wallet_id,
            direction,
            amount_cents,
            reference_type,
            reference_id
          )
          VALUES
          ($1,'debit',$2,'payout',$3)
        `,[walletId,amount,String(payoutId)]);

        // FINAL STATUS
        await client.query(`
          UPDATE payouts
          SET status='executed'
          WHERE id=$1
        `,[payoutId]);

      } catch (innerErr) {

        console.error("[FINANCE_WORKER_BOOKING_ERROR]", bookingId, innerErr);

      }

    }

  } catch (err) {

    console.error("[FINANCE_WORKER_FATAL]", err);

  } finally {

    client.release();

  }

}