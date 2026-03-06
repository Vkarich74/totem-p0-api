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

const db = await pool.connect();

try{

await db.query("BEGIN");

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

/* salon */

const salon = await db.query(`
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

const existingClient = await db.query(
`SELECT id FROM clients WHERE salon_id=$1 AND phone=$2 LIMIT 1`,
[salonId, phone]
);

if(existingClient.rows.length){

clientId = existingClient.rows[0].id;

}else{

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
client_name || "client",
phone
]);

clientId = createdClient.rows[0].id;

}

/* slot */

const start = new Date(start_at);
const end = new Date(start.getTime() + 30*60000);

let slotId;

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

}else{

const slot = await db.query(`
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

await db.query("ROLLBACK");

console.error("BOOKING_CREATE_ERROR",err);

res.status(500).json({
ok:false,
error:"BOOKING_CREATE_FAILED"
});

}finally{

db.release();

}

});

return r;

}