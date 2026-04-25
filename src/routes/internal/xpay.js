import express from "express";

export default function buildXpayRouter({ pool, xpayCreateQR, xpayCheckStatus, xpayCreateDynamicQR }){
const r = express.Router();

const XPAY_RELEASE_ENABLED = String(process.env.XPAY_RELEASE_ENABLED || "false").toLowerCase() === "true";
const XPAY_DYNAMIC_ENABLED = String(process.env.XPAY_DYNAMIC_ENABLED || "false").toLowerCase() === "true";

const createDynamicQR = xpayCreateDynamicQR || xpayCreateQR;

/* ============================= */
/* XPAY QR ENGINE                */
/* ============================= */

function normalizePaymentRow(row){
if(!row){
return null;
}

return {
id:row.id,
booking_id:row.booking_id,
provider:row.provider,
status:row.status,
amount:row.amount,
qr_transaction_id:row.qr_transaction_id || null,
is_active:row.is_active
};
}

function parsePositiveInteger(value){
const parsed = parseInt(value,10);

if(Number.isNaN(parsed) || parsed <= 0){
return null;
}

return parsed;
}

r.post("/payments/xpay/create", async (req,res)=>{

if(!XPAY_RELEASE_ENABLED){
return res.status(409).json({
ok:false,
error:"XPAY_DISABLED_UNTIL_PROVIDER_ACTIVATION"
});
}

if(!XPAY_DYNAMIC_ENABLED){
return res.status(409).json({
ok:false,
error:"XPAY_DYNAMIC_DISABLED_UNTIL_PROVIDER_ACTIVATION"
});
}

const bookingId = parsePositiveInteger(req.body?.booking_id);

if(!bookingId){
return res.status(400).json({
ok:false,
error:"BOOKING_ID_REQUIRED"
});
}

if(typeof createDynamicQR !== "function"){
return res.status(500).json({
ok:false,
error:"XPAY_CREATE_QR_ADAPTER_NOT_CONFIGURED"
});
}

const client = await pool.connect();

try{

await client.query("BEGIN");

const booking = await client.query(`
SELECT
id,
status,
price_snapshot
FROM bookings
WHERE id=$1
FOR UPDATE
`,[bookingId]);

if(!booking.rows.length){
await client.query("ROLLBACK");

return res.status(404).json({
ok:false,
error:"BOOKING_NOT_FOUND"
});
}

const bookingRow = booking.rows[0];
const bookingStatus = String(bookingRow.status || "").toLowerCase();

if(!["reserved"].includes(bookingStatus)){
await client.query("ROLLBACK");

return res.status(409).json({
ok:false,
error:"BOOKING_NOT_PAYABLE",
booking_status:bookingRow.status
});
}

const amountValue = parsePositiveInteger(bookingRow.price_snapshot);

if(!amountValue){
await client.query("ROLLBACK");

return res.status(409).json({
ok:false,
error:"BOOKING_PRICE_MISSING"
});
}

const existingPayment = await client.query(`
SELECT
id,
booking_id,
provider,
status,
amount,
qr_transaction_id,
is_active
FROM payments
WHERE booking_id=$1
AND is_active=true
ORDER BY id DESC
LIMIT 1
FOR UPDATE
`,[bookingId]);

if(existingPayment.rows.length){
const existing = existingPayment.rows[0];

if(existing.status === "confirmed"){
await client.query("ROLLBACK");

return res.status(409).json({
ok:false,
error:"BOOKING_ALREADY_PAID",
payment:normalizePaymentRow(existing)
});
}

await client.query("ROLLBACK");

return res.status(409).json({
ok:false,
error:"ACTIVE_PAYMENT_EXISTS",
payment:normalizePaymentRow(existing)
});
}

const payment = await client.query(`
INSERT INTO payments(
booking_id,
provider,
amount,
status,
is_active
)
VALUES($1,'xpay',$2,'pending',true)
RETURNING
id,
booking_id,
provider,
status,
amount,
qr_transaction_id,
is_active
`,[
bookingId,
amountValue
]);

const paymentRow = payment.rows[0];

const qr = await createDynamicQR({
payment_id:paymentRow.id,
amount:amountValue,
service_id:`totem-payment-${paymentRow.id}`,
service_name:"TOTEM booking payment",
comments:`Оплата бронирования TOTEM #${bookingId}`
});

const qrTransactionId = qr.qr_transaction_id || qr.transaction_id;

if(!qrTransactionId){
throw new Error("XPAY_QR_TRANSACTION_ID_MISSING");
}

const updatedPayment = await client.query(`
UPDATE payments
SET
qr_transaction_id=$2,
updated_at=now()
WHERE id=$1
RETURNING
id,
booking_id,
provider,
status,
amount,
qr_transaction_id,
is_active
`,[
paymentRow.id,
qrTransactionId
]);

await client.query("COMMIT");

res.json({
ok:true,
payment:normalizePaymentRow(updatedPayment.rows[0]),
payment_id:updatedPayment.rows[0].id,
qr_transaction_id:qrTransactionId,
transaction_id:qrTransactionId,
qr_code:qr.qr_code || null,
qr_image:qr.qr_image || null
});

}catch(err){

try{
await client.query("ROLLBACK");
}catch(rollbackErr){
console.error("XPAY_CREATE_ROLLBACK_ERROR",rollbackErr);
}

if(err?.code === "23505"){
return res.status(409).json({
ok:false,
error:"ACTIVE_PAYMENT_EXISTS"
});
}

console.error("XPAY_CREATE_ERROR",err);

res.status(500).json({
ok:false,
error:"XPAY_CREATE_FAILED"
});

}finally{

client.release();

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
