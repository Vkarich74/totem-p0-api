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
SELECT COUNT(*)::int AS count
FROM bookings
WHERE salon_id=$1
AND DATE(start_at)=CURRENT_DATE
`,[salonId]);

res.json({
ok:true,
metrics:{
bookings_today:bookingsToday.rows[0].count
}
});

}catch(err){

console.error(err);

res.status(500).json({
ok:false,
error:"METRICS_FETCH_FAILED"
});

}

});

return r;

}