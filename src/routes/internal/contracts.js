import express from "express";

export default function buildContractsRouter(pool, internalReadRateLimit){

const r = express.Router();

/* ============================= */
/* CONTRACT ENGINE               */
/* ============================= */

/* CREATE CONTRACT */
r.post("/contracts", async (req,res)=>{

const {
salon_id,
master_id,
terms_json,
effective_from
} = req.body;

try{

if(!salon_id || !master_id){
return res.status(400).json({ok:false,error:"INVALID_CONTRACT_INPUT"});
}

const existing = await pool.query(`
SELECT id
FROM contracts
WHERE salon_id=$1
AND master_id=$2
AND status='active'
LIMIT 1
`,[
salon_id,
master_id
]);

if(existing.rows.length){
return res.status(409).json({
ok:false,
error:"ACTIVE_CONTRACT_EXISTS",
contract_id:existing.rows[0].id
});
}

const contract = await pool.query(`
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
salon_id,
master_id,
terms_json || {},
effective_from || new Date()
]);

res.json({
ok:true,
contract:contract.rows[0]
});

}catch(err){

console.error("CONTRACT_CREATE_ERROR",err);

res.status(500).json({
ok:false,
error:"CONTRACT_CREATE_FAILED"
});

}

});

/* SALON CONTRACTS (ALIAS FOR UI) */
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

const salonId = salon.rows[0].id;

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
`,[salonId]);

res.json({
ok:true,
contracts:contracts.rows
});

}catch(err){

console.error("SALON_CONTRACTS_FETCH_ERROR",err);

res.status(500).json({
ok:false,
error:"SALON_CONTRACTS_FETCH_FAILED"
});

}

});

/* CREATE CONTRACT FROM SALON SLUG (CABINET API) */
r.post("/salons/:slug/contracts", async (req,res)=>{

const { slug } = req.params;

const {
master_id,
terms_json,
effective_from
} = req.body;

try{

const salon = await pool.query(
`SELECT id FROM salons WHERE slug=$1`,
[slug]
);

if(!salon.rows.length){
return res.status(404).json({ok:false,error:"SALON_NOT_FOUND"});
}

const salonId = salon.rows[0].id;

if(!master_id){
return res.status(400).json({ok:false,error:"MASTER_ID_REQUIRED"});
}

const existing = await pool.query(`
SELECT id
FROM contracts
WHERE salon_id=$1
AND master_id=$2
AND status='active'
LIMIT 1
`,[
salonId,
master_id
]);

if(existing.rows.length){
return res.status(409).json({
ok:false,
error:"ACTIVE_CONTRACT_EXISTS",
contract_id:existing.rows[0].id
});
}

const contract = await pool.query(`
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
terms_json || {},
effective_from || new Date()
]);

res.json({
ok:true,
contract:contract.rows[0]
});

}catch(err){

console.error("SALON_CONTRACT_CREATE_ERROR",err);

res.status(500).json({
ok:false,
error:"SALON_CONTRACT_CREATE_FAILED"
});

}

});

/* CONTRACTS BY MASTER */
r.get("/contracts/master/:slug", internalReadRateLimit, async (req,res)=>{

const { slug } = req.params;

try{

const master = await pool.query(
`SELECT id FROM masters WHERE slug=$1`,
[slug]
);

if(!master.rows.length){
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

const masterId = master.rows[0].id;

const contracts = await pool.query(`
SELECT *
FROM contracts
WHERE master_id=$1
AND archived_at IS NULL
ORDER BY created_at DESC
`,[masterId]);

res.json({
ok:true,
contracts:contracts.rows
});

}catch(err){

console.error("CONTRACTS_FETCH_MASTER_ERROR",err);

res.status(500).json({
ok:false,
error:"CONTRACTS_FETCH_FAILED"
});

}

});

/* ACCEPT CONTRACT */
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

/* deactivate previous active contract */

await db.query(`
UPDATE contracts
SET status='archived',
archived_at=NOW()
WHERE salon_id=$1
AND master_id=$2
AND status='active'
AND id<>$3
`,[
salonId,
masterId,
id
]);

/* activate new contract */

const activated = await db.query(`
UPDATE contracts
SET status='active',
archived_at=NULL
WHERE id=$1
RETURNING *
`,[id]);

await db.query("COMMIT");

res.json({
ok:true,
contract:activated.rows[0]
});

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

/* ARCHIVE CONTRACT */
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

res.json({
ok:true,
contract:contract.rows[0]
});

}catch(err){

console.error("CONTRACT_ARCHIVE_ERROR",err);

res.status(500).json({
ok:false,
error:"CONTRACT_ARCHIVE_FAILED"
});

}

});

return r;

}