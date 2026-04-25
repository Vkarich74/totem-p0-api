import express from "express";

export default function buildXpayRouter({ pool, xpayCreateQR, xpayCheckStatus, xpayCreateDynamicQR, xpayCheckDynamicQRStatus }){
const r = express.Router();

const XPAY_RELEASE_ENABLED = String(process.env.XPAY_RELEASE_ENABLED || "false").toLowerCase() === "true";
const XPAY_DYNAMIC_ENABLED = String(process.env.XPAY_DYNAMIC_ENABLED || "false").toLowerCase() === "true";

const createDynamicQR = xpayCreateDynamicQR || xpayCreateQR;
const checkDynamicQRStatus = xpayCheckDynamicQRStatus || xpayCheckStatus;

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

function mapXpayDynamicStatusToTotem(xpayStatus){
const normalized = String(xpayStatus || "").trim().toUpperCase();

if(["WAITING","ACTIVE","PROCESSING"].includes(normalized)){
return "pending";
}

if(normalized === "COMPLETED"){
return "confirmed";
}

if(["ERROR","CANCELED"].includes(normalized)){
return "failed";
}

return "pending";
}

function extractXpayStatus(statusResponse){
if(!statusResponse){
return null;
}

if(typeof statusResponse === "string"){
return statusResponse;
}

return statusResponse?.pay_status
|| statusResponse?.status
|| statusResponse?.data?.pay_status
|| statusResponse?.data?.status
|| null;
}

function extractQrTransactionId(value){
if(!value){
return null;
}

if(typeof value === "string"){
return null;
}

if(value.qr_transaction_id){
return value.qr_transaction_id;
}

if(value.transaction_id){
return value.transaction_id;
}

if(value.data){
const nested = extractQrTransactionId(value.data);
if(nested){
return nested;
}
}

for(const key of Object.keys(value)){
const item = value[key];

if(item && typeof item === "object"){
const nested = extractQrTransactionId(item);
if(nested){
return nested;
}
}
}

return null;
}

async function recordXpayEvent(event,payload){
try{
await pool.query(`
INSERT INTO payment_events(
id,
intent_id,
event,
payload
)
VALUES(gen_random_uuid(),gen_random_uuid(),$1,$2::jsonb)
`,[
event,
JSON.stringify(payload || {})
]);
}catch(err){
console.error("XPAY_PAYMENT_EVENT_WRITE_FAILED",err?.message || err);
}
}

async function verifyAndUpdatePaymentStatus({ paymentId, qrTransactionId }){
if(typeof checkDynamicQRStatus !== "function"){
return {
ok:false,
httpStatus:500,
body:{ok:false,error:"XPAY_STATUS_ADAPTER_NOT_CONFIGURED"}
};
}

const client = await pool.connect();

try{
await client.query("BEGIN");

let payment;

if(paymentId){
payment = await client.query(`
SELECT
id,
booking_id,
provider,
status,
amount,
qr_transaction_id,
is_active
FROM payments
WHERE id=$1
FOR UPDATE
`,[paymentId]);
}else{
payment = await client.query(`
SELECT
id,
booking_id,
provider,
status,
amount,
qr_transaction_id,
is_active
FROM payments
WHERE qr_transaction_id=$1
FOR UPDATE
`,[qrTransactionId]);
}

if(!payment.rows.length){
await client.query("ROLLBACK");

return {
ok:false,
httpStatus:404,
body:{ok:false,error:"PAYMENT_NOT_FOUND"}
};
}

const paymentRow = payment.rows[0];

if(paymentRow.provider !== "xpay"){
await client.query("ROLLBACK");

return {
ok:false,
httpStatus:409,
body:{ok:false,error:"PAYMENT_PROVIDER_MISMATCH",payment:normalizePaymentRow(paymentRow)}
};
}

const transactionId = paymentRow.qr_transaction_id || qrTransactionId;

if(!transactionId){
await client.query("ROLLBACK");

return {
ok:false,
httpStatus:409,
body:{ok:false,error:"PAYMENT_QR_TRANSACTION_MISSING",payment:normalizePaymentRow(paymentRow)}
};
}

const providerStatus = await checkDynamicQRStatus(transactionId);
const xpayStatus = extractXpayStatus(providerStatus);
const mappedStatus = mapXpayDynamicStatusToTotem(xpayStatus);

let nextStatus = paymentRow.status;

if(paymentRow.status === "pending"){
if(mappedStatus === "confirmed"){
nextStatus = "confirmed";
}else if(mappedStatus === "failed"){
nextStatus = "failed";
}
}

let updatedPayment = paymentRow;

if(nextStatus !== paymentRow.status){
const updated = await client.query(`
UPDATE payments
SET
status=$2,
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
nextStatus
]);

updatedPayment = updated.rows[0];
}

await client.query("COMMIT");

await recordXpayEvent("xpay_status_verified",{
payment_id:updatedPayment.id,
booking_id:updatedPayment.booking_id,
qr_transaction_id:transactionId,
xpay_status:xpayStatus,
totem_status:updatedPayment.status,
provider_response:providerStatus
});

return {
ok:true,
httpStatus:200,
body:{
ok:true,
payment:normalizePaymentRow(updatedPayment),
payment_id:updatedPayment.id,
qr_transaction_id:transactionId,
xpay_status:xpayStatus,
totem_status:updatedPayment.status,
status:providerStatus
}
};

}catch(err){
try{
await client.query("ROLLBACK");
}catch(rollbackErr){
console.error("XPAY_STATUS_ROLLBACK_ERROR",rollbackErr);
}

console.error("XPAY_STATUS_ERROR",err);

return {
ok:false,
httpStatus:500,
body:{ok:false,error:"XPAY_STATUS_FAILED"}
};

}finally{

client.release();

}
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

await recordXpayEvent("xpay_dynamic_qr_created",{
payment_id:updatedPayment.rows[0].id,
booking_id:bookingId,
qr_transaction_id:qrTransactionId,
provider_response:qr
});

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

if(!XPAY_DYNAMIC_ENABLED){
return res.status(409).json({
ok:false,
error:"XPAY_DYNAMIC_DISABLED_UNTIL_PROVIDER_ACTIVATION"
});
}

const paymentId = parsePositiveInteger(req.body?.payment_id);
const qrTransactionId = req.body?.qr_transaction_id || req.body?.transaction_id || null;

if(!paymentId && !qrTransactionId){
return res.status(400).json({
ok:false,
error:"PAYMENT_ID_REQUIRED"
});
}

const result = await verifyAndUpdatePaymentStatus({
paymentId,
qrTransactionId
});

res.status(result.httpStatus).json(result.body);

});

r.post("/payments/xpay/webhook", async (req,res)=>{

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

const payload = req.body || {};
const qrTransactionId = extractQrTransactionId(payload);

await recordXpayEvent("xpay_webhook_received",{
qr_transaction_id:qrTransactionId,
payload
});

if(!qrTransactionId){
return res.status(202).json({
ok:true,
accepted:false,
ignored:true,
reason:"QR_TRANSACTION_ID_NOT_FOUND"
});
}

const result = await verifyAndUpdatePaymentStatus({
paymentId:null,
qrTransactionId
});

if(!result.ok && result.httpStatus === 404){
return res.status(202).json({
ok:true,
accepted:false,
ignored:true,
reason:"PAYMENT_NOT_FOUND"
});
}

res.status(result.httpStatus).json({
...result.body,
accepted:result.ok
});

});

return r;
}
