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
import buildOneTimeChargeRouter from "./internal/one-time-charge.js";
import buildOneTimeChargeHistoryRouter from "./internal/one-time-charge-history.js";

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

async function getBillingWalletId(db, ownerType, ownerId){
const wallet = await db.query(`
SELECT id
FROM totem_test.wallets
WHERE owner_type=$1
AND owner_id=$2
LIMIT 1
`,[ownerType, ownerId]);

if(!wallet.rows.length){
return null;
}

return wallet.rows[0].id;
}

async function getWalletBalanceById(db, walletId){
const balance = await db.query(`
SELECT
COALESCE(computed_balance_cents,0)::int AS balance
FROM totem_test.v_wallet_balance_computed
WHERE wallet_id=$1
LIMIT 1
`,[walletId]);

return Number(balance.rows[0]?.balance || 0);
}

const oneTimeChargeRouter = buildOneTimeChargeRouter({
  pool,
  getOrCreateSystemWallet,
  getWalletBalanceById
});
r.use(oneTimeChargeRouter);

const oneTimeChargeHistoryRouter = buildOneTimeChargeHistoryRouter({
  pool
});
r.use(oneTimeChargeHistoryRouter);

async function getDueBillingSubscriptions(db){
const due = await db.query(`
SELECT
id,
owner_type,
owner_id,
billing_model,
subscription_status,
subscription_period_days,
amount,
currency,
wallet_only,
current_period_start,
current_period_end,
grace_period_days,
grace_until,
last_charge_at,
next_charge_at,
last_charge_status,
blocked_at,
created_at,
updated_at
FROM public.billing_subscriptions
WHERE owner_type IN ('salon','master')
AND billing_model='subscription'
AND subscription_status='active'
AND wallet_only=true
AND next_charge_at IS NOT NULL
AND next_charge_at <= NOW()
FOR UPDATE
`);

return due.rows;
}

async function runBillingAutoCharge(db){
const due = await getDueBillingSubscriptions(db);
const systemWalletId = await getOrCreateSystemWallet(db);

let processed = 0;
let charged = 0;
let skipped_no_wallet = 0;
let skipped_insufficient_balance = 0;
let skipped_invalid_amount = 0;
let skipped_not_due = 0;
const results = [];

for(const billing of due){
processed++;

const ownerType = String(billing.owner_type || "");
const ownerId = Number(billing.owner_id);
const amount = Number(billing.amount || 0);

if(!Number.isFinite(amount) || amount <= 0){
skipped_invalid_amount++;
results.push({
billing_id:String(billing.id),
owner_type:ownerType,
owner_id:ownerId,
ok:false,
error:"SUBSCRIPTION_AMOUNT_INVALID"
});
continue;
}

if(billing.next_charge_at && new Date(billing.next_charge_at).getTime() > Date.now()){
skipped_not_due++;
results.push({
billing_id:String(billing.id),
owner_type:ownerType,
owner_id:ownerId,
ok:false,
error:"SUBSCRIPTION_NOT_DUE"
});
continue;
}

const walletId = await getBillingWalletId(db, ownerType, ownerId);

if(!walletId){
skipped_no_wallet++;
results.push({
billing_id:String(billing.id),
owner_type:ownerType,
owner_id:ownerId,
ok:false,
error:(ownerType === "salon" ? "SALON_WALLET_NOT_FOUND" : "MASTER_WALLET_NOT_FOUND")
});
continue;
}

const balance = await getWalletBalanceById(db, walletId);

if(balance < amount){
const graceDays = Number(billing.grace_period_days || 0);

await db.query(`
UPDATE public.billing_subscriptions
SET
last_charge_status='failed',
grace_until=CASE
WHEN $2 > 0 THEN NOW() + ($2 || ' days')::interval
ELSE NULL
END,
updated_at=NOW()
WHERE id=$1
AND subscription_status='active'
`,[
billing.id,
graceDays
]);

skipped_insufficient_balance++;
results.push({
billing_id:String(billing.id),
owner_type:ownerType,
owner_id:ownerId,
ok:false,
error:"INSUFFICIENT_WALLET_BALANCE",
balance,
amount
});
continue;
}

// idempotency check (prevent duplicate subscription charge)
const exists = await db.query(`
SELECT 1
FROM totem_test.ledger_entries
WHERE wallet_id=$1
AND reference_type='subscription'
AND reference_id=$2
AND direction='debit'
LIMIT 1
`,[walletId, String(billing.id)]);

if(exists.rows.length){
results.push({
billing_id:String(billing.id),
owner_type:ownerType,
owner_id:ownerId,
ok:true,
skipped:true,
reason:"ALREADY_CHARGED"
});
continue;
}

await db.query(`
INSERT INTO totem_test.ledger_entries(
wallet_id,
direction,
amount_cents,
reference_type,
reference_id,
created_at
)
VALUES($1,'debit',$2,'subscription',$3,NOW())
`,[
walletId,
amount,
String(billing.id)
]);

await db.query(`
INSERT INTO totem_test.ledger_entries(
wallet_id,
direction,
amount_cents,
reference_type,
reference_id,
created_at
)
VALUES($1,'credit',$2,'subscription',$3,NOW())
`,[
systemWalletId,
amount,
String(billing.id)
]);

const billingUpdate = await db.query(`
UPDATE public.billing_subscriptions
SET
last_charge_at=NOW(),
last_charge_status='success',
grace_until=NULL,
current_period_start=COALESCE(next_charge_at, NOW()),
current_period_end=COALESCE(next_charge_at, NOW()) + (COALESCE(subscription_period_days,30) || ' days')::interval,
next_charge_at=COALESCE(next_charge_at, NOW()) + (COALESCE(subscription_period_days,30) || ' days')::interval,
updated_at=NOW()
WHERE id=$1
AND subscription_status='active'
RETURNING id
`,[billing.id]);

if(!billingUpdate.rows.length){
throw new Error("BILLING_STATUS_CHANGED_DURING_AUTO_CHARGE");
}

charged++;
results.push({
billing_id:String(billing.id),
owner_type:ownerType,
owner_id:ownerId,
ok:true,
charged:true,
amount
});
}

return {
processed,
charged,
skipped_no_wallet,
skipped_insufficient_balance,
skipped_invalid_amount,
skipped_not_due,
results
};
}

r.post("/billing/auto-charge/run", async (req,res)=>{
const db = await pool.connect();

try{

await db.query("BEGIN");

const summary = await runBillingAutoCharge(db);

await db.query("COMMIT");

return res.json({
ok:true,
engine:"billing_auto_charge_manual",
processed:summary.processed,
charged:summary.charged,
skipped_no_wallet:summary.skipped_no_wallet,
skipped_insufficient_balance:summary.skipped_insufficient_balance,
skipped_invalid_amount:summary.skipped_invalid_amount,
skipped_not_due:summary.skipped_not_due,
results:summary.results
});

}catch(err){

try{ await db.query("ROLLBACK"); }catch(e){}

console.error("BILLING_AUTO_CHARGE_RUN_ERROR",err);

return res.status(500).json({
ok:false,
error:"BILLING_AUTO_CHARGE_RUN_FAILED"
});

}finally{

db.release();

}

});

/*
ARCHITECTURE CONTRACT (CRITICAL)

Payout ledger is written ONLY by backend (this processor).
Withdraw ledger is written ONLY by backend withdraw routes/processors.

Database trigger:
trg_bridge_payout_paid_to_wallet_ledger
MUST remain DISABLED.

Reason:
Prevent duplicate ledger entries (double-write conflict)
which breaks enforce_ledger_double_entry_row() invariant.

If this trigger is enabled -> system will break.

DO NOT CHANGE WITHOUT FULL FINANCE REFACTOR.
*/

return r;

}