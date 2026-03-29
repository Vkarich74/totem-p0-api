import { Router } from "express";

export default function buildOneTimeChargeRouter({
  pool,
  getOrCreateSystemWallet,
  getWalletBalanceById
}) {
  const r = Router();

  async function getOwnerWalletId(db, ownerType, ownerId){
    const wallet = await db.query(`
SELECT id
FROM totem_test.wallets
WHERE owner_type=$1
AND owner_id=$2
LIMIT 1
`,[ownerType, ownerId]);

    if(!wallet.rows.length){
      throw new Error(ownerType === "salon" ? "SALON_WALLET_NOT_FOUND" : "MASTER_WALLET_NOT_FOUND");
    }

    return wallet.rows[0].id;
  }

  async function assertBillingNotBlocked(db, ownerType, ownerId){
    const result = await db.query(`
SELECT
subscription_status,
blocked_at
FROM public.billing_subscriptions
WHERE owner_type=$1
AND owner_id=$2
ORDER BY id DESC
LIMIT 1
`,[ownerType, ownerId]);

    if(!result.rows.length){
      return;
    }

    const row = result.rows[0];

    if(row.subscription_status === "blocked" || row.blocked_at){
      throw new Error("BILLING_BLOCKED");
    }
  }

  r.post("/billing/one-time-charge", async (req,res)=>{
    const db = await pool.connect();

    try{

      await db.query("BEGIN");

      const ownerType = String(req.body?.owner_type || "").trim();
      const ownerId = Number(req.body?.owner_id);
      const amount = Number(req.body?.amount);
      const currency = String(req.body?.currency || "").trim();
      const reason = String(req.body?.reason || "").trim();
      const idempotencyKey = String(req.body?.idempotency_key || "").trim();

      if(!["salon","master"].includes(ownerType)){
        await db.query("ROLLBACK");
        return res.status(400).json({ ok:false, error:"INVALID_OWNER_TYPE" });
      }

      if(!Number.isInteger(ownerId) || ownerId <= 0){
        await db.query("ROLLBACK");
        return res.status(400).json({ ok:false, error:"INVALID_OWNER_ID" });
      }

      if(!Number.isFinite(amount) || amount <= 0){
        await db.query("ROLLBACK");
        return res.status(400).json({ ok:false, error:"INVALID_AMOUNT" });
      }

      if(currency !== "KGS"){
        await db.query("ROLLBACK");
        return res.status(400).json({ ok:false, error:"INVALID_CURRENCY" });
      }

      if(!reason){
        await db.query("ROLLBACK");
        return res.status(400).json({ ok:false, error:"REASON_REQUIRED" });
      }

      if(!idempotencyKey){
        await db.query("ROLLBACK");
        return res.status(400).json({ ok:false, error:"IDEMPOTENCY_KEY_REQUIRED" });
      }

      await assertBillingNotBlocked(db, ownerType, ownerId);

      const ownerWalletId = await getOwnerWalletId(db, ownerType, ownerId);
      const systemWalletId = await getOrCreateSystemWallet(db);

      const existing = await db.query(`
SELECT
wallet_id,
direction,
amount_cents,
reference_type,
reference_id,
purpose
FROM totem_test.ledger_entries
WHERE reference_type='platform_fee'
AND reference_id=$1
LIMIT 1
`,[idempotencyKey]);

      if(existing.rows.length){
        await db.query("ROLLBACK");
        return res.json({
          ok:true,
          skipped:true,
          reason:"ALREADY_PROCESSED",
          idempotency_key:idempotencyKey
        });
      }

      const balance = await getWalletBalanceById(db, ownerWalletId);

      if(balance < amount){
        await db.query("ROLLBACK");
        return res.status(400).json({
          ok:false,
          error:"INSUFFICIENT_WALLET_BALANCE",
          balance,
          amount
        });
      }

      await db.query(`
INSERT INTO totem_test.ledger_entries(
wallet_id,
direction,
amount_cents,
reference_type,
reference_id,
purpose
)
VALUES
($1,'debit',$3,'platform_fee',$4,$5),
($2,'credit',$3,'platform_fee',$4,$5)
`,[
ownerWalletId,
systemWalletId,
amount,
idempotencyKey,
reason
]);

      await db.query("COMMIT");

      return res.json({
        ok:true,
        charged:true,
        owner_type:ownerType,
        owner_id:ownerId,
        amount,
        currency,
        reason,
        reference_type:"platform_fee",
        idempotency_key:idempotencyKey
      });

    }catch(err){

      try{ await db.query("ROLLBACK"); }catch(e){}

      const message = String(err?.message || "");

      if(
        message === "SALON_WALLET_NOT_FOUND" ||
        message === "MASTER_WALLET_NOT_FOUND" ||
        message === "BILLING_BLOCKED"
      ){
        return res.status(400).json({ ok:false, error:message });
      }

      console.error("ONE_TIME_CHARGE_ERROR",err);

      return res.status(500).json({
        ok:false,
        error:"ONE_TIME_CHARGE_FAILED"
      });

    }finally{

      db.release();

    }
  });

  return r;
}