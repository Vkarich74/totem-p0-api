import express from "express";
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


/* ===========================
SALON API (OWNER CRM)
=========================== */

/*
SALON METRICS
*/
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

/*
SALON MASTERS
*/
r.get("/salons/:slug/masters", async (req,res)=>{

const { slug } = req.params;

try{

const masters = await pool.query(`
SELECT
m.id,
m.name,
ms.status
FROM masters m
JOIN master_salon ms ON ms.master_id=m.id
JOIN salons s ON s.id=ms.salon_id
WHERE s.slug=$1
ORDER BY m.id DESC
`,[slug]);

res.json({
ok:true,
masters:masters.rows
});

}catch(err){

console.error(err);

res.status(500).json({
ok:false,
error:"SALON_MASTERS_FETCH_FAILED"
});

}

});

/*
SALON CLIENTS
*/
r.get("/salons/:slug/clients", async (req,res)=>{

const { slug } = req.params;

try{

const clients = await pool.query(`
SELECT
c.id,
c.name,
c.phone,
c.created_at,
COUNT(b.id)::int AS visits
FROM bookings b
JOIN clients c ON c.id=b.client_id
JOIN master_salon ms ON ms.master_id=b.master_id
JOIN salons s ON s.id=ms.salon_id
WHERE s.slug=$1
GROUP BY c.id
ORDER BY c.id DESC
`,[slug]);

res.json({
ok:true,
clients:clients.rows
});

}catch(err){

console.error(err);

res.status(500).json({
ok:false,
error:"SALON_CLIENTS_FETCH_FAILED"
});

}

});

/*
SALON BOOKINGS
*/
r.get("/salons/:slug/bookings", async (req,res)=>{

const { slug } = req.params;

try{

const bookings = await pool.query(`
SELECT
b.id,
b.status,
b.start_at,
c.name AS client_name,
c.phone,
m.name AS master_name
FROM bookings b
LEFT JOIN clients c ON c.id=b.client_id
LEFT JOIN masters m ON m.id=b.master_id
JOIN master_salon ms ON ms.master_id=b.master_id
JOIN salons s ON s.id=ms.salon_id
WHERE s.slug=$1
ORDER BY b.id DESC
`,[slug]);

res.json({
ok:true,
bookings:bookings.rows
});

}catch(err){

console.error(err);

res.status(500).json({
ok:false,
error:"SALON_BOOKINGS_FETCH_FAILED"
});

}

});


return r;

}