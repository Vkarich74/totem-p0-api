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

  if(p.booking_status !== 'completed'){
  throw new Error(`INVALID_BOOKING_STATUS booking_id=${p.booking_id} status=${p.booking_status}`);
  }

  const contract = await db.query(`
  SELECT
  id,
  terms_json
  FROM contracts
  WHERE salon_id=$1
  AND master_id=$2
  AND status='active'
  AND archived_at IS NULL
  ORDER BY version DESC, created_at DESC
  FOR UPDATE
  LIMIT 1
  `,[
  p.salon_id,
  p.master_id
  ]);

  if(!contract.rows.length){
  throw new Error(`CONTRACT_REQUIRED salon_id=${p.salon_id} master_id=${p.master_id} booking_id=${p.booking_id} payment_id=${p.payment_id}`);
  }

  const terms = contract.rows[0].terms_json || {};

  const masterPercent = parseInt(terms.master_percent || 0,10);
  const salonPercent = parseInt(terms.salon_percent || 0,10);
  const platformPercent = parseInt(terms.platform_percent || 0,10);

  if(masterPercent + salonPercent + platformPercent !== 100){
  throw new Error(`INVALID_CONTRACT_SPLIT salon_id=${p.salon_id} master_id=${p.master_id}`);
  }

  const masterAmount = Math.floor(p.amount * masterPercent / 100);
  const salonAmount = Math.floor(p.amount * salonPercent / 100);
  const platformAmount = p.amount - masterAmount - salonAmount;

  let settlementId = periodCache.get(p.salon_id);

  if(!settlementId){

  const existingOpenPeriod = await db.query(`
  SELECT id
  FROM settlement_periods
  WHERE salon_id=$1
  AND status='open'
  AND is_archived=false
  ORDER BY id DESC
  LIMIT 1
  `,[
  p.salon_id
  ]);

  if(existingOpenPeriod.rows.length){
  settlementId = existingOpenPeriod.rows[0].id;
  }else{
  const createdPeriod = await db.query(`
  INSERT INTO settlement_periods(
  period_start,
  period_end,
  status,
  created_at,
  salon_id,
  is_archived
  )
  VALUES(
  CURRENT_DATE,
  CURRENT_DATE,
  'open',
  NOW(),
  $1,
  false
  )
  RETURNING id
  `,[
  p.salon_id
  ]);
  settlementId = createdPeriod.rows[0].id;
  }

  periodCache.set(p.salon_id, settlementId);

  }

  await db.query(`
  INSERT INTO settlement_items(
  settlement_id,
  payment_id,
  booking_id,
  master_id,
  amount_total,
  amount_master,
  amount_platform,
  created_at
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

  const payoutExists = await db.query(`
  SELECT id
  FROM payouts
  WHERE booking_id=$1
  LIMIT 1
  `,[p.booking_id]);

  if(!payoutExists.rows.length){
  await db.query(`
  INSERT INTO payouts(
  booking_id,
  amount,
  status,
  created_at,
  payment_id,
  settlement_period_id,
  gross_amount,
  take_rate_bps,
  platform_fee,
  provider_amount
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
  }

  settlementsProcessed += 1;

  }

  }

  let payoutsProcessed = 0;

  if(payoutsPendingCount > 0){

  const payouts = await db.query(`
  SELECT
  p.id,
  p.booking_id,
  p.amount,
  b.master_id,
  b.salon_id,
  b.status as booking_status
  FROM payouts p
  JOIN bookings b ON b.id=p.booking_id
  WHERE p.status='created'
  ORDER BY p.id ASC
  FOR UPDATE OF p SKIP LOCKED
  LIMIT 500
  `);

  for(const p of payouts.rows){

  if(p.booking_status !== 'completed'){
  throw new Error(`INVALID_BOOKING_STATUS booking_id=${p.booking_id} status=${p.booking_status}`);
  }

  const salonWallet = await db.query(`
  SELECT id
  FROM totem_test.wallets
  WHERE owner_type='salon'
  AND owner_id=$1
  LIMIT 1
  `,[p.salon_id]);

  const masterWallet = await db.query(`
  SELECT id
  FROM totem_test.wallets
  WHERE owner_type='master'
  AND owner_id=$1
  LIMIT 1
  `,[p.master_id]);

  if(!salonWallet.rows.length){
  throw new Error(`SALON_WALLET_NOT_FOUND salon_id=${p.salon_id}`);
  }

  if(!masterWallet.rows.length){
  throw new Error(`MASTER_WALLET_NOT_FOUND master_id=${p.master_id}`);
  }

  await db.query(`
  DELETE FROM totem_test.ledger_entries
  WHERE reference_type='payout'
  AND reference_id=$1
  `,[String(p.id)]);

  await db.query(`
  INSERT INTO totem_test.ledger_entries(
  wallet_id,
  direction,
  amount_cents,
  reference_type,
  reference_id
  )
  VALUES
  ($1,'debit',$3::int,'payout',$4),
  ($2,'credit',$3::int,'payout',$4)
  `,[
  salonWallet.rows[0].id,
  masterWallet.rows[0].id,
  p.amount,
  String(p.id)
  ]);

  await db.query(`
  UPDATE payouts
  SET status='paid'
  WHERE id=$1
  `,[p.id]);

  payoutsProcessed += 1;

  }

  }

  let withdrawsProcessed = 0;
  const withdrawIds = [];

  if(withdrawsPendingCount > 0){

  const withdraws = await db.query(`
  SELECT
  w.id
  FROM public.withdraws w
  WHERE w.status='pending'
  ORDER BY w.created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 500
  `);

  for(const w of withdraws.rows){

  await db.query(`
  UPDATE public.withdraws
  SET status='processing',
  updated_at=NOW()
  WHERE id=$1
  AND status='pending'
  `,[w.id]);

  withdrawsProcessed += 1;
  withdrawIds.push(w.id);

  }

  }

  await db.query("COMMIT");

  return res.json({
  ok:true,
  engine:"finance_full",
  settlements_pending:settlementsPendingCount,
  settlements_processed:settlementsProcessed,
  payouts_pending:payoutsPendingCount,
  payouts_processed:payoutsProcessed,
  withdraws_pending:withdrawsPendingCount,
  withdraws_processed:withdrawsProcessed,
  withdraw_ids:withdrawIds
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