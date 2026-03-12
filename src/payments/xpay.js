import fetch from "node-fetch";

/*
XPAY CONFIG
в .env должны быть

XPAY_API_URL
XPAY_API_KEY
XPAY_MERCHANT_ID
*/

const XPAY_API_URL = process.env.XPAY_API_URL || "";
const XPAY_API_KEY = process.env.XPAY_API_KEY || "";
const XPAY_MERCHANT_ID = process.env.XPAY_MERCHANT_ID || "";


/*
CREATE QR
*/
export async function xpayCreateQR({ payment_id, amount }){

if(!XPAY_API_URL){
throw new Error("XPAY_API_URL_NOT_CONFIGURED");
}

const payload = {
merchant_id: XPAY_MERCHANT_ID,
payment_id: String(payment_id),
amount: amount,
currency: "KGS"
};

const resp = await fetch(`${XPAY_API_URL}/qr/create`,{
method:"POST",
headers:{
"Content-Type":"application/json",
"Authorization":`Bearer ${XPAY_API_KEY}`
},
body:JSON.stringify(payload)
});

if(!resp.ok){

const text = await resp.text();

throw new Error(`XPAY_QR_CREATE_FAILED: ${text}`);

}

const data = await resp.json();

/*
expected response

{
transaction_id
qr_code
qr_image
}
*/

return {
transaction_id:data.transaction_id,
qr_code:data.qr_code,
qr_image:data.qr_image
};

}


/*
CHECK PAYMENT STATUS
*/
export async function xpayCheckStatus(transaction_id){

if(!XPAY_API_URL){
throw new Error("XPAY_API_URL_NOT_CONFIGURED");
}

const resp = await fetch(
`${XPAY_API_URL}/payment/status/${transaction_id}`,
{
method:"GET",
headers:{
"Authorization":`Bearer ${XPAY_API_KEY}`
}
}
);

if(!resp.ok){

const text = await resp.text();

throw new Error(`XPAY_STATUS_FAILED: ${text}`);

}

const data = await resp.json();

/*
expected response

{
transaction_id
status
}
*/

return data;

}


/*
VERIFY WEBHOOK
*/
export function xpayVerifyWebhook(signature, payload, secret){

if(!signature || !secret){
return false;
}

const crypto = await import("crypto");

const hmac = crypto
.createHmac("sha256", secret)
.update(payload)
.digest("hex");

return hmac === signature;

}