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

function safeInt(value){
const n = Number(value);
if(!Number.isInteger(n) || n <= 0){
return null;
}
return n;
}

function getIdentitySalonIds(identity){
const ids = new Set();

if(Array.isArray(identity?.salons)){
for(const item of identity.salons){
if(item && typeof item === "object"){
const id = safeInt(item.id ?? item.salon_id ?? item.owner_id);
if(id){
ids.add(id);
}
continue;
}

const id = safeInt(item);
if(id){
ids.add(id);
}
}
}

if(Array.isArray(identity?.ownership)){
for(const item of identity.ownership){
if(!item || typeof item !== "object"){
continue;
}

const ownerType = String(item.owner_type || item.type || "").trim();
if(ownerType !== "salon"){
continue;
}

const id = safeInt(item.owner_id ?? item.salon_id ?? item.id);
if(id){
ids.add(id);
}
}
}

return ids;
}

function hasSalonOwnership(req, salonId){
if(req?.auth?.role === "system"){
return true;
}

const targetSalonId = safeInt(salonId);
if(!targetSalonId){
return false;
}

const identitySalonIds = getIdentitySalonIds(req?.identity);
return identitySalonIds.has(targetSalonId);
}

function getIdentityMasterIds(identity){
const ids = new Set();

if(Array.isArray(identity?.masters)){
for(const item of identity.masters){
if(item && typeof item === "object"){
const id = safeInt(item.id ?? item.master_id ?? item.owner_id);
if(id){
ids.add(id);
}
continue;
}

const id = safeInt(item);
if(id){
ids.add(id);
}
}
}

if(Array.isArray(identity?.ownership)){
for(const item of identity.ownership){
if(!item || typeof item !== "object"){
continue;
}

const ownerType = String(item.owner_type || item.type || "").trim();
if(ownerType !== "master"){
continue;
}

const id = safeInt(item.owner_id ?? item.master_id ?? item.id);
if(id){
ids.add(id);
}
}
}

return ids;
}

function hasMasterOwnership(req, masterId){
if(req?.auth?.role === "system"){
return true;
}

const targetMasterId = safeInt(masterId);
if(!targetMasterId){
return false;
}

const identityMasterIds = getIdentityMasterIds(req?.identity);
return identityMasterIds.has(targetMasterId);
}

function parseQueryDate(value, errorCode){
const raw = String(value ?? '').trim();
if(!raw){
return null;
}

const date = new Date(raw);
if(Number.isNaN(date.getTime())){
throw new Error(errorCode);
}

return date.toISOString();
}

function parseStatusFilter(value){
const raw = String(value ?? '').trim();
if(!raw){
return [];
}

return raw
.split(',')
.map((item) => item.trim())
.filter(Boolean);
}

function buildRentObligationsSummary(rows){
const summary = {
open_count: 0,
paid_count: 0,
cancelled_count: 0,
voided_count: 0,
open_amount: 0,
paid_amount: 0
};

for(const row of rows){
const amount = Number(row.amount || 0);
const status = String(row.status || '').toLowerCase();

if(status === 'open'){
summary.open_count += 1;
summary.open_amount += amount;
continue;
}

if(status === 'paid'){
summary.paid_count += 1;
summary.paid_amount += amount;
continue;
}

if(status === 'cancelled'){
summary.cancelled_count += 1;
continue;
}

if(status === 'voided'){
summary.voided_count += 1;
}
}

return summary;
}

async function fetchRentObligationsByOwner({
db,
ownerColumn,
ownerId,
filters = {}
}){
const values = [ownerId];
const clauses = [`${ownerColumn} = $1`];

const statusList = parseStatusFilter(filters.status);
if(statusList.length){
values.push(statusList);
clauses.push(`status = ANY($${values.length}::text[])`);
}

const from = parseQueryDate(filters.from, 'INVALID_FROM_DATE');
if(from){
values.push(from);
clauses.push(`period_start >= $${values.length}::timestamptz`);
}

const to = parseQueryDate(filters.to, 'INVALID_TO_DATE');
if(to){
values.push(to);
clauses.push(`period_start <= $${values.length}::timestamptz`);
}

const query = `
SELECT
id,
contract_id,
contract_salon_id,
contract_master_id,
salon_id,
master_id,
period_start,
period_end,
amount,
currency,
status,
due_at,
paid_at,
created_at,
updated_at,
cancelled_at,
metadata
FROM public.contract_rent_obligations
WHERE ${clauses.join(' AND ')}
ORDER BY due_at ASC NULLS LAST, period_start DESC
`;

const result = await db.query(query, values);
return result.rows;
}

function resolveFixedRentPeriodStart(contract){
const rawStart = contract?.effective_from || contract?.created_at || null;
const startDate = rawStart ? new Date(rawStart) : new Date();

if(Number.isNaN(startDate.getTime())){
const err = new Error("FIXED_RENT_PERIOD_NOT_SUPPORTED");
err.code = "FIXED_RENT_PERIOD_NOT_SUPPORTED";
throw err;
}

return startDate.toISOString();
}

async function resolveFixedRentOwnership(db, contract){
const salonTextId = String(contract?.salon_id ?? "").trim();
const masterTextId = String(contract?.master_id ?? "").trim();
const salonNumericId = safeInt(salonTextId);
const masterNumericId = safeInt(masterTextId);

if(!salonNumericId || !masterNumericId){
const err = new Error("FIXED_RENT_PARTIES_RESOLVE_FAILED");
err.code = "FIXED_RENT_PARTIES_RESOLVE_FAILED";
throw err;
}

const salon = await db.query(
`SELECT id
 FROM salons
 WHERE id=$1
 LIMIT 1`,
[salonNumericId]
);

const master = await db.query(
`SELECT id
 FROM masters
 WHERE id=$1
 LIMIT 1`,
[masterNumericId]
);

if(!salon.rows.length || !master.rows.length){
const err = new Error("FIXED_RENT_PARTIES_RESOLVE_FAILED");
err.code = "FIXED_RENT_PARTIES_RESOLVE_FAILED";
throw err;
}

return {
contract_salon_id: salonTextId,
contract_master_id: masterTextId,
salon_id: salon.rows[0].id,
master_id: master.rows[0].id
};
}

async function upsertFixedRentObligation(db, contract, source, createdByFlow){
if(String(contract?.terms_json?.model || "").trim().toLowerCase() !== "fixed_rent"){
const err = new Error("FIXED_RENT_MODEL_REQUIRED");
err.code = "FIXED_RENT_MODEL_REQUIRED";
throw err;
}

const rentPeriod = normalizeContractText(contract?.terms_json?.rent_period, "monthly").toLowerCase();
if(rentPeriod !== "monthly"){
const err = new Error("FIXED_RENT_PERIOD_NOT_SUPPORTED");
err.code = "FIXED_RENT_PERIOD_NOT_SUPPORTED";
throw err;
}

const amount = normalizePositiveAmount(contract?.terms_json?.rent_amount, "FIXED_RENT_AMOUNT_INVALID");
const currency = normalizeCurrency(contract?.terms_json || {});
const ownership = await resolveFixedRentOwnership(db, contract);
const periodStart = resolveFixedRentPeriodStart(contract);
const metadata = JSON.stringify({
source,
rent_period: rentPeriod,
created_by_flow: createdByFlow
});

const inserted = await db.query(
`INSERT INTO public.contract_rent_obligations (
contract_id,
contract_salon_id,
contract_master_id,
salon_id,
master_id,
period_start,
period_end,
amount,
currency,
status,
due_at,
metadata
)
VALUES (
$1,
$2,
$3,
$4,
$5,
$6::timestamptz,
$6::timestamptz + interval '1 month',
$7,
$8,
'open',
$6::timestamptz,
$9::jsonb
)
ON CONFLICT (contract_id, period_start, period_end)
DO NOTHING
RETURNING *
`,
[
contract.id,
ownership.contract_salon_id,
ownership.contract_master_id,
ownership.salon_id,
ownership.master_id,
periodStart,
amount,
currency,
metadata
]
);

if(inserted.rows.length){
return inserted.rows[0];
}

const existing = await db.query(
`SELECT
id,
contract_id,
contract_salon_id,
contract_master_id,
salon_id,
master_id,
period_start,
period_end,
amount,
currency,
status,
due_at,
paid_at,
created_at,
updated_at,
cancelled_at,
metadata
FROM public.contract_rent_obligations
WHERE contract_id=$1
AND period_start=$2::timestamptz
AND period_end=($2::timestamptz + interval '1 month')
LIMIT 1`,
[contract.id, periodStart]
);

return existing.rows[0] || null;
}

async function activateFixedRentContract(db, contract, source){
await db.query(
`UPDATE contracts
 SET status='archived',
 archived_at=NOW()
 WHERE salon_id=$1
 AND master_id=$2
 AND status='active'
 AND id<>$3`,
[contract.salon_id, contract.master_id, contract.id]
);

const activated = await db.query(
`UPDATE contracts
 SET status='active',
 archived_at=NULL
 WHERE id=$1
 RETURNING *`,
[contract.id]
);

const activeContract = activated.rows[0] || contract;
const obligation = await upsertFixedRentObligation(
db,
activeContract,
source,
source === "fixed_rent_accept" ? "contract_accept" : source
);

return {
contract: activeContract,
obligation
};
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

const currentContract = contract.rows[0];
const salonId = currentContract.salon_id;
const masterId = currentContract.master_id;
const acceptModel = String(currentContract.terms_json?.model || "percentage").toLowerCase();

if(acceptModel === "fixed_rent"){
try{
const activated = await activateFixedRentContract(db, currentContract, "fixed_rent_accept");

await db.query("COMMIT");

return res.json({
ok:true,
contract:activated.contract,
obligation:activated.obligation
});
}catch(err){
try{ await db.query("ROLLBACK"); }catch(e){}

if(err.message === "FIXED_RENT_AMOUNT_INVALID"
|| err.message === "FIXED_RENT_PARTIES_RESOLVE_FAILED"
|| err.message === "FIXED_RENT_PERIOD_NOT_SUPPORTED"
|| err.message === "FIXED_RENT_MODEL_REQUIRED"){
return res.status(400).json({
ok:false,
error:err.message
});
}

console.error("CONTRACT_ACCEPT_FIXED_RENT_ERROR", err);

return res.status(500).json({
ok:false,
error:"CONTRACT_ACCEPT_FAILED"
});
}
}

if(acceptModel !== "percentage"){
await db.query("ROLLBACK");
return res.status(409).json({
ok:false,
error:"CONTRACT_ACCEPT_MODEL_NOT_MONEY_READY",
message:"Активация расчётов пока доступна только для процентной модели. Договор сохранён, но salary/fixed_rent/hybrid не переводятся в активный расчётный контур до расширения money-core.",
model:acceptModel
});
}

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

/* RENT OBLIGATIONS FOR SALON */
r.get("/salons/:slug/rent-obligations", internalReadRateLimit, async (req,res)=>{

const { slug } = req.params;

try{

const salon = await pool.query(
`SELECT id
 FROM salons
 WHERE slug=$1
 LIMIT 1`,
[slug]
);

if(!salon.rows.length){
return res.status(404).json({ ok:false, error:"SALON_NOT_FOUND" });
}

if(!hasSalonOwnership(req, salon.rows[0].id)){
return res.status(403).json({ ok:false, error:"FORBIDDEN" });
}

const obligations = await fetchRentObligationsByOwner({
db: pool,
ownerColumn: 'salon_id',
ownerId: salon.rows[0].id,
filters: req.query || {}
});

return res.json({
ok:true,
obligations,
summary: buildRentObligationsSummary(obligations)
});

}catch(err){

if(err.message === 'INVALID_FROM_DATE' || err.message === 'INVALID_TO_DATE'){
return res.status(400).json({
ok:false,
error:err.message
});
}

console.error("SALON_RENT_OBLIGATIONS_FETCH_ERROR", err);

return res.status(500).json({
ok:false,
error:"RENT_OBLIGATIONS_FETCH_FAILED"
});

}

});

/* RENT OBLIGATIONS FOR MASTER */
r.get("/masters/:slug/rent-obligations", internalReadRateLimit, async (req,res)=>{

const { slug } = req.params;

try{

const master = await pool.query(
`SELECT id
 FROM masters
 WHERE slug=$1
 LIMIT 1`,
[slug]
);

if(!master.rows.length){
return res.status(404).json({ ok:false, error:"MASTER_NOT_FOUND" });
}

if(!hasMasterOwnership(req, master.rows[0].id)){
return res.status(403).json({ ok:false, error:"FORBIDDEN" });
}

const obligations = await fetchRentObligationsByOwner({
db: pool,
ownerColumn: 'master_id',
ownerId: master.rows[0].id,
filters: req.query || {}
});

return res.json({
ok:true,
obligations,
summary: buildRentObligationsSummary(obligations)
});

}catch(err){

if(err.message === 'INVALID_FROM_DATE' || err.message === 'INVALID_TO_DATE'){
return res.status(400).json({
ok:false,
error:err.message
});
}

console.error("MASTER_RENT_OBLIGATIONS_FETCH_ERROR", err);

return res.status(500).json({
ok:false,
error:"RENT_OBLIGATIONS_FETCH_FAILED"
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
