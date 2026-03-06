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
MASTER QUICK BOOKING CREATE
*/
r.post("/masters/:slug/bookings", async (req,res)=>{

const { slug } = req.params;
const { client_name, phone, start_at, service_id } = req.body;

const db = await pool.connect();

try{

await db.query("BEGIN");

/* validate */
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

/* master */
const master = await db.query(
`SELECT id FROM masters WHERE slug=$1`,
[slug]
);

if(!master.rows.length){
await db.query("ROLLBACK");
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

const masterId = master.rows[0].id;


/*
RESOLVE SALON THROUGH SERVICE
(главный фикс)
*/
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


/* client */
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


/*
SLOT LOGIC
reuse slot if exists
*/
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


/* booking */

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

try{
await db.query("ROLLBACK");
}catch(e){}

console.error("BOOKING_ENGINE_ERROR",err);

res.status(500).json({
ok:false,
error:"BOOKING_CREATE_FAILED",
db_error:{
message:err?.message,
detail:err?.detail,
where:err?.where,
code:err?.code
}
});

}finally{

db.release();

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

res.json({
ok:true,
metrics:{
bookings_today:bookingsToday.rows[0].v
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

return r;

}