import express from "express";

function normalizeContractText(value, fallback){
const text = String(value ?? '').trim();
return text || fallback;
}

function normalizeContractNumber(value, errorCode){
const n = Number(value);
if(!Number.isFinite(n)){
throw new Error(errorCode);
}
return n;
}

function normalizePositiveAmount(value, errorCode){
const n = normalizeContractNumber(value, errorCode);
if(n <= 0){
throw new Error(errorCode);
}
return n;
}

function normalizeNonNegativeNumber(value, errorCode, fallback = 0){
const n = normalizeContractNumber(value ?? fallback, errorCode);
if(n < 0){
throw new Error(errorCode);
}
return n;
}

function normalizeCurrency(terms){
return normalizeContractText(terms?.currency, 'KGS').toUpperCase();
}

function normalizePayoutSchedule(terms){
return normalizeContractText(terms?.payout_schedule, 'manual');
}

function validatePercentSplit(terms){
const master = normalizeNonNegativeNumber(terms?.master_percent, 'INVALID_PERCENT_NUMBER');
const salon = normalizeNonNegativeNumber(terms?.salon_percent, 'INVALID_PERCENT_NUMBER');
const platform = normalizeNonNegativeNumber(terms?.platform_percent, 'INVALID_PERCENT_NUMBER');
const total = master + salon + platform;
if(Math.abs(total - 100) > 0.000001){
throw new Error('INVALID_PERCENT_TOTAL');
}
return {
master_percent: master,
salon_percent: salon,
platform_percent: platform
};
}

function normalizeTermsObject(terms){
if(typeof terms === 'string'){
try{
return JSON.parse(terms || '{}');
}catch{
throw new Error('INVALID_TERMS_JSON');
}
}
if(!terms || typeof terms !== 'object' || Array.isArray(terms)){
throw new Error('INVALID_TERMS_JSON');
}
return terms;
}

function validateTerms(terms){
terms = normalizeTermsObject(terms || {});
const model = normalizeContractText(terms.model, 'percentage').toLowerCase();

if(!['percentage','fixed_rent','salary','hybrid'].includes(model)){
throw new Error('INVALID_CONTRACT_MODEL');
}

if(model === 'percentage'){
const split = validatePercentSplit(terms);
return {
...terms,
model: 'percentage',
...split,
payout_schedule: normalizePayoutSchedule(terms),
...(terms.currency ? { currency: normalizeCurrency(terms) } : {})
};
}

if(model === 'fixed_rent'){
return {
...terms,
model: 'fixed_rent',
rent_amount: normalizePositiveAmount(terms.rent_amount, 'INVALID_RENT_AMOUNT'),
rent_period: normalizeContractText(terms.rent_period, 'monthly'),
currency: normalizeCurrency(terms),
payout_schedule: normalizePayoutSchedule(terms),
settlement_mode: normalizeContractText(terms.settlement_mode, 'accrued')
};
}

if(model === 'salary'){
return {
...terms,
model: 'salary',
salary_amount: normalizePositiveAmount(terms.salary_amount, 'INVALID_SALARY_AMOUNT'),
salary_period: normalizeContractText(terms.salary_period, 'monthly'),
currency: normalizeCurrency(terms),
payout_schedule: normalizePayoutSchedule(terms),
bonus_percent: normalizeNonNegativeNumber(terms.bonus_percent, 'INVALID_BONUS_PERCENT', 0)
};
}

const baseType = normalizeContractText(terms.base_type, 'salary').toLowerCase();
if(!['salary','fixed_rent'].includes(baseType)){
throw new Error('INVALID_HYBRID_BASE_TYPE');
}

return {
...terms,
model: 'hybrid',
base_type: baseType,
base_amount: normalizePositiveAmount(terms.base_amount, 'INVALID_HYBRID_BASE_AMOUNT'),
base_period: normalizeContractText(terms.base_period, 'monthly'),
currency: normalizeCurrency(terms),
...validatePercentSplit(terms),
payout_schedule: normalizePayoutSchedule(terms)
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