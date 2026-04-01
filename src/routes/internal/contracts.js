import express from "express";

function validateTerms(terms){
  const master = Number(terms?.master_percent ?? 0);
  const salon = Number(terms?.salon_percent ?? 0);
  const platform = Number(terms?.platform_percent ?? 0);

  if(master < 0 || salon < 0 || platform < 0){
    throw new Error("INVALID_PERCENT_NEGATIVE");
  }

  const total = master + salon + platform;

  if(total !== 100){
    throw new Error("INVALID_PERCENT_TOTAL");
  }

  return {
    master_percent: master,
    salon_percent: salon,
    platform_percent: platform,
    payout_schedule: terms?.payout_schedule || "manual"
  };
}

function normalizeDate(date){
  try{
    return date ? new Date(date) : new Date();
  }catch{
    return new Date();
  }
}

export default function buildContractsRouter(pool, internalReadRateLimit){

const r = express.Router();

/* ============================= */
/* CONTRACT ENGINE               */
/* ============================= */

async function createContract({ db, salonId, master_id, terms_json, effective_from }){

if(!master_id){
throw new Error("MASTER_ID_REQUIRED");
}

const validatedTerms = validateTerms(terms_json || {});
const effectiveDate = normalizeDate(effective_from);

const existing = await db.query(`
SELECT id
FROM contracts
WHERE salon_id=$1
AND master_id=$2
AND status='active'
LIMIT 1
`,[salonId, master_id]);

if(existing.rows.length){
const err = new Error("ACTIVE_CONTRACT_EXISTS");
err.contract_id = existing.rows[0].id;
throw err;
}

const contract = await db.query(`
INSERT INTO contracts(
salon_id,
master_id,
status,
version,
terms_json,
effective_from,
created_at
)
VALUES(
$1,$2,'pending',1,$3,$4,NOW()
)
RETURNING *
`,[
salonId,
master_id,
validatedTerms,
effectiveDate
]);

return contract.rows[0];

}

/* CREATE */
r.post("/contracts", async (req,res)=>{

const {
salon_id,
master_id,
terms_json,
effective_from
} = req.body;

try{

if(!salon_id){
return res.status(400).json({ok:false,error:"SALON_ID_REQUIRED"});
}

const contract = await createContract({
db: pool,
salonId: salon_id,
master_id,
terms_json,
effective_from
});

res.json({ ok:true, contract });

}catch(err){

if(err.message === "ACTIVE_CONTRACT_EXISTS"){
return res.status(409).json({
ok:false,
error:err.message,
contract_id:err.contract_id
});
}

if(err.message.startsWith("INVALID_") || err.message === "MASTER_ID_REQUIRED"){
return res.status(400).json({ ok:false, error:err.message });
}

console.error("CONTRACT_CREATE_ERROR",err);

res.status(500).json({ ok:false, error:"CONTRACT_CREATE_FAILED" });

}

});

/* SALON CONTRACTS */
r.get("/salons/:slug/contracts", async (req,res)=>{

const { slug } = req.params;

try{

const salon = await pool.query(
`SELECT id FROM salons WHERE slug=$1`,
[slug]
);

if(!salon.rows.length){
return res.status(404).json({ok:false,error:"SALON_NOT_FOUND"});
}

const contracts = await pool.query(`
SELECT
c.id,
c.master_id,
COALESCE(m.slug, c.master_id::text) AS master_slug,
c.status,
c.version,
c.terms_json,
COALESCE((c.terms_json->>'master_percent')::int, 0) AS share_percent,
c.created_at
FROM contracts c
LEFT JOIN masters m ON m.id::text = c.master_id::text
WHERE c.salon_id=$1
ORDER BY c.created_at DESC
`,[salon.rows[0].id]);

res.json({ ok:true, contracts:contracts.rows });

}catch(err){

console.error("SALON_CONTRACTS_FETCH_ERROR",err);

res.status(500).json({
ok:false,
error:"SALON_CONTRACTS_FETCH_FAILED"
});

}

});

/* CREATE FROM SALON */
r.post("/salons/:slug/contracts", async (req,res)=>{

const { slug } = req.params;
const { master_id, terms_json, effective_from } = req.body;

try{

const salon = await pool.query(
`SELECT id FROM salons WHERE slug=$1`,
[slug]
);

if(!salon.rows.length){
return res.status(404).json({ok:false,error:"SALON_NOT_FOUND"});
}

const contract = await createContract({
db: pool,
salonId: salon.rows[0].id,
master_id,
terms_json,
effective_from
});

res.json({ ok:true, contract });

}catch(err){

if(err.message === "ACTIVE_CONTRACT_EXISTS"){
return res.status(409).json({
ok:false,
error:err.message,
contract_id:err.contract_id
});
}

if(err.message.startsWith("INVALID_") || err.message === "MASTER_ID_REQUIRED"){
return res.status(400).json({ ok:false, error:err.message });
}

console.error("SALON_CONTRACT_CREATE_ERROR",err);

res.status(500).json({
ok:false,
error:"SALON_CONTRACT_CREATE_FAILED"
});

}

});

/* ACCEPT */
r.post("/contracts/:id/accept", async (req,res)=>{

const { id } = req.params;
const db = await pool.connect();

try{

await db.query("BEGIN");

const contract = await db.query(`
SELECT *
FROM contracts
WHERE id=$1
FOR UPDATE
LIMIT 1
`,[id]);

if(!contract.rows.length){
await db.query("ROLLBACK");
return res.status(404).json({ok:false,error:"CONTRACT_NOT_FOUND"});
}

const salonId = contract.rows[0].salon_id;
const masterId = contract.rows[0].master_id;

await db.query(`
UPDATE contracts
SET status='archived',
archived_at=NOW()
WHERE salon_id=$1
AND master_id=$2
AND status='active'
AND id<>$3
`,[salonId, masterId, id]);

const activated = await db.query(`
UPDATE contracts
SET status='active',
archived_at=NULL
WHERE id=$1
RETURNING *
`,[id]);

await db.query("COMMIT");

res.json({ ok:true, contract:activated.rows[0] });

}catch(err){

try{ await db.query("ROLLBACK"); }catch(e){}

console.error("CONTRACT_ACCEPT_ERROR",err);

res.status(500).json({
ok:false,
error:"CONTRACT_ACCEPT_FAILED"
});

}finally{

db.release();

}

});

/* ARCHIVE */
r.post("/contracts/:id/archive", async (req,res)=>{

const { id } = req.params;

try{

const contract = await pool.query(`
UPDATE contracts
SET status='archived',
archived_at=NOW()
WHERE id=$1
RETURNING *
`,[id]);

if(!contract.rows.length){
return res.status(404).json({ok:false,error:"CONTRACT_NOT_FOUND"});
}

res.json({ ok:true, contract:contract.rows[0] });

}catch(err){

console.error("CONTRACT_ARCHIVE_ERROR",err);

res.status(500).json({
ok:false,
error:"CONTRACT_ARCHIVE_FAILED"
});

}

});

/* ============================= */
/* MASTER CONTRACTS (FIX)        */
/* ============================= */

/* ACTIVE CONTRACT FOR MASTER */
r.get("/contracts/master/:slug/active", async (req,res)=>{

const { slug } = req.params;

try{

const master = await pool.query(
`SELECT id FROM masters WHERE slug=$1`,
[slug]
);

if(!master.rows.length){
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

const contract = await pool.query(`
SELECT *
FROM contracts
WHERE master_id=$1
AND status='active'
ORDER BY created_at DESC
LIMIT 1
`,[master.rows[0].id]);

res.json({
ok:true,
contract: contract.rows[0] || null
});

}catch(err){

console.error("MASTER_ACTIVE_CONTRACT_ERROR",err);

res.status(500).json({
ok:false,
error:"MASTER_ACTIVE_CONTRACT_FAILED"
});

}

});

/* CONTRACT HISTORY FOR MASTER */
r.get("/contracts/master/:slug/history", async (req,res)=>{

const { slug } = req.params;

try{

const master = await pool.query(
`SELECT id FROM masters WHERE slug=$1`,
[slug]
);

if(!master.rows.length){
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

const contracts = await pool.query(`
SELECT *
FROM contracts
WHERE master_id=$1
ORDER BY created_at DESC
`,[master.rows[0].id]);

res.json({
ok:true,
contracts: contracts.rows
});

}catch(err){

console.error("MASTER_CONTRACT_HISTORY_ERROR",err);

res.status(500).json({
ok:false,
error:"MASTER_CONTRACT_HISTORY_FAILED"
});

}

});

return r;

}