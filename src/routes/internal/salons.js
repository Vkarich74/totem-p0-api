import express from "express";

export default function buildSalonsRouter(pool, internalReadRateLimit){

const r = express.Router();


function safeInt(v){
const n = Number(v);
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

async function getSalonBillingAccess(db, salonId){
const billing = await getSalonBillingRow(db, salonId, false);
return buildBillingAccessPayload(billing);
}

async function ensureSalonWriteAllowed(db, salonId){
const access = await getSalonBillingAccess(db, salonId);

if(!access.can_write){
const err = new Error("BILLING_BLOCKED");
err.code = "BILLING_BLOCKED";
err.access = {
exists:access.exists,
subscription_status:access.subscription_status,
access_state:access.access_state,
can_write:access.can_write,
can_withdraw:access.can_withdraw,
billing:access.billing
};
throw err;
}

return access;
}



async function getSystemWalletId(db){
const wallet = await db.query(`
SELECT id
FROM totem_test.wallets
WHERE owner_type='system'
ORDER BY id ASC
LIMIT 1
`);

if(!wallet.rows.length){
const err = new Error("SYSTEM_WALLET_NOT_FOUND");
err.code = "SYSTEM_WALLET_NOT_FOUND";
throw err;
}

return wallet.rows[0].id;
}

async function getSalonWalletRowForCharge(db, salonId){
const wallet = await db.query(`
SELECT
id,
owner_type,
owner_id,
currency
FROM totem_test.wallets
WHERE owner_type='salon'
AND owner_id=$1
FOR UPDATE
LIMIT 1
`,[salonId]);

if(!wallet.rows.length){
const err = new Error("SALON_WALLET_NOT_FOUND");
err.code = "SALON_WALLET_NOT_FOUND";
throw err;
}

return wallet.rows[0];
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

async function getSalonBySlug(dbOrPool, slug){
const salon = await dbOrPool.query(`
SELECT
id,
name,
slug
FROM salons
WHERE slug=$1
LIMIT 1
`,[slug]);

if(!salon.rows.length){
return null;
}

return salon.rows[0];
}


function buildBillingAccessPayload(billing){
if(!billing){
return {
exists:false,
subscription_status:"active",
access_state:"active",
can_write:true,
can_withdraw:true,
billing:null
};
}

const status = billing.subscription_status || "active";
const accessState = resolveBillingAccessState(billing);
const canWrite = accessState === "active" || accessState === "grace";
const canWithdraw = accessState === "active";

return {
exists:true,
subscription_status:status,
access_state:accessState,
can_write:canWrite,
can_withdraw:canWithdraw,
billing
};
}

async function getSalonBillingRow(dbOrPool, salonId, forUpdate=false){
const query = `
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
WHERE owner_type='salon'
AND owner_id=$1
${forUpdate ? "FOR UPDATE" : ""}
LIMIT 1
`;
const billing = await dbOrPool.query(query,[salonId]);
return billing.rows[0] || null;
}

function resolveBillingAccessState(billing){
if(!billing){
return "active";
}

if(billing.blocked_at){
return "blocked";
}

const now = Date.now();
const nextChargeAt = billing.next_charge_at ? new Date(billing.next_charge_at).getTime() : null;
const graceUntil = billing.grace_until ? new Date(billing.grace_until).getTime() : null;

if(nextChargeAt && nextChargeAt < now){
if(graceUntil && graceUntil >= now){
return "grace";
}
return "overdue";
}

return billing.subscription_status || "active";
}

/* SALON SUBSCRIPTION MANUAL CHARGE */
r.post("/salons/:slug/subscription/charge", async (req,res)=>{

const { slug } = req.params;
const db = await pool.connect();

try{

await db.query("BEGIN");

const salon = await db.query(
`SELECT id,name,slug
FROM salons
WHERE slug=$1
LIMIT 1`,
[slug]
);

if(!salon.rows.length){
await db.query("ROLLBACK");
return res.status(404).json({ok:false,error:"SALON_NOT_FOUND"});
}

const salonId = salon.rows[0].id;

if(!hasSalonOwnership(req, salonId)){
await db.query("ROLLBACK");
return res.status(403).json({ok:false,error:"FORBIDDEN"});
}

const billing = await getSalonBillingRow(db, salonId, true);

if(!billing){
await db.query("ROLLBACK");
return res.status(404).json({ok:false,error:"BILLING_NOT_FOUND"});
}

if(billing.subscription_status !== "active"){
await db.query("ROLLBACK");
return res.status(400).json({ok:false,error:"SUBSCRIPTION_NOT_ACTIVE"});
}

const amount = Number(billing.amount);
if(!Number.isFinite(amount) || amount <= 0){
await db.query("ROLLBACK");
return res.status(400).json({ok:false,error:"SUBSCRIPTION_AMOUNT_INVALID"});
}

const salonWallet = await getSalonWalletRowForCharge(db, salonId);
const salonWalletId = salonWallet.id;
const salonBalance = await getWalletBalanceById(db, salonWalletId);

if(salonBalance < amount){
await db.query("ROLLBACK");
return res.status(400).json({
ok:false,
error:"INSUFFICIENT_WALLET_BALANCE",
balance:salonBalance,
amount
});
}

if(billing.next_charge_at && new Date(billing.next_charge_at).getTime() > Date.now()){
await db.query("ROLLBACK");
return res.status(409).json({
ok:false,
error:"SUBSCRIPTION_ALREADY_ACTIVE_FOR_CURRENT_PERIOD",
next_charge_at:billing.next_charge_at,
last_charge_at:billing.last_charge_at
});
}

const systemWalletId = await getSystemWalletId(db);

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
salonWalletId,
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

await db.query(`
UPDATE public.billing_subscriptions
SET
last_charge_at=NOW(),
last_charge_status='success',
current_period_start=COALESCE(next_charge_at, NOW()),
current_period_end=COALESCE(next_charge_at, NOW()) + (COALESCE(subscription_period_days,30) || ' days')::interval,
next_charge_at=COALESCE(next_charge_at, NOW()) + (COALESCE(subscription_period_days,30) || ' days')::interval,
updated_at=NOW()
WHERE id=$1
`,[billing.id]);

await db.query("COMMIT");

const access = await getSalonBillingAccess(pool, salonId);

return res.json({
ok:true,
charged:true,
owner_type:"salon",
owner_id:salonId,
amount,
currency:billing.currency || "KGS",
reference_type:"subscription",
reference_id:String(billing.id),
billing_access:{
exists:access.exists,
subscription_status:access.subscription_status,
access_state:access.access_state,
can_write:access.can_write,
can_withdraw:access.can_withdraw,
billing:access.billing
}
});

}catch(err){

try{ await db.query("ROLLBACK"); }catch(e){}

if(err.code === "SYSTEM_WALLET_NOT_FOUND"){
return res.status(500).json({
ok:false,
error:"SYSTEM_WALLET_NOT_FOUND"
});
}

if(err.code === "SALON_WALLET_NOT_FOUND"){
return res.status(404).json({
ok:false,
error:"SALON_WALLET_NOT_FOUND"
});
}

console.error("SALON_SUBSCRIPTION_CHARGE_ERROR",err);

return res.status(500).json({
ok:false,
error:"SALON_SUBSCRIPTION_CHARGE_FAILED"
});

}finally{

db.release();

}

});


/* SALON BILLING */
r.get("/salons/:slug/billing", internalReadRateLimit, async (req,res)=>{

const { slug } = req.params;

try{

const salon = await getSalonBySlug(pool, slug);

if(!salon){
return res.status(404).json({ok:false,error:"SALON_NOT_FOUND"});
}

if(!hasSalonOwnership(req, salon.id)){
return res.status(403).json({ok:false,error:"FORBIDDEN"});
}

const access = await getSalonBillingAccess(pool, salon.id);

return res.json({
ok:true,
owner_type:"salon",
owner_id:salon.id,
owner_slug:salon.slug,
exists:access.exists,
subscription_status:access.subscription_status,
access_state:access.access_state,
can_write:access.can_write,
can_withdraw:access.can_withdraw,
billing:access.billing
});

}catch(err){

console.error("SALON_BILLING_FETCH_ERROR",err);

return res.status(500).json({
ok:false,
error:"SALON_BILLING_FETCH_FAILED"
});

}

});

r.post("/salons/:slug/billing/block", async (req,res)=>{

const { slug } = req.params;
const db = await pool.connect();

try{

await db.query("BEGIN");

const salon = await getSalonBySlug(db, slug);

if(!salon){
await db.query("ROLLBACK");
return res.status(404).json({ok:false,error:"SALON_NOT_FOUND"});
}

if(!hasSalonOwnership(req, salon.id)){
await db.query("ROLLBACK");
return res.status(403).json({ok:false,error:"FORBIDDEN"});
}

const billing = await getSalonBillingRow(db, salon.id, true);

if(!billing){
await db.query("ROLLBACK");
return res.status(404).json({ok:false,error:"BILLING_NOT_FOUND"});
}

await db.query(`
UPDATE public.billing_subscriptions
SET
blocked_at=NOW(),
subscription_status='blocked',
updated_at=NOW()
WHERE id=$1
`,[billing.id]);

await db.query("COMMIT");

const access = await getSalonBillingAccess(pool, salon.id);

return res.json({
ok:true,
blocked:true,
billing_access:{
exists:access.exists,
subscription_status:access.subscription_status,
access_state:resolveBillingAccessState(access.billing),
can_write:access.can_write,
can_withdraw:access.can_withdraw,
billing:access.billing
}
});

}catch(err){

try{ await db.query("ROLLBACK"); }catch(e){}

console.error("SALON_BILLING_BLOCK_ERROR",err);

return res.status(500).json({
ok:false,
error:"SALON_BILLING_BLOCK_FAILED"
});

}finally{

db.release();

}

});

r.post("/salons/:slug/billing/unblock", async (req,res)=>{

const { slug } = req.params;
const db = await pool.connect();

try{

await db.query("BEGIN");

const salon = await getSalonBySlug(db, slug);

if(!salon){
await db.query("ROLLBACK");
return res.status(404).json({ok:false,error:"SALON_NOT_FOUND"});
}

if(!hasSalonOwnership(req, salon.id)){
await db.query("ROLLBACK");
return res.status(403).json({ok:false,error:"FORBIDDEN"});
}

const billing = await getSalonBillingRow(db, salon.id, true);

if(!billing){
await db.query("ROLLBACK");
return res.status(404).json({ok:false,error:"BILLING_NOT_FOUND"});
}

await db.query(`
UPDATE public.billing_subscriptions
SET
blocked_at=NULL,
subscription_status='active',
updated_at=NOW()
WHERE id=$1
`,[billing.id]);

await db.query("COMMIT");

const access = await getSalonBillingAccess(pool, salon.id);

return res.json({
ok:true,
blocked:false,
billing_access:{
exists:access.exists,
subscription_status:access.subscription_status,
access_state:resolveBillingAccessState(access.billing),
can_write:access.can_write,
can_withdraw:access.can_withdraw,
billing:access.billing
}
});

}catch(err){

try{ await db.query("ROLLBACK"); }catch(e){}

console.error("SALON_BILLING_UNBLOCK_ERROR",err);

return res.status(500).json({
ok:false,
error:"SALON_BILLING_UNBLOCK_FAILED"
});

}finally{

db.release();

}

});


/* SALON ROOT */
r.get("/salons/:slug", internalReadRateLimit, async (req,res)=>{

const { slug } = req.params;

try{

const salon = await pool.query(
`SELECT id,name,slug FROM salons WHERE slug=$1`,
[slug]
);

if(!salon.rows.length){
return res.status(404).json({ok:false,error:"SALON_NOT_FOUND"});
}

if(!hasSalonOwnership(req, salon.rows[0].id)){
return res.status(403).json({ok:false,error:"FORBIDDEN"});
}

const access = await getSalonBillingAccess(pool, salon.rows[0].id);

res.json({
ok:true,
salon:salon.rows[0],
billing_access:{
exists:access.exists,
subscription_status:access.subscription_status,
access_state:access.access_state,
can_write:access.can_write,
can_withdraw:access.can_withdraw,
billing:access.billing
}
});

}catch(err){

console.error("SALON_FETCH_ERROR",err);

res.status(500).json({
ok:false,
error:"SALON_FETCH_FAILED"
});

}

});

/* SALON MASTERS */
r.get("/salons/:slug/masters", internalReadRateLimit, async (req,res)=>{

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

if(!hasSalonOwnership(req, salonId)){
return res.status(403).json({ok:false,error:"FORBIDDEN"});
}

const masters = await pool.query(`
SELECT
m.id,
m.name,
m.slug,
ms.status,
ms.activated_at,
ms.fired_at,
ms.updated_at
FROM masters m
JOIN master_salon ms ON ms.master_id=m.id
WHERE ms.salon_id=$1
AND ms.status IN ('active','pending','fired')
ORDER BY m.id ASC
`,[salonId]);

res.json({
ok:true,
masters:masters.rows
});

}catch(err){

console.error("SALON_MASTERS_ERROR",err);

res.status(500).json({
ok:false,
error:"SALON_MASTERS_FETCH_FAILED"
});

}

});

/* ACTIVATE SALON MASTER */
r.post("/salons/:slug/masters/:masterId/activate", async (req,res)=>{

const { slug, masterId } = req.params;
const db = await pool.connect();

try{

await db.query("BEGIN");

const salon = await db.query(
`SELECT id,name,slug
FROM salons
WHERE slug=$1
LIMIT 1`,
[slug]
);

if(!salon.rows.length){
await db.query("ROLLBACK");
return res.status(404).json({ok:false,error:"SALON_NOT_FOUND"});
}

const salonId = salon.rows[0].id;

if(!hasSalonOwnership(req, salonId)){
await db.query("ROLLBACK");
return res.status(403).json({ok:false,error:"FORBIDDEN"});
}

const access = await ensureSalonWriteAllowed(db, salonId);

const master = await db.query(
`SELECT id,name,slug
FROM masters
WHERE id=$1
LIMIT 1`,
[masterId]
);

if(!master.rows.length){
await db.query("ROLLBACK");
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

const existing = await db.query(`
SELECT
id,
status,
activated_at,
fired_at,
updated_at
FROM master_salon
WHERE salon_id=$1
AND master_id=$2
ORDER BY id DESC
FOR UPDATE
LIMIT 1
`,[
salonId,
masterId
]);

let relation;

if(existing.rows.length){

relation = await db.query(`
UPDATE master_salon
SET
status='active',
activated_at=COALESCE(activated_at, NOW()),
fired_at=NULL,
updated_at=NOW()
WHERE id=$1
RETURNING id,salon_id,master_id,status,activated_at,fired_at,updated_at
`,[existing.rows[0].id]);

}else{

relation = await db.query(`
INSERT INTO master_salon(
salon_id,
master_id,
status,
activated_at,
updated_at
)
VALUES($1,$2,'active',NOW(),NOW())
RETURNING id,salon_id,master_id,status,activated_at,fired_at,updated_at
`,[
salonId,
masterId
]);

}

await db.query("COMMIT");

return res.json({
ok:true,
link:{
id:relation.rows[0].id,
salon_id:relation.rows[0].salon_id,
salon_slug:salon.rows[0].slug,
salon_name:salon.rows[0].name,
master_id:relation.rows[0].master_id,
master_slug:master.rows[0].slug,
master_name:master.rows[0].name,
status:relation.rows[0].status,
activated_at:relation.rows[0].activated_at,
fired_at:relation.rows[0].fired_at,
updated_at:relation.rows[0].updated_at
},
billing_access:{
exists:access.exists,
subscription_status:access.subscription_status,
access_state:access.access_state,
can_write:access.can_write,
can_withdraw:access.can_withdraw,
billing:access.billing
}
});

}catch(err){

try{ await db.query("ROLLBACK"); }catch(e){}

if(err.code === "BILLING_BLOCKED"){
return res.status(403).json({
ok:false,
error:"BILLING_BLOCKED",
billing_access:{
exists:err.access.exists,
subscription_status:err.access.subscription_status,
access_state:err.access.access_state,
can_write:err.access.can_write,
can_withdraw:err.access.can_withdraw,
billing:err.access.billing
}
});
}

console.error("SALON_MASTER_ACTIVATE_ERROR",err);

return res.status(500).json({
ok:false,
error:"SALON_MASTER_ACTIVATE_FAILED"
});

}finally{

db.release();

}

});

/* SALON SERVICES */
r.get("/salons/:slug/services", internalReadRateLimit, async (req,res)=>{

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

if(!hasSalonOwnership(req, salonId)){
return res.status(403).json({ok:false,error:"FORBIDDEN"});
}

const services = await pool.query(`
SELECT
sms.id,
sms.salon_id,
sms.master_id,
m.slug AS master_slug,
m.name AS master_name,
sms.service_pk,
s.service_id AS catalog_service_id,
s.name,
sms.price,
sms.duration_min,
sms.active
FROM salon_master_services sms
JOIN services s ON s.id=sms.service_pk
LEFT JOIN masters m ON m.id=sms.master_id
WHERE sms.salon_id=$1
ORDER BY sms.id DESC
`,[salonId]);

return res.json({
ok:true,
services:services.rows
});

}catch(err){

console.error("SALON_SERVICES_FETCH_ERROR",err);

return res.status(500).json({
ok:false,
error:"SALON_SERVICES_FETCH_FAILED"
});

}

});

/* SALON TAKE MASTER SERVICE */
r.post("/salons/:slug/services", async (req,res)=>{

const { slug } = req.params;
const { master_id, service_pk, price, duration_min, active } = req.body;

const db = await pool.connect();

try{

await db.query("BEGIN");

const salon = await db.query(
`SELECT id FROM salons WHERE slug=$1`,
[slug]
);

if(!salon.rows.length){
await db.query("ROLLBACK");
return res.status(404).json({ok:false,error:"SALON_NOT_FOUND"});
}

const salonId = salon.rows[0].id;

if(!hasSalonOwnership(req, salonId)){
await db.query("ROLLBACK");
return res.status(403).json({ok:false,error:"FORBIDDEN"});
}

const access = await ensureSalonWriteAllowed(db, salonId);

const safeMasterId = Number(master_id);
const safeServicePk = Number(service_pk);
const safeActive = typeof active === "boolean" ? active : true;

if(!Number.isInteger(safeMasterId) || safeMasterId <= 0){
await db.query("ROLLBACK");
return res.status(400).json({ok:false,error:"MASTER_ID_REQUIRED"});
}

if(!Number.isInteger(safeServicePk) || safeServicePk <= 0){
await db.query("ROLLBACK");
return res.status(400).json({ok:false,error:"SERVICE_PK_REQUIRED"});
}

const relation = await db.query(`
SELECT
ms.master_id,
m.slug AS master_slug,
m.name AS master_name
FROM master_salon ms
JOIN masters m ON m.id=ms.master_id
WHERE ms.salon_id=$1
AND ms.master_id=$2
AND ms.status='active'
ORDER BY ms.activated_at DESC NULLS LAST, ms.id DESC
LIMIT 1
`,[
salonId,
safeMasterId
]);

if(!relation.rows.length){
await db.query("ROLLBACK");
return res.status(400).json({ok:false,error:"MASTER_NOT_ACTIVE_IN_SALON"});
}

const service = await db.query(`
SELECT
id,
service_id,
name,
duration_min,
price
FROM services
WHERE id=$1
LIMIT 1
`,[safeServicePk]);

if(!service.rows.length){
await db.query("ROLLBACK");
return res.status(404).json({ok:false,error:"SERVICE_NOT_FOUND"});
}

const existing = await db.query(`
SELECT
sms.id,
sms.active
FROM salon_master_services sms
WHERE sms.salon_id=$1
AND sms.master_id=$2
AND sms.service_pk=$3
FOR UPDATE
LIMIT 1
`,[
salonId,
safeMasterId,
safeServicePk
]);

const nextPrice =
  price === undefined ? Number(service.rows[0].price) : Number(price);

const nextDuration =
  duration_min === undefined ? Number(service.rows[0].duration_min) : Number(duration_min);

if(!Number.isFinite(nextPrice) || nextPrice < 0){
await db.query("ROLLBACK");
return res.status(400).json({ok:false,error:"PRICE_INVALID"});
}

if(!Number.isFinite(nextDuration) || nextDuration <= 0){
await db.query("ROLLBACK");
return res.status(400).json({ok:false,error:"DURATION_INVALID"});
}

let linked;

if(existing.rows.length){

linked = await db.query(`
UPDATE salon_master_services
SET
price=$4,
duration_min=$5,
active=$6
WHERE id=$1
RETURNING id,salon_id,master_id,service_pk,price,duration_min,active
`,[
existing.rows[0].id,
salonId,
safeMasterId,
nextPrice,
nextDuration,
safeActive
]);

}else{

linked = await db.query(`
INSERT INTO salon_master_services(
salon_id,
master_id,
service_pk,
price,
duration_min,
active
)
VALUES($1,$2,$3,$4,$5,$6)
RETURNING id,salon_id,master_id,service_pk,price,duration_min,active
`,[
salonId,
safeMasterId,
safeServicePk,
nextPrice,
nextDuration,
safeActive
]);

}

await db.query("COMMIT");

return res.json({
ok:true,
service:{
id:linked.rows[0].id,
salon_id:linked.rows[0].salon_id,
master_id:linked.rows[0].master_id,
master_slug:relation.rows[0].master_slug,
master_name:relation.rows[0].master_name,
service_pk:linked.rows[0].service_pk,
catalog_service_id:service.rows[0].service_id,
name:service.rows[0].name,
price:linked.rows[0].price,
duration_min:linked.rows[0].duration_min,
active:linked.rows[0].active
},
billing_access:{
exists:access.exists,
subscription_status:access.subscription_status,
access_state:access.access_state,
can_write:access.can_write,
can_withdraw:access.can_withdraw,
billing:access.billing
}
});

}catch(err){

try{ await db.query("ROLLBACK"); }catch(e){}

if(err.code === "BILLING_BLOCKED"){
return res.status(403).json({
ok:false,
error:"BILLING_BLOCKED",
billing_access:{
exists:err.access.exists,
subscription_status:err.access.subscription_status,
access_state:err.access.access_state,
can_write:err.access.can_write,
can_withdraw:err.access.can_withdraw,
billing:err.access.billing
}
});
}

console.error("SALON_SERVICE_TAKE_ERROR",err);

return res.status(500).json({
ok:false,
error:"SALON_SERVICE_TAKE_FAILED"
});

}finally{

db.release();

}

});

/* TERMINATE SALON MASTER */
r.post("/salons/:slug/masters/:masterId/terminate", async (req,res)=>{

const { slug, masterId } = req.params;
const db = await pool.connect();

try{

await db.query("BEGIN");

const salon = await db.query(
`SELECT id,name,slug
FROM salons
WHERE slug=$1
LIMIT 1`,
[slug]
);

if(!salon.rows.length){
await db.query("ROLLBACK");
return res.status(404).json({ok:false,error:"SALON_NOT_FOUND"});
}

const salonId = salon.rows[0].id;

if(!hasSalonOwnership(req, salonId)){
await db.query("ROLLBACK");
return res.status(403).json({ok:false,error:"FORBIDDEN"});
}

const access = await ensureSalonWriteAllowed(db, salonId);

const master = await db.query(
`SELECT id,name,slug
FROM masters
WHERE id=$1
LIMIT 1`,
[masterId]
);

if(!master.rows.length){
await db.query("ROLLBACK");
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

const relation = await db.query(`
SELECT
id,
status,
fired_at
FROM master_salon
WHERE salon_id=$1
AND master_id=$2
FOR UPDATE
LIMIT 1
`,[
salonId,
masterId
]);

if(!relation.rows.length){
await db.query("ROLLBACK");
return res.status(404).json({ok:false,error:"MASTER_SALON_LINK_NOT_FOUND"});
}

const contractsArchived = await db.query(`
UPDATE contracts
SET
status='archived',
archived_at=NOW(),
effective_to=COALESCE(effective_to, NOW())
WHERE salon_id=$1
AND master_id=$2
AND status IN ('active','pending')
RETURNING id
`,[
String(salonId),
String(masterId)
]);

const relationUpdated = await db.query(`
UPDATE master_salon
SET
status='fired',
fired_at=COALESCE(fired_at, NOW()),
updated_at=NOW()
WHERE id=$1
RETURNING id,status,fired_at,updated_at
`,[relation.rows[0].id]);

const calendarCanceled = await db.query(`
UPDATE master_calendar
SET
status='canceled',
updated_at=NOW()
WHERE salon_id=$1
AND master_id=$2
AND start_at > NOW()
AND status='reserved'
RETURNING id
`,[
String(salonId),
String(masterId)
]);

const bookingsCanceled = await db.query(`
UPDATE bookings
SET
status='canceled',
canceled_at=NOW(),
cancel_reason='master_terminated'
WHERE salon_id=$1
AND master_id=$2
AND start_at > NOW()
AND status='reserved'
RETURNING id
`,[
salonId,
masterId
]);

const masterServicesDisabled = await db.query(`
UPDATE master_services_v2
SET active=false
WHERE salon_id=$1
AND master_id=$2
AND active=true
RETURNING id
`,[
salonId,
masterId
]);

const salonMasterServicesDisabled = await db.query(`
UPDATE salon_master_services
SET active=false
WHERE salon_id=$1
AND master_id=$2
AND active=true
RETURNING id
`,[
salonId,
masterId
]);

await db.query("COMMIT");

return res.json({
ok:true,
termination:{
salon:{
id:salon.rows[0].id,
name:salon.rows[0].name,
slug:salon.rows[0].slug
},
master:{
id:master.rows[0].id,
name:master.rows[0].name,
slug:master.rows[0].slug
},
master_salon:relationUpdated.rows[0],
contracts_archived:contractsArchived.rowCount,
future_calendar_canceled:calendarCanceled.rowCount,
future_bookings_canceled:bookingsCanceled.rowCount,
master_services_disabled:masterServicesDisabled.rowCount,
salon_master_services_disabled:salonMasterServicesDisabled.rowCount
},
billing_access:{
exists:access.exists,
subscription_status:access.subscription_status,
access_state:access.access_state,
can_write:access.can_write,
can_withdraw:access.can_withdraw,
billing:access.billing
}
});

}catch(err){

try{ await db.query("ROLLBACK"); }catch(e){}

if(err.code === "BILLING_BLOCKED"){
return res.status(403).json({
ok:false,
error:"BILLING_BLOCKED",
billing_access:{
exists:err.access.exists,
subscription_status:err.access.subscription_status,
access_state:err.access.access_state,
can_write:err.access.can_write,
can_withdraw:err.access.can_withdraw,
billing:err.access.billing
}
});
}

console.error("SALON_MASTER_TERMINATE_ERROR",err);

return res.status(500).json({
ok:false,
error:"SALON_MASTER_TERMINATE_FAILED"
});

}finally{

db.release();

}

});

/* SALON CLIENTS */
r.get("/salons/:slug/clients", internalReadRateLimit, async (req,res)=>{

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

if(!hasSalonOwnership(req, salonId)){
return res.status(403).json({ok:false,error:"FORBIDDEN"});
}

const clients = await pool.query(`
SELECT
c.id,
c.name,
c.phone,
COUNT(b.id)::int AS visits
FROM clients c
LEFT JOIN bookings b ON b.client_id=c.id AND b.salon_id=$1
WHERE c.salon_id=$1
GROUP BY c.id,c.name,c.phone
ORDER BY c.id DESC
`,[salonId]);

res.json({
ok:true,
clients:clients.rows
});

}catch(err){

console.error("SALON_CLIENTS_ERROR",err);

res.status(500).json({
ok:false,
error:"SALON_CLIENTS_FETCH_FAILED"
});

}

});

/* SALON BOOKINGS */
r.get("/salons/:slug/bookings", internalReadRateLimit, async (req,res)=>{

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

if(!hasSalonOwnership(req, salonId)){
return res.status(403).json({ok:false,error:"FORBIDDEN"});
}

const bookings = await pool.query(`
SELECT
b.id,
b.start_at,
b.status,
c.name,
c.phone
FROM bookings b
LEFT JOIN clients c ON c.id=b.client_id
WHERE b.salon_id=$1
ORDER BY b.start_at DESC
`,[salonId]);

res.json({
ok:true,
bookings:bookings.rows
});

}catch(err){

console.error("SALON_BOOKINGS_ERROR",err);

res.status(500).json({
ok:false,
error:"SALON_BOOKINGS_FETCH_FAILED"
});

}

});

/* SALON METRICS */
r.get("/salons/:slug/metrics", internalReadRateLimit, async (req,res)=>{

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

if(!hasSalonOwnership(req, salonId)){
return res.status(403).json({ok:false,error:"FORBIDDEN"});
}

const bookingsToday = await pool.query(`
SELECT COUNT(*)::int AS v
FROM bookings
WHERE salon_id=$1
AND DATE(start_at)=CURRENT_DATE
`,[salonId]);

const bookingsWeek = await pool.query(`
SELECT COUNT(*)::int AS v
FROM bookings
WHERE salon_id=$1
AND DATE(start_at) >= CURRENT_DATE - INTERVAL '6 days'
`,[salonId]);

const clientsTotal = await pool.query(`
SELECT COUNT(*)::int AS v
FROM clients
WHERE salon_id=$1
`,[salonId]);

const mastersActive = await pool.query(`
SELECT COUNT(*)::int AS v
FROM master_salon
WHERE salon_id=$1
AND status='active'
`,[salonId]);

const revenueToday = await pool.query(`
SELECT COALESCE(SUM(COALESCE(le.amount_cents,0)),0)::int AS v
FROM totem_test.ledger_entries le
JOIN totem_test.wallets w ON w.id=le.wallet_id
WHERE w.owner_type='salon'
AND w.owner_id=$1
AND le.direction='credit'
AND le.reference_type='payment'
AND DATE(le.created_at)=CURRENT_DATE
`,[salonId]);

const revenueMonth = await pool.query(`
SELECT COALESCE(SUM(COALESCE(le.amount_cents,0)),0)::int AS v
FROM totem_test.ledger_entries le
JOIN totem_test.wallets w ON w.id=le.wallet_id
WHERE w.owner_type='salon'
AND w.owner_id=$1
AND le.direction='credit'
AND le.reference_type='payment'
AND le.created_at >= CURRENT_DATE - INTERVAL '29 days'
`,[salonId]);

const paymentsTotal = await pool.query(`
SELECT COUNT(*)::int AS v
FROM totem_test.ledger_entries le
JOIN totem_test.wallets w ON w.id=le.wallet_id
WHERE w.owner_type='salon'
AND w.owner_id=$1
AND le.direction='credit'
AND le.reference_type='payment'
`,[salonId]);

res.json({
ok:true,
metrics:{
bookings_today:bookingsToday.rows[0].v,
bookings_week:bookingsWeek.rows[0].v,
clients_total:clientsTotal.rows[0].v,
masters_active:mastersActive.rows[0].v,
revenue_today:revenueToday.rows[0].v,
revenue_month:revenueMonth.rows[0].v,
payments_total:paymentsTotal.rows[0].v
}
});

}catch(err){

console.error("SALON_METRICS_ERROR", err);

res.status(500).json({
ok:false,
error:"SALON_METRICS_FAILED"
});

}

});

/* SALON PAYMENTS (FIXED) */
r.get("/salons/:slug/payments", internalReadRateLimit, async (req,res)=>{

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

if(!hasSalonOwnership(req, salonId)){
return res.status(403).json({ok:false,error:"FORBIDDEN"});
}

const payments = await pool.query(`
SELECT
p.id,
p.amount,
p.provider,
p.status,
p.created_at,
c.name AS client_name
FROM payments p
JOIN bookings b ON b.id=p.booking_id
LEFT JOIN clients c ON c.id=b.client_id
WHERE b.salon_id=$1
ORDER BY p.created_at DESC
LIMIT 100
`,[salonId]);

res.json({
ok:true,
payments:payments.rows
});

}catch(err){

console.error("SALON_PAYMENTS_ERROR",err);

res.status(500).json({
ok:false,
error:"SALON_PAYMENTS_FETCH_FAILED"
});

}

});

/* SALON SETTLEMENTS */
r.get("/salons/:slug/settlements", internalReadRateLimit, async (req,res)=>{

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

if(!hasSalonOwnership(req, salonId)){
return res.status(403).json({ok:false,error:"FORBIDDEN"});
}

const settlements = await pool.query(`
SELECT
sp.id,
sp.period_start,
sp.period_end,
sp.status,
sp.closed_at,
sp.created_at
FROM settlement_periods sp
WHERE sp.salon_id=$1
AND sp.is_archived=false
ORDER BY sp.period_start DESC
LIMIT 50
`,[salonId]);

res.json({
ok:true,
settlements:settlements.rows
});

}catch(err){

console.error("SALON_SETTLEMENTS_ERROR",err);

res.status(500).json({
ok:false,
error:"SALON_SETTLEMENTS_FETCH_FAILED"
});

}

});

/* SALON PAYOUTS */
r.get("/salons/:slug/payouts", internalReadRateLimit, async (req,res)=>{

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

if(!hasSalonOwnership(req, salonId)){
return res.status(403).json({ok:false,error:"FORBIDDEN"});
}

const payouts = await pool.query(`
SELECT
p.id,
p.amount,
p.status,
p.created_at
FROM payouts p
JOIN bookings b ON b.id=p.booking_id
WHERE b.salon_id=$1
ORDER BY p.created_at DESC
LIMIT 50
`,[salonId]);

res.json({
ok:true,
payouts:payouts.rows
});

}catch(err){

console.error("SALON_PAYOUTS_ERROR",err);

res.status(500).json({
ok:false,
error:"SALON_PAYOUTS_FETCH_FAILED"
});

}

});

/* SALON WALLET */
r.get("/salons/:slug/wallet", internalReadRateLimit, async (req,res)=>{

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

if(!hasSalonOwnership(req, salonId)){
return res.status(403).json({ok:false,error:"FORBIDDEN"});
}

const wallet = await pool.query(`
SELECT
w.id,
w.owner_type,
w.owner_id,
w.currency,
w.created_at
FROM totem_test.wallets w
WHERE w.owner_type='salon'
AND w.owner_id=$1
LIMIT 1
`,[salonId]);

const access = await getSalonBillingAccess(pool, salonId);

res.json({
ok:true,
wallet:wallet.rows[0] || null,
billing_access:{
exists:access.exists,
subscription_status:access.subscription_status,
access_state:access.access_state,
can_write:access.can_write,
can_withdraw:access.can_withdraw,
billing:access.billing
}
});

}catch(err){

console.error("SALON_WALLET_ERROR",err);

res.status(500).json({
ok:false,
error:"SALON_WALLET_FETCH_FAILED"
});

}

});

/* SALON WALLET BALANCE */
r.get("/salons/:slug/wallet-balance", internalReadRateLimit, async (req,res)=>{

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

if(!hasSalonOwnership(req, salonId)){
return res.status(403).json({ok:false,error:"FORBIDDEN"});
}

const balance = await pool.query(`
SELECT
w.id AS wallet_id,
w.owner_type,
w.owner_id,
w.currency,
COALESCE(v.computed_balance_cents,0)::int AS balance
FROM totem_test.wallets w
LEFT JOIN totem_test.v_wallet_balance_computed v ON v.wallet_id=w.id
WHERE w.owner_type='salon'
AND w.owner_id=$1
LIMIT 1
`,[salonId]);

const access = await getSalonBillingAccess(pool, salonId);

res.json({
ok:true,
wallet_id: balance.rows[0]?.wallet_id || null,
balance: balance.rows[0]?.balance || 0,
currency: balance.rows[0]?.currency || "KGS",
billing_access:{
exists:access.exists,
subscription_status:access.subscription_status,
access_state:access.access_state,
can_write:access.can_write,
can_withdraw:access.can_withdraw,
billing:access.billing
}
});

}catch(err){

console.error("SALON_WALLET_BALANCE_ERROR",err);

res.status(500).json({
ok:false,
error:"SALON_WALLET_BALANCE_FETCH_FAILED"
});

}

});

/* SALON LEDGER */
r.get("/salons/:slug/ledger", internalReadRateLimit, async (req,res)=>{

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

if(!hasSalonOwnership(req, salonId)){
return res.status(403).json({ok:false,error:"FORBIDDEN"});
}

const ledger = await pool.query(`
SELECT
le.id,
le.wallet_id,
le.direction,
COALESCE(le.amount_cents,0)::int AS amount,
le.reference_type,
le.reference_id,
le.created_at
FROM totem_test.ledger_entries le
JOIN totem_test.wallets w ON w.id=le.wallet_id
WHERE w.owner_type='salon'
AND w.owner_id=$1
ORDER BY le.created_at DESC
LIMIT 100
`,[salonId]);

res.json({
ok:true,
ledger:ledger.rows
});

}catch(err){

console.error("SALON_LEDGER_FETCH_ERROR",err);

res.status(500).json({
ok:false,
error:"SALON_LEDGER_FETCH_FAILED"
});

}

});

/* SALON WITHDRAWS */
r.get("/salons/:slug/withdraws", internalReadRateLimit, async (req,res)=>{

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

if(!hasSalonOwnership(req, salonId)){
return res.status(403).json({ok:false,error:"FORBIDDEN"});
}

const withdraws = await pool.query(`
SELECT
w.id,
w.owner_type,
w.owner_id,
w.wallet_id,
w.amount,
w.status,
w.destination,
w.external_ref,
w.created_at,
w.updated_at
FROM public.withdraws w
WHERE w.owner_type='salon'
AND w.owner_id=$1
ORDER BY w.created_at DESC
LIMIT 100
`,[salonId]);

const access = await getSalonBillingAccess(pool, salonId);

res.json({
ok:true,
withdraws:withdraws.rows,
billing_access:{
exists:access.exists,
subscription_status:access.subscription_status,
access_state:access.access_state,
can_write:access.can_write,
can_withdraw:access.can_withdraw,
billing:access.billing
}
});

}catch(err){

console.error("SALON_WITHDRAWS_FETCH_ERROR",err);

res.status(500).json({
ok:false,
error:"SALON_WITHDRAWS_FETCH_FAILED"
});

}

});

return r;

}
