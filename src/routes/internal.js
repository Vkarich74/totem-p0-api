import express from "express";
import { pool } from "../db.js";

export function createInternalRouter(){

const r = express.Router();

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

const bookingsWeek = await pool.query(`
SELECT COUNT(*)::int AS count
FROM bookings
WHERE salon_id=$1
AND start_at >= NOW() - interval '7 days'
`,[salonId]);

const bookingsMonth = await pool.query(`
SELECT COUNT(*)::int AS count
FROM bookings
WHERE salon_id=$1
AND start_at >= NOW() - interval '30 days'
`,[salonId]);

const completedToday = await pool.query(`
SELECT COUNT(*)::int AS count
FROM bookings
WHERE salon_id=$1
AND status='completed'
AND DATE(start_at)=CURRENT_DATE
`,[salonId]);

const cancelledToday = await pool.query(`
SELECT COUNT(*)::int AS count
FROM bookings
WHERE salon_id=$1
AND status='cancelled'
AND DATE(start_at)=CURRENT_DATE
`,[salonId]);

const revenueToday = await pool.query(`
SELECT COALESCE(SUM(price_snapshot),0)::int AS revenue
FROM bookings
WHERE salon_id=$1
AND status='completed'
AND DATE(start_at)=CURRENT_DATE
`,[salonId]);

const revenueMonth = await pool.query(`
SELECT COALESCE(SUM(price_snapshot),0)::int AS revenue
FROM bookings
WHERE salon_id=$1
AND status='completed'
AND start_at >= NOW() - interval '30 days'
`,[salonId]);

const avgCheck = await pool.query(`
SELECT COALESCE(AVG(price_snapshot),0)::int AS avg
FROM bookings
WHERE salon_id=$1
AND status='completed'
`,[salonId]);

const mastersTotal = await pool.query(`
SELECT COUNT(*)::int AS count
FROM masters m
JOIN master_salon ms ON ms.master_id=m.id
WHERE ms.salon_id=$1
`,[salonId]);

const mastersActive = await pool.query(`
SELECT COUNT(*)::int AS count
FROM master_salon
WHERE salon_id=$1
AND status='active'
`,[salonId]);

const mastersPending = await pool.query(`
SELECT COUNT(*)::int AS count
FROM master_salon
WHERE salon_id=$1
AND status='pending'
`,[salonId]);

const clientsTotal = await pool.query(`
SELECT COUNT(*)::int AS count
FROM clients
WHERE salon_id=$1
`,[salonId]);

const clientsToday = await pool.query(`
SELECT COUNT(*)::int AS count
FROM clients
WHERE salon_id=$1
AND DATE(created_at)=CURRENT_DATE
`,[salonId]);

const servicesTotal = await pool.query(`
SELECT COUNT(*)::int AS count
FROM services_v2
WHERE salon_id=$1
AND is_active=true
`,[salonId]);

const paymentsTotal = await pool.query(`
SELECT COUNT(*)::int AS count
FROM payments p
JOIN bookings b ON b.id=p.booking_id
WHERE b.salon_id=$1
`,[salonId]);

const refundsTotal = await pool.query(`
SELECT COUNT(*)::int AS count
FROM payment_refunds r
JOIN bookings b ON b.id=r.booking_id
WHERE b.salon_id=$1
`,[salonId]);

const slotsToday = await pool.query(`
SELECT COUNT(*)::int AS count
FROM calendar_slots
WHERE salon_id=$1
AND DATE(start_at)=CURRENT_DATE
`,[salonId]);

const slotsBooked = await pool.query(`
SELECT COUNT(*)::int AS count
FROM calendar_slots
WHERE salon_id=$1
AND status='booked'
AND DATE(start_at)=CURRENT_DATE
`,[salonId]);

const loadToday =
slotsToday.rows[0].count === 0
? 0
: Math.round(
(slotsBooked.rows[0].count / slotsToday.rows[0].count) * 100
);

res.json({
ok:true,
metrics:{

bookings_today:bookingsToday.rows[0].count,
bookings_week:bookingsWeek.rows[0].count,
bookings_month:bookingsMonth.rows[0].count,

completed_today:completedToday.rows[0].count,
cancelled_today:cancelledToday.rows[0].count,

revenue_today:revenueToday.rows[0].revenue,
revenue_month:revenueMonth.rows[0].revenue,
avg_check:avgCheck.rows[0].avg,

masters_total:mastersTotal.rows[0].count,
masters_active:mastersActive.rows[0].count,
masters_pending:mastersPending.rows[0].count,

clients_total:clientsTotal.rows[0].count,
clients_today:clientsToday.rows[0].count,

services_total:servicesTotal.rows[0].count,

payments_total:paymentsTotal.rows[0].count,
refunds_total:refundsTotal.rows[0].count,

slots_today:slotsToday.rows[0].count,
slots_booked_today:slotsBooked.rows[0].count,
load_today:loadToday

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