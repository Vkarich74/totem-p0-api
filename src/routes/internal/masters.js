import express from "express";
import crypto from "crypto";

export default function buildMastersRouter(pool, internalReadRateLimit){

const r = express.Router();

async function getMasterBillingAccess(dbOrPool, masterId){
const billing = await dbOrPool.query(`
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
WHERE owner_type='master'
AND owner_id=$1
LIMIT 1
`,[masterId]);

if(!billing.rows.length){
return {
exists:false,
subscription_status:"active",
access_state:"active",
can_write:true,
can_withdraw:true,
billing:null
};
}

const row = billing.rows[0];
const status = row.subscription_status || "active";

return {
exists:true,
subscription_status:status,
access_state:status,
can_write:status !== "blocked",
can_withdraw:status === "active",
billing:row
};
}

async function ensureMasterWriteAllowed(db, masterId){
const access = await getMasterBillingAccess(db, masterId);

if(!access.can_write){
const err = new Error("BILLING_BLOCKED");
err.code = "BILLING_BLOCKED";
err.access = access;
throw err;
}

return access;
}

async function getMasterBySlug(dbOrPool, slug){
const master = await dbOrPool.query(`
SELECT
m.id,
m.name,
m.slug,
m.user_id
FROM masters m
WHERE m.slug=$1
LIMIT 1
`,[slug]);

if(!master.rows.length){
return null;
}

return master.rows[0];
}

async function getMasterWalletRow(dbOrPool, masterId){
const wallet = await dbOrPool.query(`
SELECT
w.id,
w.owner_type,
w.owner_id,
w.currency,
COALESCE(v.computed_balance_cents,0)::int AS balance
FROM totem_test.wallets w
LEFT JOIN totem_test.v_wallet_balance_computed v ON v.wallet_id=w.id
WHERE w.owner_type='master'
AND w.owner_id=$1
LIMIT 1
`,[masterId]);

if(!wallet.rows.length){
return null;
}

return wallet.rows[0];
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

async function getMasterWalletRowForCharge(db, masterId){
const wallet = await db.query(`
SELECT
id,
owner_type,
owner_id,
currency
FROM totem_test.wallets
WHERE owner_type='master'
AND owner_id=$1
FOR UPDATE
LIMIT 1
`,[masterId]);

if(!wallet.rows.length){
const err = new Error("MASTER_WALLET_NOT_FOUND");
err.code = "MASTER_WALLET_NOT_FOUND";
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

async function ensureMasterBillingSubscription(db, masterId){
const existing = await db.query(`
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
WHERE owner_type='master'
AND owner_id=$1
FOR UPDATE
LIMIT 1
`,[masterId]);

if(existing.rows.length){
return existing.rows[0];
}

const created = await db.query(`
INSERT INTO public.billing_subscriptions(
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
)
VALUES(
'master',
$1,
'subscription',
'active',
30,
1000,
'KGS',
true,
NULL,
NULL,
3,
NULL,
NULL,
NULL,
NULL,
NULL,
NOW(),
NOW()
)
RETURNING
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
`,[masterId]);

return created.rows[0];
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

/*
MASTER SUBSCRIPTION MANUAL CHARGE
*/
r.post("/masters/:slug/subscription/charge", async (req,res)=>{

const { slug } = req.params;
const db = await pool.connect();

try{

await db.query("BEGIN");

const master = await getMasterBySlug(db, slug);

if(!master){
await db.query("ROLLBACK");
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

const billing = await ensureMasterBillingSubscription(db, master.id);

if(billing.subscription_status !== "active"){
await db.query("ROLLBACK");
return res.status(400).json({ok:false,error:"SUBSCRIPTION_NOT_ACTIVE"});
}

const amount = Number(billing.amount);
if(!Number.isFinite(amount) || amount <= 0){
await db.query("ROLLBACK");
return res.status(400).json({ok:false,error:"SUBSCRIPTION_AMOUNT_INVALID"});
}

const masterWallet = await getMasterWalletRowForCharge(db, master.id);
const masterWalletId = masterWallet.id;
const masterBalance = await getWalletBalanceById(db, masterWalletId);

if(masterBalance < amount){
await db.query("ROLLBACK");
return res.status(400).json({
ok:false,
error:"INSUFFICIENT_WALLET_BALANCE",
balance:masterBalance,
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
masterWalletId,
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

const billing_access = await getMasterBillingAccess(pool, master.id);

return res.json({
ok:true,
charged:true,
owner_type:"master",
owner_id:master.id,
amount,
currency:billing.currency || "KGS",
reference_type:"subscription",
reference_id:String(billing.id),
billing_access
});

}catch(err){

try{ await db.query("ROLLBACK"); }catch(e){}

if(err.code === "SYSTEM_WALLET_NOT_FOUND"){
return res.status(500).json({
ok:false,
error:"SYSTEM_WALLET_NOT_FOUND"
});
}

if(err.code === "MASTER_WALLET_NOT_FOUND"){
return res.status(404).json({
ok:false,
error:"MASTER_WALLET_NOT_FOUND"
});
}

console.error("MASTER_SUBSCRIPTION_CHARGE_ERROR",err);

return res.status(500).json({
ok:false,
error:"MASTER_SUBSCRIPTION_CHARGE_FAILED"
});

}finally{

db.release();

}

});



/*
MASTER BILLING
*/
r.get("/masters/:slug/billing", internalReadRateLimit, async (req,res)=>{

const { slug } = req.params;

try{

const master = await getMasterBySlug(pool, slug);

if(!master){
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

const access = await getMasterBillingAccess(pool, master.id);

return res.json({
ok:true,
owner_type:"master",
owner_id:master.id,
owner_slug:master.slug,
exists:access.exists,
subscription_status:access.subscription_status,
access_state:access.billing ? resolveBillingAccessState(access.billing) : access.access_state,
can_write:access.can_write,
can_withdraw:access.can_withdraw,
billing:access.billing
});

}catch(err){

console.error("MASTER_BILLING_FETCH_ERROR",err);

return res.status(500).json({
ok:false,
error:"MASTER_BILLING_FETCH_FAILED"
});

}

});

r.post("/masters/:slug/billing/block", async (req,res)=>{

const { slug } = req.params;
const db = await pool.connect();

try{

await db.query("BEGIN");

const master = await getMasterBySlug(db, slug);

if(!master){
await db.query("ROLLBACK");
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

const billing = await ensureMasterBillingSubscription(db, master.id);

await db.query(`
UPDATE public.billing_subscriptions
SET
blocked_at=NOW(),
subscription_status='blocked',
updated_at=NOW()
WHERE id=$1
`,[billing.id]);

await db.query("COMMIT");

const access = await getMasterBillingAccess(pool, master.id);

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

console.error("MASTER_BILLING_BLOCK_ERROR",err);

return res.status(500).json({
ok:false,
error:"MASTER_BILLING_BLOCK_FAILED"
});

}finally{

db.release();

}

});

r.post("/masters/:slug/billing/unblock", async (req,res)=>{

const { slug } = req.params;
const db = await pool.connect();

try{

await db.query("BEGIN");

const master = await getMasterBySlug(db, slug);

if(!master){
await db.query("ROLLBACK");
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

const billing = await ensureMasterBillingSubscription(db, master.id);

await db.query(`
UPDATE public.billing_subscriptions
SET
blocked_at=NULL,
subscription_status='active',
updated_at=NOW()
WHERE id=$1
`,[billing.id]);

await db.query("COMMIT");

const access = await getMasterBillingAccess(pool, master.id);

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

console.error("MASTER_BILLING_UNBLOCK_ERROR",err);

return res.status(500).json({
ok:false,
error:"MASTER_BILLING_UNBLOCK_FAILED"
});

}finally{

db.release();

}

});


/*
GET MASTER BY SLUG
*/
r.get("/masters/:slug", internalReadRateLimit, async (req,res)=>{

const { slug } = req.params;

try{

const master = await pool.query(`
SELECT
m.id,
m.name,
m.slug,
m.user_id
FROM masters m
WHERE m.slug=$1
`,[slug]);

if(!master.rows.length){
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

const billing_access = await getMasterBillingAccess(pool, master.rows[0].id);

res.json({
ok:true,
master:master.rows[0],
billing_access
});

}catch(err){

console.error(err);

res.status(500).json({
ok:false,
error:"MASTER_FETCH_FAILED"
});

}

});

/*
MASTER METRICS
*/
r.get("/masters/:slug/metrics", internalReadRateLimit, async (req,res)=>{

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

const bookingsToday = await pool.query(`
SELECT COUNT(*)::int AS v
FROM bookings
WHERE master_id=$1
AND DATE(start_at)=CURRENT_DATE
`,[masterId]);

const bookingsWeek = await pool.query(`
SELECT COUNT(*)::int AS v
FROM bookings
WHERE master_id=$1
AND start_at >= NOW() - INTERVAL '7 days'
`,[masterId]);

const clientsTotal = await pool.query(`
SELECT COUNT(*)::int AS v
FROM clients
WHERE id IN (
SELECT client_id FROM bookings WHERE master_id=$1
)
`,[masterId]);

const billing_access = await getMasterBillingAccess(pool, masterId);

res.json({
ok:true,
metrics:{
bookings_today:bookingsToday.rows[0].v,
bookings_week:bookingsWeek.rows[0].v,
clients_total:clientsTotal.rows[0].v
},
billing_access
});

}catch(err){

console.error("MASTER_METRICS_ERROR",err);

res.status(500).json({
ok:false,
error:"MASTER_METRICS_FAILED"
});

}

});

/*
MASTER SERVICES
*/
r.get("/masters/:slug/services", internalReadRateLimit, async (req,res)=>{

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

const services = await pool.query(`
SELECT
sms.id,
sms.service_pk,
s.service_id AS catalog_service_id,
s.name,
sms.price,
sms.duration_min,
sms.active
FROM salon_master_services sms
JOIN services s ON s.id=sms.service_pk
WHERE sms.master_id=$1
ORDER BY sms.id DESC
`,[masterId]);

const billing_access = await getMasterBillingAccess(pool, masterId);

res.json({
ok:true,
services:services.rows,
billing_access
});

}catch(err){

console.error("MASTER_SERVICES_FETCH_ERROR",err);

res.status(500).json({
ok:false,
error:"MASTER_SERVICES_FETCH_FAILED"
});

}

});

/*
CREATE MASTER SERVICE
*/
r.post("/masters/:slug/services", async (req,res)=>{

const { slug } = req.params;
const { name, price, duration_min } = req.body;

const db = await pool.connect();

try{

await db.query("BEGIN");

const safeName = String(name || "").trim();
const safePrice = Number(price);
const safeDuration = Number(duration_min);

if(!safeName){
await db.query("ROLLBACK");
return res.status(400).json({ok:false,error:"NAME_REQUIRED"});
}

if(!Number.isFinite(safePrice) || safePrice < 0){
await db.query("ROLLBACK");
return res.status(400).json({ok:false,error:"PRICE_INVALID"});
}

if(!Number.isFinite(safeDuration) || safeDuration <= 0){
await db.query("ROLLBACK");
return res.status(400).json({ok:false,error:"DURATION_INVALID"});
}

const master = await db.query(
`SELECT id FROM masters WHERE slug=$1`,
[slug]
);

if(!master.rows.length){
await db.query("ROLLBACK");
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

const masterId = master.rows[0].id;

const billing_access = await ensureMasterWriteAllowed(db, masterId);

const relation = await db.query(`
SELECT salon_id
FROM master_salon
WHERE master_id=$1
AND status='active'
ORDER BY activated_at DESC NULLS LAST, id DESC
LIMIT 1
`,[masterId]);

if(!relation.rows.length){
await db.query("ROLLBACK");
return res.status(400).json({ok:false,error:"MASTER_ACTIVE_SALON_REQUIRED"});
}

const salonId = relation.rows[0].salon_id;

const nextServiceId = await db.query(`
SELECT COALESCE(MAX(service_id::int),0)+1 AS next_service_id
FROM services
WHERE service_id ~ '^[0-9]+$'
`);

const serviceCode = String(nextServiceId.rows[0]?.next_service_id || 1);

const service = await db.query(`
INSERT INTO services(
service_id,
name,
duration_min,
price
)
VALUES($1,$2,$3,$4)
RETURNING id,service_id,name,duration_min,price
`,[
serviceCode,
safeName,
safeDuration,
safePrice
]);

const servicePk = service.rows[0].id;

const linked = await db.query(`
INSERT INTO salon_master_services(
salon_id,
master_id,
service_pk,
price,
duration_min,
active
)
VALUES($1,$2,$3,$4,$5,true)
RETURNING id,service_pk AS service_id,price,duration_min,active
`,[
salonId,
masterId,
servicePk,
safePrice,
safeDuration
]);

await db.query("COMMIT");

return res.json({
ok:true,
service:{
id:linked.rows[0].id,
service_pk:linked.rows[0].service_id,
catalog_service_id:service.rows[0].service_id,
name:service.rows[0].name,
price:linked.rows[0].price,
duration_min:linked.rows[0].duration_min,
active:linked.rows[0].active
},
billing_access
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

console.error("MASTER_SERVICE_CREATE_ERROR",err);

return res.status(500).json({
ok:false,
error:"MASTER_SERVICE_CREATE_FAILED"
});

}finally{

db.release();

}

});

/*
UPDATE MASTER SERVICE
*/
r.patch("/masters/:slug/services/:id", async (req,res)=>{

const { slug, id } = req.params;
const { name, price, duration_min, active } = req.body;

const db = await pool.connect();

try{

await db.query("BEGIN");

const master = await db.query(
`SELECT id FROM masters WHERE slug=$1`,
[slug]
);

if(!master.rows.length){
await db.query("ROLLBACK");
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

const masterId = master.rows[0].id;

const billing_access = await ensureMasterWriteAllowed(db, masterId);

const existing = await db.query(`
SELECT
sms.id,
sms.service_pk,
sms.price,
sms.duration_min,
sms.active,
s.name
FROM salon_master_services sms
JOIN services s ON s.id=sms.service_pk
WHERE sms.id=$1
AND sms.master_id=$2
FOR UPDATE
LIMIT 1
`,[
id,
masterId
]);

if(!existing.rows.length){
await db.query("ROLLBACK");
return res.status(404).json({ok:false,error:"MASTER_SERVICE_NOT_FOUND"});
}

const current = existing.rows[0];

const nextName =
  typeof name === "string" ? String(name).trim() : current.name;

const nextPrice =
  price === undefined ? Number(current.price) : Number(price);

const nextDuration =
  duration_min === undefined ? Number(current.duration_min) : Number(duration_min);

const nextActive =
  typeof active === "boolean" ? active : current.active;

if(!nextName){
await db.query("ROLLBACK");
return res.status(400).json({ok:false,error:"NAME_REQUIRED"});
}

if(!Number.isFinite(nextPrice) || nextPrice < 0){
await db.query("ROLLBACK");
return res.status(400).json({ok:false,error:"PRICE_INVALID"});
}

if(!Number.isFinite(nextDuration) || nextDuration <= 0){
await db.query("ROLLBACK");
return res.status(400).json({ok:false,error:"DURATION_INVALID"});
}

await db.query(`
UPDATE services
SET name=$2
WHERE id=$1
`,[
current.service_pk,
nextName
]);

const updated = await db.query(`
UPDATE salon_master_services
SET
price=$2,
duration_min=$3,
active=$4
WHERE id=$1
RETURNING id,service_pk AS service_id,price,duration_min,active
`,[
id,
nextPrice,
nextDuration,
nextActive
]);

await db.query("COMMIT");

return res.json({
ok:true,
service:{
id:updated.rows[0].id,
service_pk:updated.rows[0].service_id,
name:nextName,
price:updated.rows[0].price,
duration_min:updated.rows[0].duration_min,
active:updated.rows[0].active
},
billing_access
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

console.error("MASTER_SERVICE_UPDATE_ERROR",err);

return res.status(500).json({
ok:false,
error:"MASTER_SERVICE_UPDATE_FAILED"
});

}finally{

db.release();

}

});

/*
DELETE MASTER SERVICE
*/
r.delete("/masters/:slug/services/:id", async (req,res)=>{

const { slug, id } = req.params;
const db = await pool.connect();

try{

await db.query("BEGIN");

const master = await db.query(
`SELECT id FROM masters WHERE slug=$1`,
[slug]
);

if(!master.rows.length){
await db.query("ROLLBACK");
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

const masterId = master.rows[0].id;

const billing_access = await ensureMasterWriteAllowed(db, masterId);

const existing = await db.query(`
SELECT
sms.id,
sms.service_pk
FROM salon_master_services sms
WHERE sms.id=$1
AND sms.master_id=$2
FOR UPDATE
LIMIT 1
`,[
id,
masterId
]);

if(!existing.rows.length){
await db.query("ROLLBACK");
return res.status(404).json({ok:false,error:"MASTER_SERVICE_NOT_FOUND"});
}

const servicePk = existing.rows[0].service_pk;

await db.query(`
DELETE FROM salon_master_services
WHERE id=$1
`,[id]);

const serviceLinks = await db.query(`
SELECT COUNT(*)::int AS v
FROM salon_master_services
WHERE service_pk=$1
`,[servicePk]);

if((serviceLinks.rows[0]?.v || 0) === 0){
await db.query(`
DELETE FROM services
WHERE id=$1
`,[servicePk]);
}

await db.query("COMMIT");

return res.json({
ok:true,
deleted:true,
id:Number(id),
billing_access
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

console.error("MASTER_SERVICE_DELETE_ERROR",err);

return res.status(500).json({
ok:false,
error:"MASTER_SERVICE_DELETE_FAILED"
});

}finally{

db.release();

}

});

/*
MASTER BOOKINGS
*/
r.get("/masters/:slug/bookings", internalReadRateLimit, async (req,res)=>{

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

const bookings = await pool.query(`
SELECT
b.id,
b.status,
b.start_at,
b.end_at,
c.name AS client_name,
c.phone
FROM bookings b
LEFT JOIN clients c ON c.id=b.client_id
WHERE b.master_id=$1
ORDER BY b.start_at DESC
`,[masterId]);

const billing_access = await getMasterBillingAccess(pool, masterId);

res.json({
ok:true,
bookings:bookings.rows,
billing_access
});

}catch(err){

console.error("MASTER_BOOKINGS_ERROR", err);

res.status(500).json({
ok:false,
error:"MASTER_BOOKINGS_FETCH_FAILED"
});

}

});

/*
MASTER CLIENTS
*/
r.get("/masters/:slug/clients", internalReadRateLimit, async (req,res)=>{

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

const clients = await pool.query(`
SELECT DISTINCT
c.id,
c.name,
c.phone
FROM clients c
JOIN bookings b ON b.client_id=c.id
WHERE b.master_id=$1
ORDER BY c.id DESC
`,[masterId]);

const billing_access = await getMasterBillingAccess(pool, masterId);

res.json({
ok:true,
clients:clients.rows,
billing_access
});

}catch(err){

console.error("MASTER_CLIENTS_ERROR",err);

res.status(500).json({
ok:false,
error:"MASTER_CLIENTS_FETCH_FAILED"
});

}

});

/*
MASTER QUICK BOOKING CREATE
*/
r.post("/masters/:slug/bookings", async (req,res)=>{

const { slug } = req.params;
const { client_name, phone, start_at, service_id } = req.body;

const db = await pool.connect();

try{

await db.query("BEGIN");

if(!start_at){
await db.query("ROLLBACK");
return res.status(400).json({ok:false,error:"START_AT_REQUIRED"});
}

if(!service_id){
await db.query("ROLLBACK");
return res.status(400).json({ok:false,error:"SERVICE_ID_REQUIRED"});
}

const start = new Date(start_at);

if(Number.isNaN(start.getTime())){
await db.query("ROLLBACK");
return res.status(400).json({ok:false,error:"INVALID_START_AT"});
}

const master = await db.query(
`SELECT id FROM masters WHERE slug=$1`,
[slug]
);

if(!master.rows.length){
await db.query("ROLLBACK");
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

const masterId = master.rows[0].id;

const billing_access = await ensureMasterWriteAllowed(db, masterId);

const serviceLink = await db.query(`
SELECT
sms.salon_id,
sms.price,
sms.service_pk,
s.slug
FROM salon_master_services sms
JOIN salons s ON s.id=sms.salon_id
WHERE sms.master_id=$1
AND sms.id=$2
AND sms.active=true
LIMIT 1
`,[
masterId,
service_id
]);

if(!serviceLink.rows.length){
await db.query("ROLLBACK");
return res.status(400).json({ok:false,error:"SERVICE_INACTIVE"});
}

const salonId = serviceLink.rows[0].salon_id;
const salonSlug = serviceLink.rows[0].slug;
const servicePk = Number(serviceLink.rows[0].service_pk);
const priceSnapshot = Number(serviceLink.rows[0].price);

const safeName = String(client_name || "").trim() || "client";
const safePhone = String(phone || "").trim() || null;

let clientId = null;

if(safePhone){

const existingClient = await db.query(
`SELECT id
FROM clients
WHERE salon_id=$1 AND phone=$2
LIMIT 1`,
[salonId, safePhone]
);

if(existingClient.rows.length){
clientId = existingClient.rows[0].id;
}

}

if(!clientId){

const createdClient = await db.query(`
INSERT INTO clients(
salon_id,
name,
phone
)
VALUES($1,$2,$3)
RETURNING id
`,[
salonId,
safeName,
safePhone
]);

clientId = createdClient.rows[0].id;

}

const end = new Date(start.getTime() + 30 * 60000);

let slotId = null;

const existingSlot = await db.query(`
SELECT id
FROM calendar_slots
WHERE master_id=$1
AND start_at=$2
AND end_at=$3
LIMIT 1
`,[
masterId,
start,
end
]);

if(existingSlot.rows.length){

slotId = existingSlot.rows[0].id;

const existingBooking = await db.query(`
SELECT id
FROM bookings
WHERE calendar_slot_id=$1
LIMIT 1
`,[slotId]);

if(existingBooking.rows.length){

await db.query("ROLLBACK");

return res.status(409).json({
ok:false,
error:"BOOKING_ALREADY_EXISTS_FOR_SLOT",
slot_id:slotId
});

}

}else{

const slot = await db.query(`
INSERT INTO calendar_slots(
salon_id,
master_id,
start_at,
end_at,
status,
request_id
)
VALUES($1,$2,$3,$4,'reserved',$5)
RETURNING id
`,[
salonId,
masterId,
start,
end,
crypto.randomUUID()
]);

slotId = slot.rows[0].id;

}

const requestId = crypto.randomUUID();

const booking = await db.query(`
INSERT INTO bookings(
salon_id,
salon_slug,
master_id,
start_at,
end_at,
status,
request_id,
calendar_slot_id,
client_id,
service_id,
price_snapshot
)
VALUES($1,$2,$3,$4,$5,'reserved',$6,$7,$8,$9,$10)
RETURNING *
`,[
salonId,
salonSlug,
masterId,
start,
end,
requestId,
slotId,
clientId,
servicePk,
priceSnapshot
]);

await db.query("COMMIT");

res.json({
ok:true,
booking:booking.rows[0],
billing_access
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

console.error("BOOKING_ENGINE_ERROR",err);

res.status(500).json({
ok:false,
error:"BOOKING_CREATE_FAILED"
});

}finally{

db.release();

}

});

/*
MASTER WALLET BALANCE
*/
r.get("/masters/:slug/wallet-balance", internalReadRateLimit, async (req,res)=>{

const { slug } = req.params;

try{

const master = await getMasterBySlug(pool, slug);

if(!master){
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

const wallet = await getMasterWalletRow(pool, master.id);

if(!wallet){
return res.status(404).json({ok:false,error:"MASTER_WALLET_NOT_FOUND"});
}

const billing_access = await getMasterBillingAccess(pool, master.id);

return res.json({
ok:true,
wallet_id:wallet.id,
balance:Number(wallet.balance || 0),
currency:wallet.currency || "KGS",
billing_access
});

}catch(err){

console.error("MASTER_WALLET_BALANCE_ERROR",err);

return res.status(500).json({
ok:false,
error:"MASTER_WALLET_BALANCE_FAILED"
});

}

});

/*
MASTER LEDGER
*/
r.get("/masters/:slug/ledger", internalReadRateLimit, async (req,res)=>{

const { slug } = req.params;

try{

const master = await getMasterBySlug(pool, slug);

if(!master){
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
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
WHERE w.owner_type='master'
AND w.owner_id=$1
ORDER BY le.created_at DESC
LIMIT 100
`,[master.id]);

const billing_access = await getMasterBillingAccess(pool, master.id);

return res.json({
ok:true,
ledger:ledger.rows,
billing_access
});

}catch(err){

console.error("MASTER_LEDGER_FETCH_ERROR",err);

return res.status(500).json({
ok:false,
error:"MASTER_LEDGER_FETCH_FAILED"
});

}

});

/*
MASTER SETTLEMENTS
*/
r.get("/masters/:slug/settlements", internalReadRateLimit, async (req,res)=>{

const { slug } = req.params;

try{

const master = await getMasterBySlug(pool, slug);

if(!master){
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

const settlements = await pool.query(`
SELECT DISTINCT ON (sp.id)
sp.id,
sp.period_start,
sp.period_end,
sp.status,
sp.closed_at,
sp.created_at
FROM settlement_periods sp
LEFT JOIN payouts p ON p.settlement_period_id=sp.id
LEFT JOIN bookings b ON b.id=p.booking_id
WHERE b.master_id=$1
AND sp.is_archived=false
ORDER BY sp.id, sp.period_start DESC, sp.created_at DESC
LIMIT 50
`,[master.id]);

const billing_access = await getMasterBillingAccess(pool, master.id);

return res.json({
ok:true,
settlements:settlements.rows,
billing_access
});

}catch(err){

console.error("MASTER_SETTLEMENTS_FETCH_ERROR",err);

return res.status(500).json({
ok:false,
error:"MASTER_SETTLEMENTS_FETCH_FAILED"
});

}

});

/*
MASTER PAYOUTS
*/
r.get("/masters/:slug/payouts", internalReadRateLimit, async (req,res)=>{

const { slug } = req.params;

try{

const master = await getMasterBySlug(pool, slug);

if(!master){
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

const payouts = await pool.query(`
SELECT
p.id,
p.amount,
p.status,
p.created_at
FROM payouts p LEFT JOIN bookings b ON b.id=p.booking_id
WHERE b.master_id=$1
ORDER BY p.created_at DESC
LIMIT 50
`,[master.id]);

const billing_access = await getMasterBillingAccess(pool, master.id);

return res.json({
ok:true,
payouts:payouts.rows,
billing_access
});

}catch(err){

console.error("MASTER_PAYOUTS_FETCH_ERROR",err);

return res.status(500).json({
ok:false,
error:"MASTER_PAYOUTS_FETCH_FAILED"
});

}

});

return r;

}
