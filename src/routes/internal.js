import express from "express";
import crypto from "crypto";
import { pool } from "../db.js";

export function createInternalRouter(){

const r = express.Router();

/*
GET MASTER BY SLUG
*/
r.get("/masters/:slug", async (req,res)=>{

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
r.get("/masters/:slug/metrics", async (req,res)=>{

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
MASTER BOOKINGS
*/
r.get("/masters/:slug/bookings", async (req,res)=>{

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
r.get("/masters/:slug/clients", async (req,res)=>{

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
SELECT sms.salon_id, s.slug
FROM salon_master_services sms
JOIN salons s ON s.id=sms.salon_id
WHERE sms.master_id=$1
AND sms.service_pk=$2
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
service_id,
null
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
r.get("/salons/:slug", async (req,res)=>{

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
r.get("/salons/:slug/masters", async (req,res)=>{

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
SELECT m.id,m.name,m.slug
FROM masters m
JOIN master_salon ms ON ms.master_id=m.id
WHERE ms.salon_id=$1
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


/* SALON CLIENTS */
r.get("/salons/:slug/clients", async (req,res)=>{

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
r.get("/salons/:slug/bookings", async (req,res)=>{

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
r.get("/salons/:slug/metrics", async (req,res)=>{

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
r.get("/salons/:slug/payments", async (req,res)=>{

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
p.created_at
FROM payments p
JOIN bookings b ON b.id=p.booking_id
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
r.get("/salons/:slug/settlements", async (req,res)=>{

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
r.get("/salons/:slug/payouts", async (req,res)=>{

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
r.get("/salons/:slug/wallet", async (req,res)=>{

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
r.get("/salons/:slug/wallet-balance", async (req,res)=>{

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
COALESCE(v.computed_balance_cents,0) AS computed_balance_cents
FROM totem_test.wallets w
LEFT JOIN totem_test.v_wallet_balance_computed v ON v.wallet_id=w.id
WHERE w.owner_type='salon'
AND w.owner_id=$1
LIMIT 1
`,[salonId]);

res.json({
ok:true,
balance:balance.rows[0] || null
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
r.get("/salons/:slug/ledger", async (req,res)=>{

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
le.amount_cents,
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


/* PAYMENT FLOW */
r.post("/payments/flow", async (req,res)=>{

const { booking_id, service_price } = req.body;

const db = await pool.connect();

try{

await db.query("BEGIN");

if(!booking_id || !service_price){
await db.query("ROLLBACK");
return res.status(400).json({ok:false,error:"INVALID_INPUT"});
}

const bookingCheck = await db.query(`
SELECT
b.id,
b.salon_id
FROM bookings b
WHERE b.id=$1
LIMIT 1
`,[
booking_id
]);

if(!bookingCheck.rows.length){
await db.query("ROLLBACK");
return res.status(404).json({ok:false,error:"BOOKING_NOT_FOUND"});
}

const activePayment = await db.query(`
SELECT id
FROM payments
WHERE booking_id=$1
AND is_active=true
LIMIT 1
`,[
booking_id
]);

if(activePayment.rows.length){
await db.query("ROLLBACK");
return res.status(409).json({
ok:false,
error:"ACTIVE_PAYMENT_EXISTS",
payment_id:activePayment.rows[0].id
});
}

const payment = await db.query(`
INSERT INTO payments(
booking_id,
provider,
amount,
status,
is_active
)
VALUES($1,'direct',$2,'confirmed',true)
RETURNING id,booking_id,amount,status,provider,created_at
`,[
booking_id,
service_price
]);

const paymentId = payment.rows[0].id;
const salonId = bookingCheck.rows[0].salon_id;

const wallet = await db.query(`
SELECT
w.id
FROM totem_test.wallets w
WHERE w.owner_type='salon'
AND w.owner_id=$1
LIMIT 1
`,[
salonId
]);

if(!wallet.rows.length){
await db.query("ROLLBACK");
return res.status(400).json({ok:false,error:"SALON_WALLET_NOT_FOUND"});
}

const salonWallet = wallet.rows[0].id;

const systemWallet = await db.query(`
SELECT wallet_id
FROM totem_test.system_wallets
LIMIT 1
`);

if(!systemWallet.rows.length){
await db.query("ROLLBACK");
return res.status(400).json({ok:false,error:"SYSTEM_WALLET_NOT_FOUND"});
}

const systemWalletId = systemWallet.rows[0].wallet_id;

await db.query(`
INSERT INTO totem_test.ledger_entries(
wallet_id,
direction,
amount_cents,
reference_type,
reference_id
)
VALUES($1,'debit',$2,'payment',$3)
`,[
systemWalletId,
service_price,
String(paymentId)
]);

await db.query(`
INSERT INTO totem_test.ledger_entries(
wallet_id,
direction,
amount_cents,
reference_type,
reference_id
)
VALUES($1,'credit',$2,'payment',$3)
`,[
salonWallet,
service_price,
String(paymentId)
]);

await db.query("COMMIT");

res.json({
ok:true,
payment:payment.rows[0]
});

}catch(err){

try{ await db.query("ROLLBACK"); }catch(e){}

console.error("PAYMENT_FLOW_ERROR",err);

res.status(500).json({
ok:false,
error:"PAYMENT_FLOW_FAILED"
});

}finally{

db.release();

}

});


/* PLATFORM FINANCE REPORT */
r.get("/reports/platform/finance", async (req,res)=>{

try{

const revenue = await pool.query(`
SELECT COALESCE(SUM(amount),0)::int AS total_revenue
FROM payments
WHERE status='confirmed'
`);

const payouts = await pool.query(`
SELECT COALESCE(SUM(amount),0)::int AS total_payouts
FROM payouts
WHERE status='executed'
`);

const wallets = await pool.query(`
SELECT COUNT(*)::int AS wallets_total
FROM totem_test.wallets
`);

res.json({
ok:true,
platform_finance:{
revenue_total:revenue.rows[0].total_revenue,
payouts_total:payouts.rows[0].total_payouts,
wallets_total:wallets.rows[0].wallets_total
}
});

}catch(err){

console.error("PLATFORM_FINANCE_REPORT_ERROR",err);

res.status(500).json({
ok:false,
error:"PLATFORM_FINANCE_REPORT_FAILED"
});

}

});


/* PLATFORM LEDGER REPORT */
r.get("/reports/platform/ledger", async (req,res)=>{

try{

const ledger = await pool.query(`
SELECT *
FROM totem_test.v_ledger_global_balance
`);

res.json({
ok:true,
ledger:ledger.rows
});

}catch(err){

console.error("PLATFORM_LEDGER_REPORT_ERROR",err);

res.status(500).json({
ok:false,
error:"PLATFORM_LEDGER_REPORT_FAILED"
});

}

});


/* PLATFORM RECONCILIATION REPORT */
r.get("/reports/platform/reconciliation", async (req,res)=>{

try{

const summary = await pool.query(`
SELECT *
FROM totem_test.v_reconciliation_summary
`);

res.json({
ok:true,
reconciliation:summary.rows
});

}catch(err){

console.error("RECONCILIATION_REPORT_ERROR",err);

res.status(500).json({
ok:false,
error:"RECONCILIATION_REPORT_FAILED"
});

}

});


/*
MASTER WALLET
*/
r.get("/masters/:slug/wallet", async (req,res)=>{

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
r.get("/masters/:slug/wallet-balance", async (req,res)=>{

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
COALESCE(v.computed_balance_cents,0) AS computed_balance_cents
FROM totem_test.wallets w
LEFT JOIN totem_test.v_wallet_balance_computed v
ON v.wallet_id=w.id
WHERE w.owner_type='master'
AND w.owner_id=$1
LIMIT 1
`,[masterId]);

res.json({
ok:true,
balance:balance.rows[0] || null
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
r.get("/masters/:slug/ledger", async (req,res)=>{

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
le.amount_cents,
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
MASTER PAYOUTS
*/
r.get("/masters/:slug/payouts", async (req,res)=>{

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
p.amount_cents AS amount,
p.status,
p.created_at
FROM payouts p
JOIN totem_test.wallets w ON w.id=p.wallet_id
WHERE w.owner_type='master'
AND w.owner_id=$1
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
return r;

}


