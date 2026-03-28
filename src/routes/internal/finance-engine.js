import express from "express";

let FINANCE_ENGINE_LOCK = false;

export default function buildFinanceEngineRouter(pool){
  const r = express.Router();

  function checkInternalToken(req){
    const token = req.headers["x-internal-token"];
    return token && token === process.env.INTERNAL_TOKEN;
  }

  async function acquireLock(){
    if(FINANCE_ENGINE_LOCK){
      return false;
    }
    FINANCE_ENGINE_LOCK = true;
    return true;
  }

  function releaseLock(){
    FINANCE_ENGINE_LOCK = false;
  }

  function buildSubscriptionReferenceId(subscription){
    const chargeBase = subscription.next_charge_at
      ? new Date(subscription.next_charge_at).toISOString()
      : new Date().toISOString();

    return `subscription:${subscription.id}:${chargeBase}`;
  }

  /* =========================
     BILLING ENGINE (NEW LAYER)
     ========================= */

  async function runBillingCycle(db){

    const now = new Date();

    const subs = await db.query(`
      SELECT *
      FROM public.billing_subscriptions
      WHERE subscription_status IN ('active','grace','blocked')
      FOR UPDATE
    `);

    let charged = 0;
    let activated = 0;
    let movedToGrace = 0;
    let blocked = 0;

    for(const s of subs.rows){

      const ownerType = s.owner_type;
      const ownerId = s.owner_id;

      const wallet = await db.query(`
        SELECT id
        FROM totem_test.wallets
        WHERE owner_type=$1 AND owner_id=$2
        LIMIT 1
      `,[ownerType, ownerId]);

      if(!wallet.rows.length){
        continue;
      }

      const walletId = wallet.rows[0].id;

      const balance = await db.query(`
        SELECT COALESCE(SUM(
          CASE WHEN direction='credit' THEN amount_cents ELSE -amount_cents END
        ),0)::int AS v
        FROM totem_test.ledger_entries
        WHERE wallet_id=$1
      `,[walletId]);

      const currentBalance = balance.rows[0].v;
      const amount = Number(s.amount || 0);
      const nextChargeAt = s.next_charge_at ? new Date(s.next_charge_at) : null;
      const graceUntil = s.grace_until ? new Date(s.grace_until) : null;
      const needCharge = !!nextChargeAt && nextChargeAt <= now;
      const chargeReferenceId = buildSubscriptionReferenceId(s);

      /* =========================
         BLOCKED → ACTIVE (AUTO RECOVERY)
         ========================= */

      if(s.subscription_status === "blocked"){

        if(currentBalance >= amount){

          await db.query(`
            INSERT INTO totem_test.ledger_entries(
              wallet_id,
              direction,
              amount_cents,
              reference_type,
              reference_id
            )
            VALUES
            ($1,'debit',$2::int,'subscription',$3),
            ((SELECT wallet_id FROM totem_test.system_wallets LIMIT 1),'credit',$2::int,'subscription',$3)
            ON CONFLICT DO NOTHING
          `,[
            walletId,
            amount,
            chargeReferenceId
          ]);

          await db.query(`
            UPDATE public.billing_subscriptions
            SET
              subscription_status='active',
              current_period_start=NOW(),
              current_period_end=NOW() + (subscription_period_days || ' days')::interval,
              next_charge_at=NOW() + (subscription_period_days || ' days')::interval,
              last_charge_at=NOW(),
              last_charge_status='success',
              blocked_at=NULL,
              grace_until=NULL,
              updated_at=NOW()
            WHERE id=$1
          `,[s.id]);

          activated += 1;
          charged += 1;
        }

        continue;
      }

      /* =========================
         CHARGE ATTEMPT
         ========================= */

      if(needCharge){

        if(currentBalance >= amount){

          await db.query(`
            INSERT INTO totem_test.ledger_entries(
              wallet_id,
              direction,
              amount_cents,
              reference_type,
              reference_id
            )
            VALUES
            ($1,'debit',$2::int,'subscription',$3),
            ((SELECT wallet_id FROM totem_test.system_wallets LIMIT 1),'credit',$2::int,'subscription',$3)
            ON CONFLICT DO NOTHING
          `,[
            walletId,
            amount,
            chargeReferenceId
          ]);

          await db.query(`
            UPDATE public.billing_subscriptions
            SET
              subscription_status='active',
              current_period_start=NOW(),
              current_period_end=NOW() + (subscription_period_days || ' days')::interval,
              next_charge_at=NOW() + (subscription_period_days || ' days')::interval,
              last_charge_at=NOW(),
              last_charge_status='success',
              grace_until=NULL,
              blocked_at=NULL,
              updated_at=NOW()
            WHERE id=$1
          `,[s.id]);

          charged += 1;
          activated += 1;
          continue;
        }

        if(s.subscription_status === "active"){

          await db.query(`
            UPDATE public.billing_subscriptions
            SET
              subscription_status='grace',
              grace_until=NOW() + (grace_period_days || ' days')::interval,
              last_charge_status='failed',
              updated_at=NOW()
            WHERE id=$1
          `,[s.id]);

          movedToGrace += 1;
          continue;
        }
      }

      /* =========================
         GRACE → BLOCKED
         ========================= */

      if(s.subscription_status === "grace" && graceUntil && graceUntil <= now){

        await db.query(`
          UPDATE public.billing_subscriptions
          SET
            subscription_status='blocked',
            blocked_at=NOW(),
            updated_at=NOW()
          WHERE id=$1
        `,[s.id]);

        blocked += 1;
      }

    }

    return {
      charged,
      activated,
      moved_to_grace:movedToGrace,
      blocked
    };

  }

  /* AUTO FINANCE ENGINE */
  r.post("/finance/run", async (req,res)=>{

    if(!checkInternalToken(req)){
      return res.status(403).json({ ok:false, error:"FORBIDDEN" });
    }

    if(!(await acquireLock())){
      return res.status(429).json({ ok:false, error:"ENGINE_ALREADY_RUNNING" });
    }

    const db = await pool.connect();

    try{

      await db.query("BEGIN");

      const billing = await runBillingCycle(db);

      const settlements = await db.query(`
        SELECT COUNT(*)::int AS v
        FROM payments p
        LEFT JOIN settlement_items si ON si.payment_id=p.id
        WHERE p.status='confirmed'
        AND si.id IS NULL
      `);

      const withdraws = await db.query(`
        SELECT COUNT(*)::int AS v
        FROM public.withdraws
        WHERE status='pending'
      `);

      await db.query("COMMIT");

      res.json({
        ok:true,
        message:"FINANCE_RUN_COMPLETED",
        billing,
        pending_settlements:settlements.rows[0].v,
        pending_withdraws:withdraws.rows[0].v
      });

    }catch(err){

      try{ await db.query("ROLLBACK"); }catch(e){}

      console.error("FINANCE_ENGINE_ERROR",err);

      res.status(500).json({
        ok:false,
        error:"FINANCE_ENGINE_FAILED"
      });

    }finally{

      db.release();
      releaseLock();

    }

  });

  /* AUTO FINANCE FULL ENGINE */
  r.post("/finance/run/full", async (req,res)=>{

    if(!checkInternalToken(req)){
      return res.status(403).json({ ok:false, error:"FORBIDDEN" });
    }

    if(!(await acquireLock())){
      return res.status(429).json({ ok:false, error:"ENGINE_ALREADY_RUNNING" });
    }

    const db = await pool.connect();

    try{

      await db.query("BEGIN");

      const billing = await runBillingCycle(db);

      const settlementsPending = await db.query(`
        SELECT COUNT(*)::int AS v
        FROM payments p
        LEFT JOIN settlement_items si ON si.payment_id=p.id
        LEFT JOIN payouts po ON po.booking_id=p.booking_id
        WHERE p.status='confirmed'
        AND si.id IS NULL
        AND po.id IS NULL
      `);

      const settlementsPendingCount = settlementsPending.rows[0].v;

      const payoutsPending = await db.query(`
        SELECT COUNT(*)::int AS v
        FROM payouts
        WHERE status='created'
      `);

      const payoutsPendingCount = payoutsPending.rows[0].v;

      const withdrawsPending = await db.query(`
        SELECT COUNT(*)::int AS v
        FROM public.withdraws
        WHERE status='pending'
      `);

      const withdrawsPendingCount = withdrawsPending.rows[0].v;

      let settlementsProcessed = 0;

      if(settlementsPendingCount > 0){

        const payments = await db.query(`
        SELECT
        p.id AS payment_id,
        p.amount,
        b.id AS booking_id,
        b.master_id,
        b.salon_id,
        b.status as booking_status
        FROM payments p
        JOIN bookings b ON b.id=p.booking_id
        LEFT JOIN settlement_items si ON si.payment_id=p.id
        LEFT JOIN payouts po ON po.booking_id=b.id
        WHERE p.status='confirmed'
        AND si.id IS NULL
        AND po.id IS NULL
        ORDER BY p.id ASC
        FOR UPDATE OF p SKIP LOCKED
        LIMIT 500
        `);

        const periodCache = new Map();

        for(const p of payments.rows){

          if(p.booking_status !== "completed"){
            throw new Error(`INVALID_BOOKING_STATUS booking_id=${p.booking_id}`);
          }

          const contract = await db.query(`
          SELECT id, terms_json
          FROM contracts
          WHERE salon_id=$1 AND master_id=$2
          AND status='active'
          AND archived_at IS NULL
          ORDER BY version DESC, created_at DESC
          LIMIT 1
          `,[p.salon_id,p.master_id]);

          if(!contract.rows.length){
            throw new Error("CONTRACT_REQUIRED");
          }

          const terms = contract.rows[0].terms_json || {};

          const masterPercent = parseInt(terms.master_percent || 0,10);
          const salonPercent = parseInt(terms.salon_percent || 0,10);
          const platformPercent = parseInt(terms.platform_percent || 0,10);

          const masterAmount = Math.floor(p.amount * masterPercent / 100);
          const salonAmount = Math.floor(p.amount * salonPercent / 100);
          const platformAmount = p.amount - masterAmount - salonAmount;

          let settlementId = periodCache.get(p.salon_id);

          if(!settlementId){

            const existing = await db.query(`
              SELECT id FROM settlement_periods
              WHERE salon_id=$1 AND status='open'
              AND is_archived=false
              LIMIT 1
            `,[p.salon_id]);

            if(existing.rows.length){
              settlementId = existing.rows[0].id;
            }else{
              const created = await db.query(`
                INSERT INTO settlement_periods(
                  period_start,period_end,status,created_at,salon_id,is_archived
                )
                VALUES(CURRENT_DATE,CURRENT_DATE,'open',NOW(),$1,false)
                RETURNING id
              `,[p.salon_id]);

              settlementId = created.rows[0].id;
            }

            periodCache.set(p.salon_id, settlementId);
          }

          await db.query(`
            INSERT INTO settlement_items(
              settlement_id,payment_id,booking_id,master_id,
              amount_total,amount_master,amount_platform,created_at
            )
            VALUES($1,$2,$3,$4,$5,$6,$7,NOW())
          `,[
            settlementId,
            p.payment_id,
            p.booking_id,
            p.master_id,
            p.amount,
            masterAmount,
            platformAmount
          ]);

          await db.query(`
            INSERT INTO payouts(
              booking_id,amount,status,created_at,payment_id,
              settlement_period_id,gross_amount,take_rate_bps,
              platform_fee,provider_amount
            )
            VALUES($1,$2,'created',NOW(),$3,$4,$5,$6,$7,$8)
          `,[
            p.booking_id,
            masterAmount,
            p.payment_id,
            settlementId,
            p.amount,
            platformPercent * 100,
            platformAmount,
            masterAmount + salonAmount
          ]);

          settlementsProcessed += 1;

        }

      }

      await db.query("COMMIT");

      return res.json({
        ok:true,
        engine:"finance_full",
        billing,
        settlements_pending:settlementsPendingCount,
        settlements_processed:settlementsProcessed
      });

    }catch(err){

      try{ await db.query("ROLLBACK"); }catch(e){}

      console.error("FINANCE_FULL_ENGINE_ERROR",err);

      return res.status(500).json({
        ok:false,
        error:"FINANCE_FULL_ENGINE_FAILED"
      });

    }finally{

      db.release();
      releaseLock();

    }

  });

  return r;
}