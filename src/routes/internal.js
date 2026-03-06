import express from "express";
import crypto from "crypto";
import { pool } from "../db.js";

function slugify(text){
return text
.toLowerCase()
.trim()
.replace(/[^a-z0-9\s-]/g,"")
.replace(/\s+/g,"-")
.replace(/-+/g,"-");
}

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
AND status NOT IN ('cancelled','canceled')
`,[masterId]);

const bookingsWeek = await pool.query(`
SELECT COUNT(*)::int AS v
FROM bookings
WHERE master_id=$1
AND start_at >= NOW() - INTERVAL '7 days'
AND status NOT IN ('cancelled','canceled')
`,[masterId]);

const clientsTotal = await pool.query(`
SELECT COUNT(DISTINCT client_id)::int AS v
FROM bookings
WHERE master_id=$1
AND client_id IS NOT NULL
`,[masterId]);

const revenueToday = await pool.query(`
SELECT COALESCE(SUM(p.amount),0)::int AS v
FROM payments p
JOIN bookings b ON b.id=p.booking_id
WHERE b.master_id=$1
AND p.status='confirmed'
AND DATE(b.start_at)=CURRENT_DATE
`,[masterId]);

const revenueMonth = await pool.query(`
SELECT COALESCE(SUM(p.amount),0)::int AS v
FROM payments p
JOIN bookings b ON b.id=p.booking_id
WHERE b.master_id=$1
AND p.status='confirmed'
AND b.start_at >= date_trunc('month',NOW())
`,[masterId]);

res.json({
ok:true,
metrics:{
bookings_today:bookingsToday.rows[0].v,
bookings_week:bookingsWeek.rows[0].v,
clients_total:clientsTotal.rows[0].v,
revenue_today:revenueToday.rows[0].v,
revenue_month:revenueMonth.rows[0].v
}
});

}catch(err){

console.error("MASTER METRICS ERROR:",err);

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

console.error(err);

res.status(500).json({
ok:false,
error:"MASTER_BOOKINGS_FETCH_FAILED"
});

}

});

/*
MASTER QUICK BOOKING CREATE
*/
r.post("/masters/:slug/bookings", async (req,res)=>{

const { slug } = req.params;
const { client_name, phone, start_at, service_id } = req.body;

try{

const master = await pool.query(
`SELECT id FROM masters WHERE slug=$1`,
[slug]
);

if(!master.rows.length){
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

const masterId = master.rows[0].id;

/* salon */

const salon = await pool.query(`
SELECT s.id,s.slug
FROM salons s
JOIN master_salon ms ON ms.salon_id=s.id
WHERE ms.master_id=$1
LIMIT 1
`,[masterId]);

const salonId = salon.rows[0].id;
const salonSlug = salon.rows[0].slug;

/* client */

let clientId;

const existing = await pool.query(
`SELECT id FROM clients WHERE phone=$1 LIMIT 1`,
[phone]
);

if(existing.rows.length){

clientId = existing.rows[0].id;

}else{

const c = await pool.query(`
INSERT INTO clients(
salon_id,
name,
phone
)
VALUES($1,$2,$3)
RETURNING id
`,[
salonId,
client_name || "client",
phone
]);

clientId = c.rows[0].id;

}

/* service */

const service = await pool.query(
`SELECT price FROM services_v2 WHERE id=$1`,
[service_id]
);

const price = service.rows.length ? service.rows[0].price : 0;

/* slot */

const start = new Date(start_at);
const end = new Date(start.getTime()+30*60000);

const slot = await pool.query(`
INSERT INTO calendar_slots(
salon_id,
master_id,
start_at,
end_at,
status
)
VALUES($1,$2,$3,$4,'reserved')
RETURNING id
`,[
salonId,
masterId,
start,
end
]);

const slotId = slot.rows[0].id;

/* request */

const requestId = crypto.randomUUID();

/* booking */

const booking = await pool.query(`
INSERT INTO bookings(
salon_id,
salon_slug,
master_id,
client_id,
start_at,
end_at,
status,
request_id,
calendar_slot_id,
service_id,
price_snapshot
)
VALUES($1,$2,$3,$4,$5,$6,'reserved',$7,$8,$9,$10)
RETURNING *
`,[
salonId,
salonSlug,
masterId,
clientId,
start,
end,
requestId,
slotId,
service_id,
price
]);

res.json({
ok:true,
booking:booking.rows[0]
});

}catch(err){

console.error(err);

res.status(500).json({
ok:false,
error:"BOOKING_CREATE_FAILED"
});

}

});

/* ===========================
SALON API
=========================== */

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
FROM bookings b
JOIN master_salon ms ON ms.master_id=b.master_id
WHERE ms.salon_id=$1
AND DATE(start_at)=CURRENT_DATE
`,[salonId]);

const bookingsWeek = await pool.query(`
SELECT COUNT(*)::int AS v
FROM bookings b
JOIN master_salon ms ON ms.master_id=b.master_id
WHERE ms.salon_id=$1
AND start_at >= NOW() - INTERVAL '7 days'
`,[salonId]);

const clientsTotal = await pool.query(`
SELECT COUNT(DISTINCT client_id)::int AS v
FROM bookings b
JOIN master_salon ms ON ms.master_id=b.master_id
WHERE ms.salon_id=$1
`,[salonId]);

const revenueToday = await pool.query(`
SELECT COALESCE(SUM(p.amount),0)::int AS v
FROM payments p
JOIN bookings b ON b.id=p.booking_id
JOIN master_salon ms ON ms.master_id=b.master_id
WHERE ms.salon_id=$1
AND DATE(b.start_at)=CURRENT_DATE
`,[salonId]);

const revenueMonth = await pool.query(`
SELECT COALESCE(SUM(p.amount),0)::int AS v
FROM payments p
JOIN bookings b ON b.id=p.booking_id
JOIN master_salon ms ON ms.master_id=b.master_id
WHERE ms.salon_id=$1
AND b.start_at >= date_trunc('month',NOW())
`,[salonId]);

res.json({
ok:true,
metrics:{
bookings_today:bookingsToday.rows[0].v,
bookings_week:bookingsWeek.rows[0].v,
clients_total:clientsTotal.rows[0].v,
revenue_today:revenueToday.rows[0].v,
revenue_month:revenueMonth.rows[0].v
}
});

}catch(err){

console.error(err);

res.status(500).json({
ok:false,
error:"SALON_METRICS_FAILED"
});

}

});

return r;

}