/**
 * US-PAY-C11 single isolated PG17 finance acceptance.
 * Reuses the previous direct-charge fixture. Stripe transport is injected:
 * ZERO external Stripe network calls or real owners/refunds/payouts.
 */
import test,{after,before} from "node:test";
import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import express from "express";
import pg from "pg";
import {buildUsC11LivePaymentWebhook} from
  "../src/routes/usPayC11LivePaymentWebhook.js";
import {readUsPayC11Booking} from
  "../src/services/usPayC11ReadService.js";
import {TOTEM_US_CONNECT_PLATFORM} from
  "../src/services/usPayC11LiveStripeApi.js";

const url=process.env.US_PAY_C11_TEST_DATABASE_URL||"";
if(!/^postgres:\/\/[^@]+@127\.0\.0\.1:55432\/us_pay_c11_staging$/.test(url)||
   process.env.US_PAY_C11_FINANCE_TEST!=="isolated-stub-only"){
  throw Error("US_C11_FINANCE_DISPOSABLE_PG17_ONLY");
}
const pool=new pg.Pool({connectionString:url,max:5});
const seller="acct_EXISTINGUSA123456789";
const pi="pi_SYNTHETIC_DIRECT_510_PAYMENT";
const signingSecret="whsec_SYNTHETIC_FINANCIAL_EVENTS_1234";
const stripeKey="sk_live_SYNTHETIC_FINANCIAL_READS_1234";
const refunds={
  "re_SYNTHETIC_FINANCIAL_205":{
    id:"re_SYNTHETIC_FINANCIAL_205",object:"refund",livemode:true,
    payment_intent:pi,amount:205,currency:"usd",
    status:"succeeded",balance_transaction:"txn_FIN_REFUND_205",
  },
  "re_SYNTHETIC_FINANCIAL_1000":{
    id:"re_SYNTHETIC_FINANCIAL_1000",object:"refund",livemode:true,
    payment_intent:pi,amount:1000,currency:"usd",
    status:"succeeded",balance_transaction:"txn_FIN_REFUND_1000",
  },
};
const disputes={
  "du_SYNTHETIC_FINANCIAL_1":{
    id:"du_SYNTHETIC_FINANCIAL_1",object:"dispute",livemode:true,
    payment_intent:pi,amount:1205,currency:"usd",
    status:"needs_response",
  },
};
const payout={
  id:"po_SYNTHETIC_US_1",object:"payout",livemode:true,
  amount:1000,currency:"usd",status:"paid",automatic:true,
  arrival_date:1940000000,balance_transaction:"txn_SYNTHETIC_PAYOUT_1",
};
let fetchCount=0;
const fakeStripe=async(url,opts)=>{
  fetchCount++;
  const u=new URL(url);
  assert.equal(u.hostname,"api.stripe.com");
  assert.equal(opts.method,"GET");
  assert.equal(opts.headers.Authorization,"Bearer "+stripeKey);
  if(u.pathname==="/v1/account"){
    return {ok:true,json:async()=>({
      object:"account",id:TOTEM_US_CONNECT_PLATFORM,country:"US",
      charges_enabled:true,capabilities:{card_payments:"active"},
    })};
  }
  assert.equal(opts.headers["Stripe-Account"],seller);
  if(u.pathname==="/v1/refunds/re_SYNTHETIC_FINANCIAL_205")
    return {ok:true,json:async()=>refunds.re_SYNTHETIC_FINANCIAL_205};
  if(u.pathname==="/v1/refunds/re_SYNTHETIC_FINANCIAL_1000")
    return {ok:true,json:async()=>refunds.re_SYNTHETIC_FINANCIAL_1000};
  if(u.pathname==="/v1/disputes/du_SYNTHETIC_FINANCIAL_1")
    return {ok:true,json:async()=>disputes.du_SYNTHETIC_FINANCIAL_1};
  if(u.pathname==="/v1/payouts/po_SYNTHETIC_US_1")
    return {ok:true,json:async()=>payout};
  if(u.pathname==="/v1/balance_transactions"){
    assert.equal(u.searchParams.get("payout"),payout.id);
    const make=(id,amount)=>({
      id,object:"balance_transaction",amount,net:amount,fee:0,
      currency:"usd",reporting_category:"charge",source:"ch_SYNTHETIC",
    });
    return {ok:true,json:async()=>({
      object:"list",has_more:false,
      data:[make("txn_SYNTH_BALANCE_700",700),make("txn_SYNTH_BALANCE_300",300)],
    })};
  }
  throw Error("UNEXPECTED_STRIPE_GET:"+u.pathname);
};
const app=express();
app.post("/stripe/connect/us-pay-c11/live/payment-events",
  express.raw({type:"application/json",limit:"128kb"}),
  buildUsC11LivePaymentWebhook({
    pool,enabled:true,financeEnabled:true,
    webhookSecret:signingSecret,secretKey:stripeKey,fetchImpl:fakeStripe,
  }));
let server,origin;
before(async()=>{
  const seeded=await pool.query(
    "SELECT stripe_payment_intent_id,status FROM public.us_stripe_live_payment_intents WHERE booking_id=510"
  );
  assert.equal(seeded.rows[0]?.stripe_payment_intent_id,pi);
  assert.equal(seeded.rows[0]?.status,"succeeded");
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
let counter=0;
function event(kind,id,type,account=seller){
  counter++;
  return {
    id:"evt_FINANCE_C11_"+String(counter).padStart(8,"0"),
    object:"event",livemode:true,account,created:Math.floor(Date.now()/1000),
    type,data:{object:{object:kind,id}},
  };
}
async function post(e,secret=signingSecret){
  const raw=Buffer.from(JSON.stringify(e));
  const stamp=Math.floor(Date.now()/1000);
  const sig=createHmac("sha256",secret)
    .update(String(stamp)).update(".").update(raw).digest("hex");
  const res=await fetch(
    origin+"/stripe/connect/us-pay-c11/live/payment-events",{
    method:"POST",headers:{"Content-Type":"application/json",
      "Stripe-Signature":`t=${stamp},v1=${sig}`},body:raw,
  });
  return {status:res.status,body:await res.json()};
}
async function clientView(){
  const db=await pool.connect();
  try{
    await db.query("BEGIN READ ONLY");
    return await readUsPayC11Booking(db,{
      clientId:55,bookingId:510,allowTestStripeMode:false,
    });
  }finally{
    try{await db.query("ROLLBACK");}finally{db.release();}
  }
}

test("signed webhook records exact partial then full Stripe refund; no new debit",async()=>{
  const ev205=event("refund","re_SYNTHETIC_FINANCIAL_205","refund.created");
  const forbidden=await post(ev205,"whsec_WRONG_REJECT_THIS_EVENT_1234");
  assert.equal(forbidden.status,400);
  assert.equal(fetchCount,0);
  const partial=await post(ev205);
  assert.equal(partial.status,200);
  assert.equal(partial.body.result,"observed");
  assert.equal((await clientView()).body.payment.service_payment_status,
    "partially_refunded");
  assert.equal((await post(ev205)).body.result,"duplicate");
  const full=await post(
    event("refund","re_SYNTHETIC_FINANCIAL_1000","refund.updated"));
  assert.equal(full.status,200);
  assert.equal((await clientView()).body.payment.service_payment_status,
    "refunded");
  const sum=await pool.query(
    "SELECT sum(amount_minor)::text AS cents FROM public.us_c11_live_refunds WHERE status='succeeded' AND booking_id=510"
  );
  assert.equal(sum.rows[0].cents,"1205");
});

test("signed dispute changes client risk state; closed WON restores refund projection",async()=>{
  const opened=await post(
    event("dispute","du_SYNTHETIC_FINANCIAL_1","charge.dispute.created"));
  assert.equal(opened.status,200);
  assert.equal((await clientView()).body.payment.service_payment_status,
    "disputed");
  disputes.du_SYNTHETIC_FINANCIAL_1.status="won";
  const closed=await post(
    event("dispute","du_SYNTHETIC_FINANCIAL_1","charge.dispute.closed"));
  assert.equal(closed.status,200);
  assert.equal((await clientView()).body.payment.service_payment_status,
    "refunded");
  const recorded=await pool.query(
    "SELECT status FROM public.us_c11_live_disputes WHERE stripe_dispute_id=$1",
    ["du_SYNTHETIC_FINANCIAL_1"]
  );
  assert.equal(recorded.rows[0].status,"won");
});

test("automatic payout aggregates verified net balance only; NEVER booking payout",async()=>{
  const e=event("payout","po_SYNTHETIC_US_1","payout.reconciliation_completed");
  const r=await post(e);
  assert.equal(r.status,200);
  assert.equal(r.body.result,"automatic_verified");
  const payoutRow=await pool.query(
    "SELECT reconciliation_status,balance_items_count,balance_items_net_minor FROM public.us_c11_live_payouts WHERE stripe_payout_id=$1",
    ["po_SYNTHETIC_US_1"]
  );
  assert.deepEqual(
    [payoutRow.rows[0].reconciliation_status,
     payoutRow.rows[0].balance_items_count,
     String(payoutRow.rows[0].balance_items_net_minor)],
    ["automatic_verified",2,"1000"]
  );
  assert.equal((await post(e)).body.result,"duplicate");
  const items=await pool.query(
    "SELECT count(*)::int n FROM public.us_c11_live_payout_balance_items WHERE stripe_payout_id=$1",
    ["po_SYNTHETIC_US_1"]
  );
  assert.equal(items.rows[0].n,2);
  await assert.rejects(
    pool.query(
      "UPDATE public.us_c11_live_payouts SET amount_minor=amount_minor+1 WHERE stripe_payout_id=$1",
      [payout.id]
    ),e=>e.code==="23514"
  );
  await assert.rejects(
    pool.query(
      "DELETE FROM public.us_c11_live_payout_balance_items WHERE stripe_payout_id=$1",
      [payout.id]
    ),e=>e.code==="23514"
  );
  const piStatus=await pool.query(
    "SELECT status FROM public.us_stripe_live_payment_intents WHERE booking_id=510"
  );
  assert.equal(piStatus.rows[0].status,"succeeded");
});

test("foreign signed seller cannot write refund/dispute/payout audit",async()=>{
  const before=fetchCount;
  const foreign=await post(event(
    "payout","po_FOREIGN_ABCD1234","payout.paid",
    "acct_FOREIGNSYNTHETIC123456"));
  assert.equal(foreign.status,200);
  assert.equal(foreign.body.result,"unlinked");
  assert.equal(fetchCount,before);
  assert.equal((await pool.query(
    "SELECT count(*)::int n FROM public.us_c11_live_payouts"
  )).rows[0].n,1);
});
