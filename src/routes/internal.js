import express from "express";
import { pool } from "../db.js";

export function createInternalRouter(){

const r = express.Router();

/*
CREATE MASTER
*/
r.post("/masters/create", async (req,res)=>{

const { name, salon_slug } = req.body;

try{

if(!name || !salon_slug){
return res.status(400).json({ok:false,error:"INVALID_INPUT"});
}

const salon = await pool.query(
`SELECT id FROM salons WHERE slug=$1`,
[salon_slug]
);

if(!salon.rows.length){
return res.status(404).json({ok:false,error:"SALON_NOT_FOUND"});
}

const salonId = salon.rows[0].id;

const slug = name.toLowerCase().replace(/\s+/g,"-") + "-" + Date.now();

const user = await pool.query(
`INSERT INTO auth_users(email,role,master_slug,password_hash)
VALUES($1,'master',$2,'x')
RETURNING id`,
[
slug+"@totem.local",
slug
]
);

const userId = user.rows[0].id;

const master = await pool.query(
`INSERT INTO masters(name,slug,user_id)
VALUES($1,$2,$3)
RETURNING id,name`,
[
name,
slug,
userId
]
);

const masterId = master.rows[0].id;

await pool.query(
`INSERT INTO master_salon(master_id,salon_id,status,invited_at)
VALUES($1,$2,'pending',NOW())`,
[
masterId,
salonId
]
);

res.json({
ok:true,
master:{
id:masterId,
name
}
});

}catch(err){

console.error(err);

res.status(500).json({
ok:false,
error:"MASTER_CREATE_FAILED"
});

}

});

/*
LIST SALON MASTERS
*/
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
SELECT
m.id,
m.name,
ms.status
FROM masters m
JOIN master_salon ms ON ms.master_id=m.id
WHERE ms.salon_id=$1
ORDER BY m.id DESC
`,[salonId]);

res.json({
ok:true,
masters:masters.rows
});

}catch(err){

console.error(err);

res.status(500).json({
ok:false,
error:"MASTERS_FETCH_FAILED"
});

}

});

/*
LIST SALON CLIENTS
*/
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
SELECT
c.id,
c.name,
c.phone,
c.created_at,
COUNT(b.id)::int AS visits
FROM clients c
LEFT JOIN bookings b ON b.client_id=c.id
WHERE c.salon_id=$1
GROUP BY c.id
ORDER BY c.id DESC
`,[salonId]);

res.json({
ok:true,
clients:clients.rows
});

}catch(err){

console.error(err);

res.status(500).json({
ok:false,
error:"CLIENTS_FETCH_FAILED"
});

}

});

/*
LIST SALON BOOKINGS
*/
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
b.status,
b.start_at,
c.name AS client_name,
c.phone,
m.name AS master_name
FROM bookings b
LEFT JOIN clients c ON c.id=b.client_id
LEFT JOIN masters m ON m.id=b.master_id
WHERE b.salon_id=$1
ORDER BY b.id DESC
`,[salonId]);

res.json({
ok:true,
bookings:bookings.rows
});

}catch(err){

console.error(err);

res.status(500).json({
ok:false,
error:"BOOKINGS_FETCH_FAILED"
});

}

});

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

/* BOOKINGS */

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
AND start_at >= NOW() - INTERVAL '7 days'
`,[salonId]);

const bookingsMonth = await pool.query(`
SELECT COUNT(*)::int AS v
FROM bookings
WHERE salon_id=$1
AND start_at >= NOW() - INTERVAL '30 days'
`,[salonId]);

/* CLIENTS */

const clientsTotal = await pool.query(`
SELECT COUNT(*)::int AS v
FROM clients
WHERE salon_id=$1
`,[salonId]);

const clientsToday = await pool.query(`
SELECT COUNT(*)::int AS v
FROM clients
WHERE salon_id=$1
AND DATE(created_at)=CURRENT_DATE
`,[salonId]);

/* MASTERS */

const mastersActive = await pool.query(`
SELECT COUNT(*)::int AS v
FROM master_salon
WHERE salon_id=$1
AND status='active'
`,[salonId]);

const mastersPending = await pool.query(`
SELECT COUNT(*)::int AS v
FROM master_salon
WHERE salon_id=$1
AND status='pending'
`,[salonId]);

const mastersTotal = await pool.query(`
SELECT COUNT(*)::int AS v
FROM master_salon
WHERE salon_id=$1
`,[salonId]);

/* FINANCE */

const revenueToday = await pool.query(`
SELECT COALESCE(SUM(amount),0)::int AS v
FROM payments
WHERE salon_id=$1
AND DATE(created_at)=CURRENT_DATE
`,[salonId]);

const revenueMonth = await pool.query(`
SELECT COALESCE(SUM(amount),0)::int AS v
FROM payments
WHERE salon_id=$1
AND created_at >= NOW() - INTERVAL '30 days'
`,[salonId]);

const paymentsTotal = await pool.query(`
SELECT COUNT(*)::int AS v
FROM payments
WHERE salon_id=$1
`,[salonId]);

res.json({
ok:true,
metrics:{
bookings_today:bookingsToday.rows[0].v,
bookings_week:bookingsWeek.rows[0].v,
bookings_month:bookingsMonth.rows[0].v,
clients_total:clientsTotal.rows[0].v,
clients_today:clientsToday.rows[0].v,
masters_active:mastersActive.rows[0].v,
masters_pending:mastersPending.rows[0].v,
masters_total:mastersTotal.rows[0].v,
revenue_today:revenueToday.rows[0].v,
revenue_month:revenueMonth.rows[0].v,
payments_total:paymentsTotal.rows[0].v
}
});

}catch(err){

console.error("METRICS ERROR:",err);

res.status(500).json({
ok:false,
error:"METRICS_FETCH_FAILED"
});

}

});

return r;

}