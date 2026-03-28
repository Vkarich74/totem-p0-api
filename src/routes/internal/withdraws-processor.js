import express from "express";

export default function buildWithdrawsProcessorRouter(pool){
const r = express.Router();

/* WITHDRAW PROCESSOR */
r.post("/withdraws/run", async (req,res)=>{

const db = await pool.connect();

try{

await db.query("BEGIN");

/* === STEP 1: pending → processing (как было) === */

const withdraws = await db.query(`
SELECT
w.id,
w.owner_type,
w.owner_id,
w.wallet_id,
w.amount,
w.destination,
w.external_ref,
w.status
FROM public.withdraws w
WHERE w.status='pending'
ORDER BY w.created_at ASC
FOR UPDATE SKIP LOCKED
LIMIT 500
`);

let processed = 0;
const withdrawIds = [];

for(const w of withdraws.rows){

await db.query(`
UPDATE public.withdraws
SET status='processing',
updated_at=NOW()
WHERE id=$1
AND status='pending'
`,[w.id]);

processed += 1;
withdrawIds.push(w.id);

}

/* === STEP 2: ДОБАВЛЕНО → processing → completed === */

const processing = await db.query(`
SELECT id
FROM public.withdraws
WHERE status='processing'
ORDER BY updated_at ASC
FOR UPDATE SKIP LOCKED
LIMIT 500
`);

let completedAuto = 0;

for(const w of processing.rows){

await db.query(`
UPDATE public.withdraws
SET status='completed',
external_ref=$2,
updated_at=NOW()
WHERE id=$1
AND status='processing'
`,[
w.id,
`auto-${w.id}`
]);

completedAuto += 1;

}

/* если вообще ничего не было */
if(processed === 0 && completedAuto === 0){
await db.query("ROLLBACK");
return res.json({
ok:true,
withdraws_processed:0,
message:"NO_WITHDRAWS"
});
}

await db.query("COMMIT");

res.json({
ok:true,
withdraws_processed:processed,
completed_auto:completedAuto,
withdraw_ids:withdrawIds
});

}catch(err){

try{ await db.query("ROLLBACK"); }catch(e){}

console.error("WITHDRAW_PROCESSOR_ERROR",err);

res.status(500).json({
ok:false,
error:"WITHDRAW_PROCESSOR_FAILED"
});

}finally{

db.release();

}

});

/* WITHDRAW COMPLETE */
r.post("/withdraws/:id/complete", async (req,res)=>{

const { id } = req.params;
const { external_ref } = req.body;
const db = await pool.connect();

try{

await db.query("BEGIN");

const withdraw = await db.query(`
SELECT
id,
status,
external_ref
FROM public.withdraws
WHERE id=$1
FOR UPDATE
LIMIT 1
`,[id]);

if(!withdraw.rows.length){
await db.query("ROLLBACK");
return res.status(404).json({ok:false,error:"WITHDRAW_NOT_FOUND"});
}

if(withdraw.rows[0].status !== 'processing'){
await db.query("ROLLBACK");
return res.status(409).json({
ok:false,
error:"WITHDRAW_STATUS_INVALID",
status:withdraw.rows[0].status
});
}

const finalExternalRef = String(external_ref || withdraw.rows[0].external_ref || `withdraw-${id}`).trim();

const completed = await db.query(`
UPDATE public.withdraws
SET status='completed',
external_ref=$2,
updated_at=NOW()
WHERE id=$1
AND status='processing'
RETURNING *
`,[
id,
finalExternalRef
]);

await db.query("COMMIT");

return res.json({
ok:true,
withdraw:completed.rows[0]
});

}catch(err){

try{ await db.query("ROLLBACK"); }catch(e){}

console.error("WITHDRAW_COMPLETE_ERROR",err);

return res.status(500).json({
ok:false,
error:"WITHDRAW_COMPLETE_FAILED"
});

}finally{

db.release();

}

});

/* WITHDRAW FAIL */
r.post("/withdraws/:id/fail", async (req,res)=>{

const { id } = req.params;
const { external_ref } = req.body;
const db = await pool.connect();

try{

await db.query("BEGIN");

const withdraw = await db.query(`
SELECT
id,
status,
external_ref
FROM public.withdraws
WHERE id=$1
FOR UPDATE
LIMIT 1
`,[id]);

if(!withdraw.rows.length){
await db.query("ROLLBACK");
return res.status(404).json({ok:false,error:"WITHDRAW_NOT_FOUND"});
}

if(withdraw.rows[0].status !== 'processing'){
await db.query("ROLLBACK");
return res.status(409).json({
ok:false,
error:"WITHDRAW_STATUS_INVALID",
status:withdraw.rows[0].status
});
}

const finalExternalRef = String(external_ref || withdraw.rows[0].external_ref || '').trim() || null;

const failed = await db.query(`
UPDATE public.withdraws
SET status='failed',
external_ref=$2,
updated_at=NOW()
WHERE id=$1
RETURNING *
`,[
id,
finalExternalRef
]);

await db.query("COMMIT");

return res.json({
ok:true,
withdraw:failed.rows[0]
});

}catch(err){

try{ await db.query("ROLLBACK"); }catch(e){}

console.error("WITHDRAW_FAIL_ERROR",err);

return res.status(500).json({
ok:false,
error:"WITHDRAW_FAIL_FAILED"
});

}finally{

db.release();

}

});

/* WITHDRAW RETRY */
r.post("/withdraws/:id/retry", async (req,res)=>{

const { id } = req.params;
const db = await pool.connect();

try{

await db.query("BEGIN");

const withdraw = await db.query(`
SELECT
id,
status
FROM public.withdraws
WHERE id=$1
FOR UPDATE
LIMIT 1
`,[id]);

if(!withdraw.rows.length){
await db.query("ROLLBACK");
return res.status(404).json({ok:false,error:"WITHDRAW_NOT_FOUND"});
}

if(withdraw.rows[0].status !== 'failed'){
await db.query("ROLLBACK");
return res.status(409).json({
ok:false,
error:"WITHDRAW_RETRY_INVALID_STATUS",
status:withdraw.rows[0].status
});
}

const retried = await db.query(`
UPDATE public.withdraws
SET
status='pending',
external_ref=NULL,
updated_at=NOW()
WHERE id=$1
AND status='failed'
RETURNING *
`,[id]);

await db.query("COMMIT");

return res.json({
ok:true,
withdraw:retried.rows[0]
});

}catch(err){

try{ await db.query("ROLLBACK"); }catch(e){}

console.error("WITHDRAW_RETRY_ERROR",err);

return res.status(500).json({
ok:false,
error:"WITHDRAW_RETRY_FAILED"
});

}finally{

db.release();

}

});

return r;
}