import express from "express";
import crypto from "crypto";
import { pool } from "../db.js";
import { xpayCreateQR, xpayCheckStatus } from "../payments/xpay.js";
import { rateLimit } from "../middleware/rateLimit.js";
import buildReportsRouter from "./internal/reports.js";
import buildPaymentsRouter from "./internal/payments.js";
import buildSettlementsRouter from "./internal/settlements.js";
import buildContractsRouter from "./internal/contracts.js";
import buildWithdrawsRouter from "./internal/withdraws.js";
import buildXpayRouter from "./internal/xpay.js";
import buildContractAliasRouter from "./internal/contract-alias.js";
import buildPayoutsProcessorRouter from "./internal/payouts-processor.js";
import buildFinanceEngineRouter from "./internal/finance-engine.js";
import buildWithdrawsProcessorRouter from "./internal/withdraws-processor.js";

export function createInternalRouter({ rlInternal } = {}){

const r = express.Router();

const internalReadRateLimit =
  rlInternal ||
  ((req, res, next) => {
    const redis = req.app?.locals?.redis ?? null;
    return rateLimit({
      windowMs: 60_000,
      max: 60,
      keyPrefix: "internal-read",
      redis,
    })(req, res, next);
  });

const reportsRouter = buildReportsRouter(pool, internalReadRateLimit);

r.use(reportsRouter);

async function getOrCreateSystemWallet(db){
const systemWallet = await db.query(`
SELECT wallet_id
FROM totem_test.system_wallets
FOR UPDATE
LIMIT 1
`);

if(systemWallet.rows.length){
return systemWallet.rows[0].wallet_id;
}

const existingWallet = await db.query(`
SELECT id
FROM totem_test.wallets
WHERE owner_type='system'
AND owner_id=0
FOR UPDATE
LIMIT 1
`);

let walletId = existingWallet.rows[0]?.id || null;

if(!walletId){
const createdWallet = await db.query(`
INSERT INTO totem_test.wallets(
owner_type,
owner_id,
currency
)
VALUES('system',0,'KGS')
RETURNING id
`);

walletId = createdWallet.rows[0].id;
}

await db.query(`
INSERT INTO totem_test.system_wallets(wallet_id)
SELECT $1
WHERE NOT EXISTS (
SELECT 1
FROM totem_test.system_wallets
WHERE wallet_id=$1
)
`,[walletId]);

return walletId;
}

async function getSystemWalletId(db){
return getOrCreateSystemWallet(db);
}

async function getSalonWalletId(db, salonId){
const wallet = await db.query(`
SELECT w.id
FROM totem_test.wallets w
WHERE w.owner_type='salon'
AND w.owner_id=$1
LIMIT 1
`,[salonId]);

if(!wallet.rows.length){
throw new Error("SALON_WALLET_NOT_FOUND");
}

return wallet.rows[0].id;
}

async function setBookingConfirmedIfNeeded(db, bookingId){
await db.query(`
UPDATE bookings
SET status='confirmed'
WHERE id=$1
AND status IN ('reserved','pending')
`,[bookingId]);
}

const paymentsRouter = buildPaymentsRouter({
  pool,
  getSalonWalletId,
  getSystemWalletId,
  setBookingConfirmedIfNeeded,
});

r.use(paymentsRouter);

const settlementsRouter = buildSettlementsRouter(pool);

r.use(settlementsRouter);

const contractsRouter = buildContractsRouter(pool, internalReadRateLimit);

r.use(contractsRouter);

const withdrawsRouter = buildWithdrawsRouter(pool, internalReadRateLimit);
r.use(withdrawsRouter);

const xpayRouter = buildXpayRouter({
  pool,
  xpayCreateQR,
  xpayCheckStatus,
});

r.use(xpayRouter);

const contractAliasRouter = buildContractAliasRouter(pool);
r.use(contractAliasRouter);

const payoutsProcessorRouter = buildPayoutsProcessorRouter(pool, getOrCreateSystemWallet);
r.use(payoutsProcessorRouter);

const financeEngineRouter = buildFinanceEngineRouter(pool);
r.use(financeEngineRouter);

const withdrawsProcessorRouter = buildWithdrawsProcessorRouter(pool);
r.use(withdrawsProcessorRouter);

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

res.json({
ok:true,
master:master.rows[0]
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

res.json({
ok:true,
metrics:{
bookings_today:bookingsToday.rows[0].v,
bookings_week:bookingsWeek.rows[0].v,
clients_total:clientsTotal.rows[0].v
}
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

res.json({
ok:true,
services:services.rows
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
}
});

}catch(err){

try{ await db.query("ROLLBACK"); }catch(e){}

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
}
});

}catch(err){

try{ await db.query("ROLLBACK"); }catch(e){}

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
id:Number(id)
});

}catch(err){

try{ await db.query("ROLLBACK"); }catch(e){}

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

res.json({
ok:true,
bookings:bookings.rows
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

res.json({
ok:true,
clients:clients.rows
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
booking:booking.rows[0]
});

}catch(err){

try{ await db.query("ROLLBACK"); }catch(e){}

console.error("BOOKING_ENGINE_ERROR",err);

res.status(500).json({
ok:false,
error:"BOOKING_CREATE_FAILED"
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

res.json({
ok:true,
salon:salon.rows[0]
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
}
});

}catch(err){

try{ await db.query("ROLLBACK"); }catch(e){}

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
}
});

}catch(err){

try{ await db.query("ROLLBACK"); }catch(e){}

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
}
});

}catch(err){

try{ await db.query("ROLLBACK"); }catch(e){}

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

const clients = await pool.query(`
SELECT id,name,phone
FROM clients
WHERE salon_id=$1
ORDER BY id DESC
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

const bookingsToday = await pool.query(`
SELECT COUNT(*)::int AS v
FROM bookings
WHERE salon_id=$1
AND DATE(start_at)=CURRENT_DATE
`,[salonId]);

const revenueToday = await pool.query(`
SELECT COALESCE(SUM(p.amount),0)::int AS v
FROM payments p
JOIN bookings b ON b.id=p.booking_id
WHERE b.salon_id=$1
AND DATE(p.created_at)=CURRENT_DATE
`,[salonId]);

const revenueMonth = await pool.query(`
SELECT COALESCE(SUM(p.amount),0)::int AS v
FROM payments p
JOIN bookings b ON b.id=p.booking_id
WHERE b.salon_id=$1
AND DATE_TRUNC('month', p.created_at)=DATE_TRUNC('month', NOW())
`,[salonId]);

const paymentsTotal = await pool.query(`
SELECT COUNT(*)::int AS v
FROM payments p
JOIN bookings b ON b.id=p.booking_id
WHERE b.salon_id=$1
`,[salonId]);

res.json({
ok:true,
metrics:{
bookings_today:bookingsToday.rows[0].v,
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

res.json({
ok:true,
wallet:wallet.rows[0] || null
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

res.json({
ok:true,
wallet_id: balance.rows[0]?.wallet_id || null,
balance: balance.rows[0]?.balance || 0,
currency: balance.rows[0]?.currency || "KGS"
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

res.json({
ok:true,
withdraws:withdraws.rows
});

}catch(err){

console.error("SALON_WITHDRAWS_FETCH_ERROR",err);

res.status(500).json({
ok:false,
error:"SALON_WITHDRAWS_FETCH_FAILED"
});

}

});

/*
MASTER WALLET
*/
r.get("/masters/:slug/wallet", internalReadRateLimit, async (req,res)=>{

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

const wallet = await pool.query(`
SELECT
w.id,
w.owner_type,
w.owner_id,
w.currency,
w.created_at
FROM totem_test.wallets w
WHERE w.owner_type='master'
AND w.owner_id=$1
LIMIT 1
`,[masterId]);

res.json({
ok:true,
wallet:wallet.rows[0] || null
});

}catch(err){

console.error("MASTER_WALLET_ERROR",err);

res.status(500).json({
ok:false,
error:"MASTER_WALLET_FETCH_FAILED"
});

}

});

/*
MASTER WALLET BALANCE
*/
r.get("/masters/:slug/wallet-balance", internalReadRateLimit, async (req,res)=>{

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

const balance = await pool.query(`
SELECT
w.id AS wallet_id,
w.owner_type,
w.owner_id,
w.currency,
COALESCE(v.computed_balance_cents,0)::int AS balance
FROM totem_test.wallets w
LEFT JOIN totem_test.v_wallet_balance_computed v
ON v.wallet_id=w.id
WHERE w.owner_type='master'
AND w.owner_id=$1
LIMIT 1
`,[masterId]);

res.json({
ok:true,
wallet_id: balance.rows[0]?.wallet_id || null,
balance: balance.rows[0]?.balance || 0,
currency: balance.rows[0]?.currency || "KGS"
});

}catch(err){

console.error("MASTER_WALLET_BALANCE_ERROR",err);

res.status(500).json({
ok:false,
error:"MASTER_WALLET_BALANCE_FETCH_FAILED"
});

}

});

/*
MASTER LEDGER
*/
r.get("/masters/:slug/ledger", internalReadRateLimit, async (req,res)=>{

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
`,[masterId]);

res.json({
ok:true,
ledger:ledger.rows
});

}catch(err){

console.error("MASTER_LEDGER_FETCH_ERROR",err);

res.status(500).json({
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

const master = await pool.query(
`SELECT id FROM masters WHERE slug=$1`,
[slug]
);

if(!master.rows.length){
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

const masterId = master.rows[0].id;

const settlements = await pool.query(`
SELECT
sp.id,
sp.period_start AS start_date,
sp.period_end AS end_date,
sp.status,
sp.created_at,
SUM(si.amount_master)::int AS amount,
COUNT(si.id)::int AS items
FROM settlement_periods sp
JOIN settlement_items si ON si.settlement_id=sp.id
WHERE si.master_id=$1
GROUP BY sp.id
ORDER BY sp.period_start DESC
LIMIT 50
`,[masterId]);

res.json({
ok:true,
periods:settlements.rows
});

}catch(err){

console.error("MASTER_SETTLEMENTS_ERROR",err);

res.status(500).json({
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

const master = await pool.query(
`SELECT id FROM masters WHERE slug=$1`,
[slug]
);

if(!master.rows.length){
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

const masterId = master.rows[0].id;

const payouts = await pool.query(`
SELECT
p.id,
p.amount,
p.status,
p.created_at
FROM payouts p
JOIN bookings b ON b.id=p.booking_id
WHERE b.master_id=$1
ORDER BY p.created_at DESC
LIMIT 50
`,[masterId]);

res.json({
ok:true,
payouts:payouts.rows
});

}catch(err){

console.error("MASTER_PAYOUTS_ERROR",err);

res.status(500).json({
ok:false,
error:"MASTER_PAYOUTS_FETCH_FAILED"
});

}

});

/*
ARCHITECTURE CONTRACT (CRITICAL)

Payout ledger is written ONLY by backend (this processor).
Withdraw ledger is written ONLY by backend withdraw routes/processors.

Database trigger:
trg_bridge_payout_paid_to_wallet_ledger
MUST remain DISABLED.

Reason:
Prevent duplicate ledger entries (double-write conflict)
which breaks enforce_ledger_double_entry_row() invariant.

If this trigger is enabled -> system will break.

DO NOT CHANGE WITHOUT FULL FINANCE REFACTOR.
*/

return r;

}
