// US-PAY-C11 contract regression only: PG17, real service + HTTP
// signature route, injected Stripe HTTP transport. ZERO LIVE Stripe calls.
// Reuses previously seeded synthetic owner/token: does not create a merchant.
import test,{before,after} from "node:test";
import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import express from "express";
import pg from "pg";
import { prepareUsC11LiveDirectCharge } from "../src/services/usPayC11LiveDirectCharge.service.js";
import { buildUsC11LivePaymentWebhook } from "../src/routes/usPayC11LivePaymentWebhook.js";
import { readUsPayC11Booking } from "../src/services/usPayC11ReadService.js";
import { TOTEM_US_CONNECT_PLATFORM } from "../src/services/usPayC11LiveStripeApi.js";

const url=process.env.US_PAY_C11_TEST_DATABASE_URL||"";
if(!/^postgres:\/\/[^@]+@127\.0\.0\.1:55432\/us_pay_c11_staging$/.test(url) ||
   process.env.US_PAY_C11_LIVE_CHARGE_TEST!=="isolated-stub-only") {
  throw Error("US_C11_DIRECT_CHARGE_TEST_MUST_USE_DISPOSABLE_DB");
}
const pool=new pg.Pool({connectionString:url,max:4});
const stripeAccount="acct_EXISTINGUSA123456789";
const secretKey="sk_live_SYNTHETIC_DIRECT_CHARGE_KEY_1234";
const publishable="pk_live_SYNTHETIC_DIRECT_CHARGE_KEY_1234";
const webhookSecret="whsec_SYNTHETIC_DIRECT_CHARGE_WEBHOOK_1234";
const clientToken="synthetic-us-55";
const intentId="pi_SYNTHETIC_DIRECT_510_PAYMENT";
let paymentCreates=0;
const apiCalls=[];
const stripeFetch=async (url,opts)=>{
  const u=new URL(url);
  apiCalls.push({path:u.pathname,headers:opts.headers,method:opts.method,
    form:opts.body?new URLSearchParams(opts.body):null});
  assert.equal(u.host,"api.stripe.com");
  assert.equal(opts.headers.Authorization,"Bearer "+secretKey);
  if(u.pathname==="/v1/account")return {ok:true,json:async()=>({
    object:"account",id:TOTEM_US_CONNECT_PLATFORM,country:"US",
    charges_enabled:true,capabilities:{card_payments:"active"},
  })};
  if(u.pathname==="/v1/accounts/"+stripeAccount)return {
    ok:true,json:async()=>({
      object:"account",id:stripeAccount,type:"standard",country:"US",
      livemode:true,charges_enabled:true,payouts_enabled:true,
      details_submitted:true,
      capabilities:{card_payments:"active",transfers:"active"},
      requirements:{currently_due:[],past_due:[],disabled_reason:null},
    }),
  };
  if(u.pathname==="/v1/payment_intents"&&opts.method==="POST"){
    paymentCreates++;
    assert.equal(opts.headers["Stripe-Account"],stripeAccount);
    assert.equal(opts.headers["Idempotency-Key"].startsWith("totem-us-c11-live-"),true);
    const form=new URLSearchParams(opts.body);
    assert.equal(form.get("amount"),"1205");
    assert.equal(form.get("currency"),"usd");
    assert.equal(form.get("confirm"),"false");
    assert.equal(form.get("capture_method"),"automatic");
    assert.equal(form.get("automatic_payment_methods[enabled]"),"true");
    assert.equal(form.get("metadata[totem_us_booking_id]"),"510");
    assert.equal(form.get("metadata[totem_market]"),"US");
    return {ok:true,json:async()=>({
      object:"payment_intent",id:intentId,status:"requires_payment_method",
      amount:1205,currency:"usd",livemode:true,capture_method:"automatic",
      client_secret:intentId+"_secret_TESTONLYDO_NOTUSE",
      metadata:{
        totem_market:"US",totem_us_booking_id:"510",
        totem_us_reservation:form.get("metadata[totem_us_reservation]"),
      },
    })};
  }
  if(u.pathname==="/v1/payment_intents/"+intentId&&opts.method==="GET"){
    assert.equal(opts.headers["Stripe-Account"],stripeAccount);
    const r=await pool.query(
      "SELECT reservation_token FROM public.us_stripe_live_payment_intents WHERE booking_id=510"
    );
    return {ok:true,json:async()=>({
      object:"payment_intent",id:intentId,status:"requires_payment_method",
      amount:1205,currency:"usd",livemode:true,capture_method:"automatic",
      client_secret:intentId+"_secret_TESTONLYDO_NOTUSE",
      metadata:{
        totem_market:"US",totem_us_booking_id:"510",
        totem_us_reservation:String(r.rows[0].reservation_token),
      },
    })};
  }
  throw Error("UNEXPECTED_STRIPE_REQUEST:"+u.pathname);
};
const app=express();
app.post("/stripe/connect/us-pay-c11/live/payment-events",
  express.raw({type:"application/json",limit:"128kb"}),
  buildUsC11LivePaymentWebhook({
    pool,enabled:true,webhookSecret,
  }));
let server,origin;
before(async()=>{
  server=await new Promise(resolve=>{
    const listener=app.listen(0,"127.0.0.1",()=>resolve(listener));
  });
  origin="http://127.0.0.1:"+server.address().port;
});
after(async()=>{
  if(server)await new Promise((resolve,reject)=>
    server.close(e=>e?reject(e):resolve()));
  await pool.end();
});
async function pay(bookingId=510,token=clientToken,clientId=55){
  return prepareUsC11LiveDirectCharge(pool,{
    clientId,clientToken:token,bookingId,
    secretKey,stripePublishableKey:publishable,fetchImpl:stripeFetch,
  });
}
let counter=0;
function makeEvent({
  type="payment_intent.succeeded",status="succeeded",
  amount=1205,currency="usd",account=stripeAccount,received=1205,
  created=Math.floor(Date.now()/1000),reservation,
}={}){
  counter++;
  return {
    id:"evt_C11_DIRECT_STUB_"+String(counter).padStart(8,"0"),
    object:"event",livemode:true,account,created,type,
    data:{object:{
      object:"payment_intent",id:intentId,
      status,amount,amount_received:received,currency,livemode:true,
      metadata:{totem_market:"US",totem_us_booking_id:"510",
        totem_us_reservation:reservation},
    }},
  };
}
async function postEvent(e,secret=webhookSecret){
  const raw=Buffer.from(JSON.stringify(e),"utf8");
  const t=Math.floor(Date.now()/1000);
  const signature=createHmac("sha256",secret)
    .update(String(t)).update(".").update(raw).digest("hex");
  const r=await fetch(
    origin+"/stripe/connect/us-pay-c11/live/payment-events",{
      method:"POST",
      headers:{"Content-Type":"application/json",
        "Stripe-Signature":`t=${t},v1=${signature}`},
      body:raw,
    }
  );
  return {status:r.status,body:await r.json()};
}
async function status(){
  const r=await pool.query(
    "SELECT status,stripe_payment_intent_id,reservation_token FROM public.us_stripe_live_payment_intents WHERE booking_id=510"
  );
  return r.rows[0]||null;
}
async function clientView(){
  const db=await pool.connect();
  try {
    await db.query("BEGIN READ ONLY");
    return await readUsPayC11Booking(db,{
      clientId:55,bookingId:510,allowTestStripeMode:false,
    });
  } finally {
    try{await db.query("ROLLBACK");}
    finally{db.release();}
  }
}

test("no LIVE charge for invalid client token or other client booking",async()=>{
  const before=apiCalls.length;
  assert.equal((await pay(510,"synthetic-invalid-token-55")).status,403);
  assert.equal((await pay(510,clientToken,56)).status,403);
  assert.equal((await pay(502,clientToken,55)).status,404);
  assert.equal(apiCalls.length,before);
  assert.equal(paymentCreates,0);
});

test("one immutable US-only connected-account reservation, direct charge, repeat safe",async()=>{
  const first=await pay();
  assert.equal(first.status,200);
  assert.equal(first.body.amount_minor,"1205");
  assert.equal(first.body.currency_code,"USD");
  assert.equal(first.body.stripe_account_id,stripeAccount);
  assert.equal(first.body.stripe_publishable_key,publishable);
  assert.equal(first.body.payment_ready,false);
  assert.equal(paymentCreates,1);
  const again=await pay();
  assert.equal(again.status,200);
  assert.equal(again.body.payment_intent_client_secret,
    first.body.payment_intent_client_secret);
  assert.equal(paymentCreates,1);
  const db=await status();
  assert.equal(db.stripe_payment_intent_id,intentId);
  assert.equal(db.status,"requires_payment_method");
  await assert.rejects(
    pool.query("UPDATE public.us_booking_payment_collectors SET revision=revision+1 WHERE booking_id=510"),
    e=>e.code==="23514"
  );
  assert.equal((await clientView()).body.payment.service_payment_status,
    "requires_review"); // no signed payment proof yet
});

test("only Stripe-signed exact US seller amount and booking can mark paid",async()=>{
  const token=String((await status()).reservation_token);
  const bad=makeEvent({reservation:token});
  assert.equal((await postEvent(bad,"whsec_WRONG_SECRET_WILL_FAIL")).status,400);
  const foreign=makeEvent({reservation:token,account:"acct_FOREIGNMERCHANT99"});
  assert.equal((await postEvent(foreign)).status,200);
  assert.equal((await status()).status,"requires_payment_method");
  const wrongAmount=makeEvent({reservation:token,amount:500,received:500});
  assert.equal((await postEvent(wrongAmount)).status,200);
  assert.equal((await status()).status,"requires_payment_method");
  const valid=makeEvent({reservation:token});
  const accepted=await postEvent(valid);
  assert.equal(accepted.status,200);
  assert.equal(accepted.body.result,"accepted");
  assert.equal((await status()).status,"succeeded");
  const repeat=await postEvent(valid);
  assert.equal(repeat.body.result,"duplicate");
  const view=await clientView();
  assert.equal(view.status,200);
  assert.equal(view.body.payment.service_payment_status,"paid");
  assert.equal(view.body.payment.provider,"stripe");
  assert.equal(view.body.payment_ready,false);
  assert.equal((await pay()).status,409);
  assert.equal(paymentCreates,1);
});

test("later seller KYC restriction cannot erase a signed paid history",async()=>{
  await pool.query(
    `UPDATE public.us_stripe_live_seller_bindings
        SET verification_status='restricted',verified_at=NULL,
            charges_enabled=false,payouts_enabled=false,
            card_payments_status='inactive',transfers_status='inactive'
      WHERE owner_type='salon' AND owner_id=100`
  );
  const view=await clientView();
  assert.equal(view.status,200);
  assert.equal(view.body.payment.service_payment_status,"paid");
  assert.equal(view.body.collector,null);
  const kg=await pool.query(
    "SELECT count(*)::int AS n FROM public.us_stripe_live_payment_intents WHERE market_id IN (1,2)"
  );
  assert.equal(kg.rows[0].n,0);
});
