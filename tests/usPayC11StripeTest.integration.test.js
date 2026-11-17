// US-PAY-C11 STRIPE TEST: one disposable PG17 webhook acceptance.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import pg from "pg";
import { buildUsStripeTestWebhookHandler } from "../src/routes/usStripeTestWebhook.js";
import { buildPublicUsPayC11Router } from "../src/routes/publicUsPayC11.js";
import { verifyClientCabinetAccess } from "../src/services/clientCabinetTokenAccess.js";
import {
  checkStripeTestSellerSnapshot, verifyStripeTestConnectedAccount,
} from "../src/services/usStripeTestVerification.js";
import { verifyStripeRawSignature } from "../src/services/usStripeTestWebhook.service.js";

const uri = process.env.US_PAY_C11_TEST_DATABASE_URL || "";
if (!/^postgres:\/\/[^@]+@127\.0\.0\.1:55432\/us_pay_c11_staging$/.test(uri) ||
    process.env.US_PAY_C11_STRIPE_TEST_MODE !== "true") {
  throw Error("US_C11_STRIPE_TEST_LOCAL_STAGING_ONLY");
}
const pool = new pg.Pool({ connectionString: uri, max: 4 });
const secret = "whsec_c11synthetictestpayload_no_real_delivery";
const accounts = {
  salon: "acct_1UcJSo8O8H3cMbfR",
  master: "acct_1UcJSo8O8HUdcFwl",
};

let count=0;
function eventFor({
  booking = 500, account = accounts.salon, amount = 1050,
  created = Math.floor(Date.now()/1000), type="payment_intent.succeeded",
  status="succeeded", currency="usd", livemode=false,
  intentId=booking===500?"pi_c11_test_salon_500":"pi_c11_test_master_504",
  amountReceived = amount,
} = {}) {
  count++;
  return {
    id: "evt_c11_synthetic_" + String(count).padStart(8,"0"),
    object: "event", livemode, account, created, type,
    data: { object: {
      id: intentId, object: "payment_intent", amount,
      amount_received: amountReceived, currency, status,
    } },
  };
}

function signed(event, providedSecret=secret, timestamp=Math.floor(Date.now()/1000)) {
  const raw = Buffer.from(JSON.stringify(event),"utf8");
  const hash=crypto.createHmac("sha256",providedSecret)
    .update(String(timestamp)).update(".").update(raw).digest("hex");
  return { raw, header: `t=${timestamp},v1=${hash}` };
}

const app=express();
app.post("/stripe/test/us-pay-c11/webhook",
  express.raw({type:"application/json",limit:"128kb"}),
  buildUsStripeTestWebhookHandler({pool,webhookSecret:secret,enabled:true}));
app.use("/public",buildPublicUsPayC11Router({pool,verifyClientCabinetAccess}));
let server,origin;

before(async()=>{
  server=await new Promise(done=>{
    const listener=app.listen(0,"127.0.0.1",()=>done(listener));
  });
  origin=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{
  if(server) await new Promise((resolve,reject)=>
    server.close(error=>error?reject(error):resolve()));
  await pool.end();
});

async function post(event, signature) {
  const {raw,header}=signed(event);
  const response=await fetch(origin+"/stripe/test/us-pay-c11/webhook",{
    method:"POST",headers:{"Content-Type":"application/json",
      "Stripe-Signature":signature ?? header},
    body:raw,
  });
  return {status:response.status,body:await response.json()};
}
async function client(booking=500) {
  const response=await fetch(origin+`/public/clients/55/synthetic-us-55/us-pay-c11/${booking}`);
  return {status:response.status,body:await response.json()};
}
async function attemptStatus(booking=500) {
  const r=await pool.query(
    "SELECT payment_status, status_event_created, last_event_id FROM public.us_stripe_payment_attempts WHERE booking_id=$1",
    [booking]);
  return r.rows[0];
}

test("GET-only connected account verifier refuses live keys/accounts and missing capabilities",async()=>{
  const verified={
    id:accounts.salon,object:"account",livemode:false,country:"US",
    charges_enabled:true,payouts_enabled:true,details_submitted:true,
    capabilities:{card_payments:"active",transfers:"active"},
    requirements:{currently_due:[],past_due:[],disabled_reason:null},
  };
  assert.equal(checkStripeTestSellerSnapshot(verified,accounts.salon).verified,true);
  for(const mutated of [
    {...verified,livemode:true},
    {...verified,id:accounts.master},
    {...verified,charges_enabled:false},
    {...verified,capabilities:{...verified.capabilities,card_payments:"inactive"}},
    {...verified,requirements:{currently_due:["business_profile.url"]}},
  ]) assert.equal(checkStripeTestSellerSnapshot(mutated,accounts.salon).verified,false);
  await assert.rejects(verifyStripeTestConnectedAccount({
    connectedAccountId:accounts.salon,secretKey:"sk_live_forbidden",fetchImpl:async()=>{throw Error("SHOULD_NOT_FETCH");}
  }),/LIVE_KEY_FORBIDDEN/);
  let url;
  const result=await verifyStripeTestConnectedAccount({
    connectedAccountId:accounts.salon,secretKey:"sk_test_synthetic_not_real",
    fetchImpl:async (u,opts)=>{
      url=u;
      assert.equal(opts.method,"GET");
      assert.match(opts.headers.Authorization,/^Bearer sk_test_/);
      return {ok:true,json:async()=>verified};
    },
  });
  assert.match(url,/^https:\/\/api\.stripe\.com\/v1\/accounts\/acct_/);
  assert.equal(result.verified,true);
});

test("raw signature: exactly signed bytes, old/future timestamp and wrong secret fail",()=>{
  const {raw,header}=signed(eventFor());
  assert.equal(verifyStripeRawSignature(raw,header,secret),true);
  assert.equal(verifyStripeRawSignature(Buffer.from("{}"),header,secret),false);
  assert.equal(verifyStripeRawSignature(raw,header,secret+"x"),false);
  assert.equal(verifyStripeRawSignature(raw,header,secret,Math.floor(Date.now()/1000)+301),false);
  assert.equal(verifyStripeRawSignature(raw,"t=0,v1="+("a".repeat(64)),secret),false);
});

test("unsigned/bad-signature/live-mode webhook rejected; no settlement update",async()=>{
  const original=await attemptStatus();
  assert.equal(original.payment_status,"requires_review");
  assert.equal((await post(eventFor(), "t=0,v1="+("0".repeat(64)))).status,400);
  assert.equal((await post(eventFor({livemode:true}))).status,400);
  assert.equal((await post(eventFor({currency:"kgs"}))).status,400);
  assert.equal((await attemptStatus()).payment_status,"requires_review");
});

test("signed wrong account and wrong amount audited but never paid",async()=>{
  const mismatch=await post(eventFor({account:accounts.master}));
  assert.equal(mismatch.status,200);
  assert.equal(mismatch.body.result,"rejected_binding");
  const amount=await post(eventFor({amount:1051,amountReceived:1051}));
  assert.equal(amount.status,200);
  assert.equal(amount.body.result,"rejected_data");
  assert.equal((await attemptStatus()).payment_status,"requires_review");
  assert.equal((await client()).body.payment.provider,null);
});

test("orphan PI cannot bind a booking or modify payments",async()=>{
  const orphan=await post(eventFor({intentId:"pi_unknown_test_123456"}));
  assert.equal(orphan.status,200);
  assert.equal(orphan.body.result,"ignored_unlinked");
  assert.equal((await attemptStatus()).payment_status,"requires_review");
});

test("signed processing status projects awaiting_payment but never checkout",async()=>{
  const e=eventFor({type:"payment_intent.processing",status:"processing"});
  const result=await post(e);
  assert.equal(result.status,200);
  assert.equal(result.body.result,"accepted");
  assert.equal((await attemptStatus()).payment_status,"awaiting_payment");
  const response=await client();
  assert.equal(response.status,200);
  assert.equal(response.body.price.amount_minor,"1050");
  assert.equal(response.body.collector.owner_type,"salon");
  assert.equal(response.body.payment.provider,"stripe");
  assert.equal(response.body.payment.service_payment_status,"awaiting_payment");
  assert.equal(response.body.payment_ready,false);
});

test("correct signed Stripe TEST success: idempotent paid projection, no legacy writes",async()=>{
  const success=eventFor({created:Math.floor(Date.now()/1000)+1});
  const first=await post(success);
  assert.equal(first.status,200);
  assert.equal(first.body.result,"accepted");
  assert.equal((await attemptStatus()).payment_status,"paid");

  const second=await post(success);
  assert.equal(second.status,200);
  assert.equal(second.body.result,"duplicate");
  const late=await post(eventFor({
    created:success.created-1,type:"payment_intent.processing",status:"processing",
  }));
  assert.equal(late.status,200);
  assert.equal(late.body.result,"ignored_event");
  assert.equal((await attemptStatus()).payment_status,"paid");

  const response=await client();
  assert.equal(response.body.payment.provider,"stripe");
  assert.equal(response.body.payment.service_payment_status,"paid");
  assert.equal(response.body.payment_ready,false);
  assert.equal(response.body.price.amount_minor,"1050");
  assert.equal(response.body.collector.owner_type,"salon");
  assert.doesNotMatch(JSON.stringify(response.body),
    /acct_1UcJ|pi_c11_test|stripe_event_id|last_event_id/);
});

test("master Stripe TEST payment must match master account and exact $0.01",async()=>{
  const bad=await post(eventFor({booking:504,account:accounts.salon,amount:1}));
  assert.equal(bad.body.result,"rejected_binding");
  const good=await post(eventFor({booking:504,account:accounts.master,amount:1}));
  assert.equal(good.body.result,"accepted");
  const response=await client(504);
  assert.equal(response.body.price.amount_minor,"1");
  assert.equal(response.body.collector.owner_type,"master");
  assert.equal(response.body.payment.service_payment_status,"paid");
  assert.equal(response.body.payment_ready,false);
});

test("webhook event audit and amount association immutable",async()=>{
  await assert.rejects(
    pool.query("DELETE FROM public.us_stripe_event_ledger WHERE stripe_connected_account_id=$1",[accounts.salon]),
    err=>err.code==="23514");
  await assert.rejects(
    pool.query("UPDATE public.us_stripe_payment_attempts SET amount_minor=999 WHERE booking_id=500"),
    err=>err.code==="23514");
  const byType=await pool.query(
    "SELECT processing_result,count(*)::int AS n FROM public.us_stripe_event_ledger GROUP BY processing_result");
  const outcomes=new Set(byType.rows.map(r=>r.processing_result));
  for(const result of ["accepted","rejected_binding","rejected_data","ignored_unlinked"])
    assert.ok(outcomes.has(result),result);
});
