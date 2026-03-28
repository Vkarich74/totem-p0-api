import express from "express";

export default function buildXpayRouter({ pool, xpayCreateQR, xpayCheckStatus }){
const r = express.Router();

const XPAY_RELEASE_ENABLED = String(process.env.XPAY_RELEASE_ENABLED || "false").toLowerCase() === "true";

/* ============================= */
/* XPAY QR ENGINE                */
/* ============================= */

r.post("/payments/xpay/create", async (req,res)=>{

if(!XPAY_RELEASE_ENABLED){
return res.status(409).json({
ok:false,
error:"XPAY_DISABLED_UNTIL_PROVIDER_ACTIVATION"
});
}

const { booking_id, amount } = req.body;
const amountValue = parseInt(amount,10);

try{

if(!booking_id || !amount || Number.isNaN(amountValue) || amountValue <= 0){
return res.status(400).json({ok:false,error:"INVALID_INPUT"});
}

const booking = await pool.query(`
SELECT id
FROM bookings
WHERE id=$1
`,[booking_id]);

if(!booking.rows.length){
return res.status(404).json({ok:false,error:"BOOKING_NOT_FOUND"});
}

const payment = await pool.query(`
INSERT INTO payments(
booking_id,
provider,
amount,
status,
is_active
)
VALUES($1,'xpay',$2,'pending',true)
RETURNING id
`,[
booking_id,
amountValue
]);

const paymentId = payment.rows[0].id;

const qr = await xpayCreateQR({
payment_id:paymentId,
amount:amountValue
});

res.json({
ok:true,
payment_id:paymentId,
transaction_id:qr.transaction_id,
qr_code:qr.qr_code,
qr_image:qr.qr_image
});

}catch(err){

console.error("XPAY_CREATE_ERROR",err);

res.status(500).json({
ok:false,
error:"XPAY_CREATE_FAILED"
});

}

});

r.post("/payments/xpay/status", async (req,res)=>{

if(!XPAY_RELEASE_ENABLED){
return res.status(409).json({
ok:false,
error:"XPAY_DISABLED_UNTIL_PROVIDER_ACTIVATION"
});
}

const { transaction_id } = req.body;

try{

if(!transaction_id){
return res.status(400).json({ok:false,error:"TRANSACTION_ID_REQUIRED"});
}

const status = await xpayCheckStatus(transaction_id);

res.json({
ok:true,
status
});

}catch(err){

console.error("XPAY_STATUS_ERROR",err);

res.status(500).json({
ok:false,
error:"XPAY_STATUS_FAILED"
});

}

});

return r;
}
