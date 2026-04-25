import fetch from "node-fetch";
import crypto from "crypto";

/*
XPAY CONFIG
в .env должны быть

XPAY_API_URL
XPAY_CLIENT_ID
XPAY_CLIENT_SECRET
XPAY_SERVICE_UUID

optional:
XPAY_CALLBACK_URL
XPAY_RETURN_URL

Legacy env names XPAY_API_KEY and XPAY_MERCHANT_ID are not used by XPAY API v1.4.
*/

const XPAY_API_URL = process.env.XPAY_API_URL || "";
const XPAY_CLIENT_ID = process.env.XPAY_CLIENT_ID || "";
const XPAY_CLIENT_SECRET = process.env.XPAY_CLIENT_SECRET || "";
const XPAY_SERVICE_UUID = process.env.XPAY_SERVICE_UUID || "";
const XPAY_CALLBACK_URL = process.env.XPAY_CALLBACK_URL || "";
const XPAY_RETURN_URL = process.env.XPAY_RETURN_URL || "";

function trimTrailingSlash(value){
return String(value || "").replace(/\/+$/, "");
}

function requireString(value, errorCode){
if(!value || !String(value).trim()){
throw new Error(errorCode);
}
return String(value).trim();
}

async function readJsonResponse(resp, fallbackError){
const text = await resp.text();

let data = null;

if(text){
try{
data = JSON.parse(text);
}catch(_err){
throw new Error(`${fallbackError}: ${text}`);
}
}

if(!resp.ok){
const message = data?.message || data?.error || text || resp.statusText;
throw new Error(`${fallbackError}: ${message}`);
}

return data;
}

export function assertXpayConfig(){
requireString(XPAY_API_URL,"XPAY_API_URL_NOT_CONFIGURED");
requireString(XPAY_CLIENT_ID,"XPAY_CLIENT_ID_NOT_CONFIGURED");
requireString(XPAY_CLIENT_SECRET,"XPAY_CLIENT_SECRET_NOT_CONFIGURED");

return {
apiUrl:trimTrailingSlash(XPAY_API_URL),
clientId:XPAY_CLIENT_ID,
clientSecret:XPAY_CLIENT_SECRET,
serviceUuid:XPAY_SERVICE_UUID || null,
callbackUrl:XPAY_CALLBACK_URL || null,
returnUrl:XPAY_RETURN_URL || null
};
}

export function normalizeXpayAmountToTyiyn(amount){
const amountValue = Number(amount);

if(!Number.isFinite(amountValue) || amountValue <= 0){
throw new Error("XPAY_INVALID_AMOUNT");
}

return Math.round(amountValue * 100);
}

export function mapXpayDynamicStatusToTotem(status){
const normalized = String(status || "").toUpperCase();

if(normalized === "COMPLETED"){
return "confirmed";
}

if(normalized === "ERROR" || normalized === "CANCELED"){
return "failed";
}

if(normalized === "WAITING" || normalized === "ACTIVE" || normalized === "PROCESSING"){
return "pending";
}

return "pending";
}

export function mapXpayStaticStatusToTotem(status){
const normalized = String(status || "").toUpperCase();

if(normalized === "COMPLETED"){
return "confirmed";
}

if(normalized === "ACTIVE" || normalized === "BLOCKED"){
return "pending";
}

return "pending";
}

export async function xpayLogin(){
const config = assertXpayConfig();

const resp = await fetch(`${config.apiUrl}/api/v1/developer/login`,{
method:"POST",
headers:{
"Content-Type":"application/json",
"Accept":"application/json"
},
body:JSON.stringify({
client_id:config.clientId,
client_secret:config.clientSecret
})
});

const data = await readJsonResponse(resp,"XPAY_AUTH_FAILED");

if(data?.status !== "Success" || !data?.data?.access_token){
throw new Error(`XPAY_AUTH_FAILED: ${data?.message || "invalid response"}`);
}

const serviceUuid = config.serviceUuid || data.data.service?.[0]?.uuid || null;

if(!serviceUuid){
throw new Error("XPAY_SERVICE_UUID_NOT_CONFIGURED");
}

return {
access_token:data.data.access_token,
token_type:data.data.token_type || "Bearer",
expires_at:data.data.expires_at || null,
service_uuid:serviceUuid,
service:data.data.service || []
};
}

function buildQrPayload({ service_uuid, amount, type, payment_id, service_id, service_name, comments, callback_url, return_url, amount_change, qr_pos }){
const payload = {
uuid:service_uuid,
amount:normalizeXpayAmountToTyiyn(amount),
type:type || "dynamic",
amount_change:Boolean(amount_change),
qr_pos:Boolean(qr_pos)
};

if(payment_id && !service_id){
payload.service_id = `totem-payment-${payment_id}`;
}

if(service_id){
payload.service_id = String(service_id);
}

if(service_name){
payload.service_name = String(service_name);
}

if(comments){
payload.comments = String(comments);
}

if(callback_url){
payload.callback_url = String(callback_url);
}

if(return_url){
payload.return_url = String(return_url);
}

return payload;
}

async function xpayCreateQRRequest(payload){
const config = assertXpayConfig();
const login = await xpayLogin();

const resp = await fetch(`${config.apiUrl}/api/v1/developer/qr/get`,{
method:"POST",
headers:{
"Content-Type":"application/json",
"Accept":"application/json",
"Authorization":`${login.token_type || "Bearer"} ${login.access_token}`
},
body:JSON.stringify(payload)
});

const data = await readJsonResponse(resp,"XPAY_QR_CREATE_FAILED");

if(data?.status !== "Success" || !data?.data?.qr_transaction_id){
throw new Error(`XPAY_QR_CREATE_FAILED: ${data?.message || "invalid response"}`);
}

return {
qr_transaction_id:data.data.qr_transaction_id,
transaction_id:data.data.qr_transaction_id,
identificator:data.data.identificator || null,
qr_code:data.data.qr_code || null,
qr_image:data.data.qr_image || null,
type:data.data.type || payload.type || null,
request_amount:data.data.request_amount ?? null,
amount:data.data.amount ?? null,
payable:data.data.payable ?? null,
raw:data
};
}

export async function xpayCreateDynamicQR({ payment_id, amount, service_id, service_name, comments, callback_url, return_url }){
const config = assertXpayConfig();
const login = await xpayLogin();

const payload = buildQrPayload({
service_uuid:login.service_uuid,
amount,
type:"dynamic",
payment_id,
service_id,
service_name:service_name || "TOTEM booking payment",
comments:comments || (payment_id ? `Оплата бронирования TOTEM #${payment_id}` : "Оплата бронирования TOTEM"),
callback_url:callback_url || config.callbackUrl,
return_url:return_url || config.returnUrl,
amount_change:false,
qr_pos:false
});

return xpayCreateQRRequest(payload);
}

export async function xpayCreateStaticQR({ payment_id, amount, service_id, service_name, comments, callback_url, return_url }){
const config = assertXpayConfig();
const login = await xpayLogin();

const payload = buildQrPayload({
service_uuid:login.service_uuid,
amount,
type:"static",
payment_id,
service_id,
service_name:service_name || "TOTEM static payment",
comments:comments || "Оплата в салоне TOTEM",
callback_url:callback_url || config.callbackUrl,
return_url:return_url || config.returnUrl,
amount_change:false,
qr_pos:false
});

return xpayCreateQRRequest(payload);
}

/*
CREATE QR
Legacy-compatible export. Uses XPAY dynamic QR v1.4.
*/
export async function xpayCreateQR({ payment_id, amount }){
return xpayCreateDynamicQR({ payment_id, amount });
}

export async function xpayCheckDynamicQRStatus(qr_transaction_id){
const config = assertXpayConfig();
const login = await xpayLogin();
const transactionId = requireString(qr_transaction_id,"XPAY_QR_TRANSACTION_ID_REQUIRED");

const resp = await fetch(
`${config.apiUrl}/api/v1/developer/qr/dynamic/status/${encodeURIComponent(transactionId)}`,
{
method:"GET",
headers:{
"Accept":"application/json",
"Authorization":`${login.token_type || "Bearer"} ${login.access_token}`
}
}
);

const data = await readJsonResponse(resp,"XPAY_STATUS_FAILED");

if(data?.status !== "Success" || !data?.data){
throw new Error(`XPAY_STATUS_FAILED: ${data?.message || "invalid response"}`);
}

return {
qr_transaction_id:data.data.qr_transaction_id || transactionId,
pay_status:data.data.pay_status || null,
totem_status:mapXpayDynamicStatusToTotem(data.data.pay_status),
transaction_uuid:data.data.transaction_uuid || null,
trx:data.data.trx || null,
request_amount:data.data.request_amount ?? null,
amount:data.data.amount ?? null,
payable:data.data.payable ?? null,
created_at:data.data.created_at || null,
executed_time:data.data.executed_time || null,
raw:data
};
}

export async function xpayCheckStaticQRStatus(qr_transaction_id){
const config = assertXpayConfig();
const login = await xpayLogin();
const transactionId = requireString(qr_transaction_id,"XPAY_QR_TRANSACTION_ID_REQUIRED");

const resp = await fetch(
`${config.apiUrl}/api/v1/developer/qr/ecom/static/status/${encodeURIComponent(transactionId)}`,
{
method:"GET",
headers:{
"Accept":"application/json",
"Authorization":`${login.token_type || "Bearer"} ${login.access_token}`
}
}
);

const data = await readJsonResponse(resp,"XPAY_STATIC_STATUS_FAILED");

if(data?.status !== "Success" || !data?.data){
throw new Error(`XPAY_STATIC_STATUS_FAILED: ${data?.message || "invalid response"}`);
}

return {
qr_transaction_id:data.data.qr_transaction_id || transactionId,
qr_status:data.data.qr_status || null,
totem_status:mapXpayStaticStatusToTotem(data.data.qr_status),
request_amount:data.data.request_amount ?? null,
amount:data.data.amount ?? null,
payable:data.data.payable ?? null,
last_update:data.data.last_update || null,
raw:data
};
}

export async function xpaySetStaticQRStatus(qr_transaction_id, qr_status){
const config = assertXpayConfig();
const login = await xpayLogin();
const transactionId = requireString(qr_transaction_id,"XPAY_QR_TRANSACTION_ID_REQUIRED");
const status = String(qr_status || "").toUpperCase();

if(status !== "ACTIVE" && status !== "BLOCKED"){
throw new Error("XPAY_INVALID_STATIC_QR_STATUS");
}

const resp = await fetch(
`${config.apiUrl}/api/v1/developer/qr/ecom/static/status/${encodeURIComponent(transactionId)}`,
{
method:"POST",
headers:{
"Content-Type":"application/json",
"Accept":"application/json",
"Authorization":`${login.token_type || "Bearer"} ${login.access_token}`
},
body:JSON.stringify({
qr_transaction_id:transactionId,
qr_status:status
})
}
);

const data = await readJsonResponse(resp,"XPAY_STATIC_STATUS_UPDATE_FAILED");

if(data?.status !== "Success" || !data?.data){
throw new Error(`XPAY_STATIC_STATUS_UPDATE_FAILED: ${data?.message || "invalid response"}`);
}

return {
qr_transaction_id:data.data.qr_transaction_id || transactionId,
qr_status:data.data.qr_status || status,
totem_status:mapXpayStaticStatusToTotem(data.data.qr_status || status),
request_amount:data.data.request_amount ?? null,
amount:data.data.amount ?? null,
payable:data.data.payable ?? null,
last_update:data.data.last_update || null,
raw:data
};
}

/*
CHECK PAYMENT STATUS
Legacy-compatible export. Checks XPAY dynamic QR status by qr_transaction_id.
*/
export async function xpayCheckStatus(transaction_id){
return xpayCheckDynamicQRStatus(transaction_id);
}


/*
VERIFY WEBHOOK
Signature verification is kept for compatibility.
XPAY webhook must still be verified by server-to-server status check in route layer.
*/
export function xpayVerifyWebhook(signature, payload, secret){

if(!signature || !secret){
return false;
}

const hmac = crypto
.createHmac("sha256", secret)
.update(payload)
.digest("hex");

try{
return crypto.timingSafeEqual(Buffer.from(hmac),Buffer.from(signature));
}catch(_err){
return false;
}

}
