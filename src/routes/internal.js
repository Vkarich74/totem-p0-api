import express from "express";
import crypto from "crypto";
import { pool } from "../db.js";
import { xpayCreateQR, xpayCheckStatus } from "../payments/xpay.js";
import { rateLimit } from "../middleware/rateLimit.js";
import buildReportsRouter from "./internal/reports.js";
import buildPaymentsRouter from "./internal/payments.js";
import buildSettlementsRouter from "./internal/settlements.js";
import buildContractsRouter from "./internal/contracts.js";
import buildWithdrawsRouter from "./internal/withdraws.js";
import buildXpayRouter from "./internal/xpay.js";
import buildContractAliasRouter from "./internal/contract-alias.js";
import buildPayoutsProcessorRouter from "./internal/payouts-processor.js";
import buildFinanceEngineRouter from "./internal/finance-engine.js";
import buildWithdrawsProcessorRouter from "./internal/withdraws-processor.js";
import buildMastersRouter from "./internal/masters.js";
import buildSalonsRouter from "./internal/salons.js";

export function createInternalRouter({ rlInternal } = {}){

const r = express.Router();

const internalReadRateLimit =
  rlInternal ||
  ((req, res, next) => {
    const redis = req.app?.locals?.redis ?? null;
    return rateLimit({
      windowMs: 60_000,
      max: 60,
      keyPrefix: "internal-read",
      redis,
    })(req, res, next);
  });

const reportsRouter = buildReportsRouter(pool, internalReadRateLimit);
r.use(reportsRouter);

async function getOrCreateSystemWallet(db){
const systemWallet = await db.query(`
SELECT wallet_id
FROM totem_test.system_wallets
FOR UPDATE
LIMIT 1
`);

if(systemWallet.rows.length){
return systemWallet.rows[0].wallet_id;
}

const existingWallet = await db.query(`
SELECT id
FROM totem_test.wallets
WHERE owner_type='system'
AND owner_id=0
FOR UPDATE
LIMIT 1
`);

let walletId = existingWallet.rows[0]?.id || null;

if(!walletId){
const createdWallet = await db.query(`
INSERT INTO totem_test.wallets(
owner_type,
owner_id,
currency
)
VALUES('system',0,'KGS')
RETURNING id
`);

walletId = createdWallet.rows[0].id;
}

await db.query(`
INSERT INTO totem_test.system_wallets(wallet_id)
SELECT $1
WHERE NOT EXISTS (
SELECT 1
FROM totem_test.system_wallets
WHERE wallet_id=$1
)
`,[walletId]);

return walletId;
}

async function getSystemWalletId(db){
return getOrCreateSystemWallet(db);
}

async function getSalonWalletId(db, salonId){
const wallet = await db.query(`
SELECT w.id
FROM totem_test.wallets w
WHERE w.owner_type='salon'
AND w.owner_id=$1
LIMIT 1
`,[salonId]);

if(!wallet.rows.length){
throw new Error("SALON_WALLET_NOT_FOUND");
}

return wallet.rows[0].id;
}

async function setBookingConfirmedIfNeeded(db, bookingId){
await db.query(`
UPDATE bookings
SET status='confirmed'
WHERE id=$1
AND status IN ('reserved','pending')
`,[bookingId]);
}

const paymentsRouter = buildPaymentsRouter({
  pool,
  getSalonWalletId,
  getSystemWalletId,
  setBookingConfirmedIfNeeded,
});

r.use(paymentsRouter);

const settlementsRouter = buildSettlementsRouter(pool);
r.use(settlementsRouter);

const contractsRouter = buildContractsRouter(pool, internalReadRateLimit);
r.use(contractsRouter);

const withdrawsRouter = buildWithdrawsRouter(pool, internalReadRateLimit);
r.use(withdrawsRouter);

const xpayRouter = buildXpayRouter({
  pool,
  xpayCreateQR,
  xpayCheckStatus,
});
r.use(xpayRouter);

const contractAliasRouter = buildContractAliasRouter(pool);
r.use(contractAliasRouter);

const payoutsProcessorRouter = buildPayoutsProcessorRouter(pool, getOrCreateSystemWallet);
r.use(payoutsProcessorRouter);

const financeEngineRouter = buildFinanceEngineRouter(pool);
r.use(financeEngineRouter);

const withdrawsProcessorRouter = buildWithdrawsProcessorRouter(pool);
r.use(withdrawsProcessorRouter);

const mastersRouter = buildMastersRouter(pool, internalReadRateLimit);
r.use(mastersRouter);

const salonsRouter = buildSalonsRouter(pool, internalReadRateLimit);
r.use(salonsRouter);

/* =========================
   AUTO-CHARGE (MANUAL RUN)
   ========================= */

r.post("/internal/billing/auto-charge/run", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const due = await client.query(`
      SELECT *
      FROM totem_test.billing
      WHERE subscription_status='active'
      AND next_charge_at <= NOW()
      FOR UPDATE
    `);

    let charged = 0;

    for(const b of due.rows){

      // wallet lookup
      const wallet = await client.query(`
        SELECT id
        FROM totem_test.wallets
        WHERE owner_type=$1 AND owner_id=$2
        LIMIT 1
      `,[b.owner_type, b.owner_id]);

      if(!wallet.rows.length){
        continue;
      }

      const walletId = wallet.rows[0].id;

      // баланс
      const balance = await client.query(`
        SELECT COALESCE(SUM(
          CASE
            WHEN direction='debit' THEN amount
            WHEN direction='credit' THEN -amount
          END
        ),0) as balance
        FROM totem_test.ledger
        WHERE wallet_id=$1
      `,[walletId]);

      const currentBalance = Number(balance.rows[0].balance || 0);

      if(currentBalance < b.amount){
        continue;
      }

      const systemWalletId = await getOrCreateSystemWallet(client);

      // двойная запись
      await client.query(`
        INSERT INTO totem_test.ledger(
          wallet_id,
          direction,
          amount,
          currency,
          reference_type,
          reference_id
        )
        VALUES
        ($1,'credit',$3,'KGS','subscription',$4),
        ($2,'debit',$3,'KGS','subscription',$4)
      `,[walletId, systemWalletId, b.amount, b.id]);

      // обновление периода
      await client.query(`
        UPDATE totem_test.billing
        SET
          current_period_start = NOW(),
          current_period_end = NOW() + (subscription_period_days || ' days')::interval,
          next_charge_at = NOW() + (subscription_period_days || ' days')::interval,
          last_charge_at = NOW(),
          last_charge_status = 'success'
        WHERE id=$1
      `,[b.id]);

      charged++;
    }

    await client.query("COMMIT");

    res.json({
      ok: true,
      charged
    });

  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({
      ok:false,
      error:"AUTO_CHARGE_FAILED",
      details:e.message
    });
  } finally {
    client.release();
  }
});

/*
ARCHITECTURE CONTRACT (CRITICAL)

Payout ledger is written ONLY by backend (this processor).
Withdraw ledger is written ONLY by backend withdraw routes/processors.

Database trigger:
trg_bridge_payout_paid_to_wallet_ledger
MUST remain DISABLED.
*/

return r;

}