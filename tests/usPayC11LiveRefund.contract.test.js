/**
 * US-PAY-C11: one full + partial refund contract against an existing
 * synthetic LIVE direct-charge fixture, isolated PG17 and injected Stripe.
 * NO external Stripe API calls, no real seller, no money movement.
 *
 * Test precedes the signed financial observation test in the same CI DB:
 * booking 510 partial request is observed later; synthetic booking 512
 * exercises the complete signed FULL refund in this acceptance step.
 */
import test,{before,after} from "node:test";
import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import express from "express";
import pg from "pg";
import {buildUsPayC11LiveRefundRouter} from
  "../src/routes/internalUsPayC11LiveRefund.js";
import {buildUsC11LivePaymentWebhook} from
  "../src/routes/usPayC11LivePaymentWebhook.js";
import {readUsPayC11Booking} from
  "../src/services/usPayC11ReadService.js";
import {TOTEM_US_CONNECT_PLATFORM} from
  "../src/services/usPayC11LiveStripeApi.js";

const uri=process.env.US_PAY_C11_TEST_DATABASE_URL||"";
if(!/^postgres:\/\/[^@]+@127\.0\.0\.1:55432\/us_pay_c11_staging$/.test(uri)||
   process.env.US_PAY_C11_REFUND_TEST!=="synthetic-stub-only"){
  throw Error("US_C11_REFUND_TEST_DISPOSABLE_DB_ONLY");
}
const pool=new pg.Pool({connectionString:uri,max:6});
const seller="acct_EXISTINGUSA123456789";
const pi510="pi_SYNTHETIC_DIRECT_510_PAYMENT";
const pi512="pi_SYNTHETIC_REFUND_512";
const secretKey="sk_live_SYNTHETIC_REFUND_API_1234";
const signing="whsec_SYNTHETIC_REFUND_EVENTS_1234";
const owner={
  source:"session",role:"salon_admin",user_id:900,
  session_id:"00000000-0000-4000-8000-000000000900",
};
const other={...owner,user_id:902,
  session_id:"00000000-0000-4000-8000-000000000902"};
const idPartial="00000000-0000-4000-8000-000000000205";
const idFull="00000000-0000-4000-8000-000000000512";
const refundResponses={};
let liveRefundPosts=0;
let stripeGets=0;
const stripeFetch=async(address,opts)=>{
  const u=new URL(address);
  assert.equal(u.origin,"https://api.stripe.com");
  assert.equal(opts.headers.Authorization,"Bearer "+secretKey);
  if(u.pathname==="/v1/account"){
    stripeGets++;
    return {ok:true,json:async()=>({
      object:"account",id:TOTEM_US_CONNECT_PLATFORM,country:"US",
      charges_enabled:true,capabilities:{card_payments:"active"},
    })};
  }
  assert.equal(opts.headers["Stripe-Account"],seller);
  if(opts.method==="POST"&&u.pathname==="/v1/refunds"){
    liveRefundPosts++;
    const form=new URLSearchParams(opts.body);
    const requestId=form.get("metadata[totem_us_c11_refund_request]");
    assert.equal(opts.headers["Idempotency-Key"],
      "totem-us-c11-refund-"+requestId);
    const pi=form.get("payment_intent");
    const cents=form.get("amount");
    const id=pi===pi510?
      "re_SYNTHETIC_FINANCIAL_205":"re_SYNTHETIC_FULL_REFUND_512";
    assert.ok((pi===pi510&&cents==="205"&&requestId===idPartial)||
      (pi===pi512&&cents==="1205"&&requestId===idFull));
    const response={
      id,object:"refund",payment_intent:pi,
      amount:Number(cents),currency:"usd",status:"succeeded",
      metadata:{totem_us_c11_refund_request:requestId},
    };
    refundResponses[id]=response;
    return {ok:true,json:async()=>response};
  }
  if(opts.method==="GET"&&u.pathname.startsWith("/v1/refunds/")){
    const x=refundResponses[u.pathname.slice("/v1/refunds/".length)];
    if(!x)throw Error("UNEXPECTED_STRIPE_REFUND_READ");
    return {ok:true,json:async()=>x};
  }
  throw Error("UNEXPECTED_STRIPE_REFUND_TRANSPORT:"+u.pathname);
};
const app=express();
app.post("/stripe/connect/us-pay-c11/live/payment-events",
  express.raw({type:"application/json",limit:"128kb"}),
  buildUsC11LivePaymentWebhook({
    pool,enabled:true,financeEnabled:true,
    webhookSecret:signing,secretKey,fetchImpl:stripeFetch,
  }));
app.use("/internal",express.json(),(req,_res,next)=>{
  req.auth=req.get("X-C11-Refund-Actor")==="other"?other:
    req.get("X-C11-Refund-Actor")==="none"?null:owner;
  next();
},buildUsPayC11LiveRefundRouter(pool,{
  enabled:true,secretKey,fetchImpl:stripeFetch,
}));
let server,origin;
before(async()=>{
  // The prior signed direct-charge contract intentionally restricted seller
  // KYC. Re-enable only this disposable fixture; never real Stripe.
  await pool.query(
    `UPDATE public.us_stripe_live_seller_bindings
        SET verification_status='verified',verified_at=now(),
            last_checked_at=now(),charges_enabled=true,
            payouts_enabled=true,details_submitted=true,
            card_payments_status='active',transfers_status='active'
      WHERE owner_type='salon' AND owner_id=100
        AND stripe_account_id=$1`,[seller]
  );
  // One extra US BOOKING fixture (not a new merchant/salon/master)
  // to independently verify a successful FULL refund scenario.
  await pool.query(
    `INSERT INTO public.bookings
       (id,salon_id,master_id,service_id,client_id,currency_code,status)
      VALUES(512,100,200,400,55,'USD','reserved')`
  );
  await pool.query(
    `INSERT INTO public.us_booking_price_snapshots
       (booking_id,market_id,salon_master_service_id,amount_minor,service_price_version)
      VALUES(512,3,300,1205,2)`
  );
  await pool.query(
    `INSERT INTO public.us_booking_payment_collectors
       (booking_id,market_id,collector_owner_type,collector_owner_id,
        selection_source,selected_by_user_id,verification_status,verified_at)
      VALUES (512,3,'salon',100,'owner_authorized',900,'verified',now())`
  );
  const binding=await pool.query(
    "SELECT id FROM public.us_stripe_live_seller_bindings WHERE owner_type='salon' AND owner_id=100"
  );
  const bindingId=binding.rows[0].id;
  await pool.query(
    `INSERT INTO public.us_stripe_live_payment_intents
       (booking_id,market_id,seller_binding_id,collector_owner_type,
        collector_owner_id,collector_revision,stripe_account_id,
        amount_minor,reservation_token)
       VALUES(512,3,$1,'salon',100,1,$2,1205,$3)`,
    [bindingId,seller,"00000000-0000-4000-8000-000000000513"]
  );
  const eventId="evt_SYNTHETIC_REFUND_BOOKING_512";
  const when=Math.floor(Date.now()/1000);
  await pool.query(
    `INSERT INTO public.us_stripe_live_payment_receipts
       (stripe_event_id,booking_id,stripe_account_id,stripe_payment_intent_id,
        event_type,event_created,stripe_mode,signature_verified,body_sha256,result)
     VALUES($1,512,$2,$3,'payment_intent.succeeded',$4,'LIVE',true,$5,'accepted')`,
    [eventId,seller,pi512,when,"b".repeat(64)]
  );
  await pool.query(
    `UPDATE public.us_stripe_live_payment_intents
        SET stripe_payment_intent_id=$1,status='succeeded',
            last_event_id=$2,stripe_event_created=$3
      WHERE booking_id=512`,[pi512,eventId,when]
  );
  server=await new Promise(resolve=>{
    const listener=app.listen(0,"127.0.0.1",()=>resolve(listener));
  });
  origin="http://127.0.0.1:"+server.address().port;
});
after(async()=>{
  if(server)await new Promise((resolve,reject)=>
    server.close(error=>error?reject(error):resolve()));
  await pool.end();
});
async function send(bookingId,requestId,cents,remaining,opts={}){
  const res=await fetch(
    origin+`/internal/us-pay-c11/live-connect/salon/100/bookings/${bookingId}/refund`,{
    method:"POST",
    headers:{"Content-Type":"application/json",
      "X-C11-Refund-Actor":opts.actor||"owner"},
    body:JSON.stringify({
      amount_minor:cents,expected_remaining_minor:remaining,
      reason:opts.reason||"requested_by_customer",
      request_id:requestId,consent:opts.consent??true,
    }),
  });
  return {status:res.status,body:await res.json()};
}
async function quote(bookingId,actor="owner"){
  const r=await fetch(
    origin+`/internal/us-pay-c11/live-connect/salon/100/bookings/${bookingId}/refund/quote`,{
      method:"GET",headers:{"X-C11-Refund-Actor":actor},
    });
  return {status:r.status,body:await r.json()};
}
async function signedEvent(id,type){
  const e={
    id:"evt_REFUND_SYNTHETIC_"+type.replace(/[^a-zA-Z0-9]/g,"_").slice(-10)+"_"+id.slice(-8),
    object:"event",livemode:true,account:seller,
    created:Math.floor(Date.now()/1000),
    type,data:{object:{object:"refund",id}},
  };
  const raw=Buffer.from(JSON.stringify(e));
  const t=Math.floor(Date.now()/1000);
  const signature=createHmac("sha256",signing)
    .update(String(t)).update(".").update(raw).digest("hex");
  const res=await fetch(
    origin+"/stripe/connect/us-pay-c11/live/payment-events",{
    method:"POST",headers:{"Content-Type":"application/json",
      "Stripe-Signature":`t=${t},v1=${signature}`},
    body:raw,
  });
  return {status:res.status,body:await res.json()};
}

test("owner consent, active identity and exact remaining amount are required",async()=>{
  const before=liveRefundPosts;
  const displayed=await quote(510);
  assert.equal(displayed.status,200);
  assert.equal(displayed.body.refundable,true);
  assert.equal(displayed.body.remaining_minor,"1205");
  assert.equal((await quote(510,"other")).status,404);
  assert.equal((await send(510,idPartial,205,1205,{actor:"other"})).status,404);
  assert.equal((await send(510,idPartial,205,1205,{actor:"none"})).status,401);
  assert.equal((await send(510,idPartial,205,1205,{consent:false})).status,400);
  assert.equal((await send(510,idPartial,205,1206)).status,409);
  assert.equal((await send(510,idPartial,1206,1205)).status,409);
  assert.equal(liveRefundPosts,before);
});
test("partial US refund uses one permanent authorized amount and idempotency",async()=>{
  const r=await send(510,idPartial,205,1205);
  assert.equal(r.status,200);
  assert.equal(r.body.state,"submitted");
  assert.equal(r.body.refund_confirmed,false); // REST success is NOT refund proof
  assert.equal(liveRefundPosts,1);
  assert.equal((await send(510,idPartial,205,1205)).body.result,"existing_request");
  assert.equal(liveRefundPosts,1);
  assert.equal((await send(510,idPartial,206,1205)).status,409);
  assert.equal((await send(510,"00000000-0000-4000-8000-000000000206",
    200,1000)).status,409); // previous signed refund NOT yet reconciled
  const trace=await pool.query(
    `SELECT request_id,actor_user_id,consent_amount_minor
       FROM public.us_c11_live_refund_consents WHERE request_id=$1`,
    [idPartial]
  );
  assert.equal(trace.rows.length,1);
  assert.equal(trace.rows[0].actor_user_id,900);
  assert.equal(String(trace.rows[0].consent_amount_minor),"205");
});
test("independent full USD refund requires one owner consent and signed event",async()=>{
  const r=await send(512,idFull,1205,1205);
  assert.equal(r.status,200);
  assert.equal(r.body.state,"submitted");
  assert.equal(liveRefundPosts,2);
  const signed=await signedEvent(
    "re_SYNTHETIC_FULL_REFUND_512","refund.created");
  assert.equal(signed.status,200);
  assert.equal(signed.body.result,"observed");
  const state=await pool.query(
    "SELECT state FROM public.us_c11_live_refund_requests WHERE request_id=$1",
    [idFull]
  );
  assert.equal(state.rows[0].state,"succeeded");
  const db=await pool.connect();
  try{
    await db.query("BEGIN READ ONLY");
    const view=await readUsPayC11Booking(db,{
      clientId:55,bookingId:512,allowTestStripeMode:false,
    });
    assert.equal(view.status,200);
    assert.equal(view.body.payment.service_payment_status,"refunded");
  } finally {
    try{await db.query("ROLLBACK");}finally{db.release();}
  }
  assert.equal((await send(512,
    "00000000-0000-4000-8000-000000000514",1,1205)).status,409);
  assert.equal(liveRefundPosts,2);

  // Stripe can report a late bank rejection even after initial SUCCESS.
  // The owner audit must not keep a false completed refund balance.
  refundResponses.re_SYNTHETIC_FULL_REFUND_512.status="failed";
  const reversal=await signedEvent(
    "re_SYNTHETIC_FULL_REFUND_512","refund.failed");
  assert.equal(reversal.status,200);
  assert.equal(reversal.body.result,"observed");
  const afterFailure=await pool.query(
    "SELECT state FROM public.us_c11_live_refund_requests WHERE request_id=$1",
    [idFull]
  );
  assert.equal(afterFailure.rows[0].state,"failed");
  const restored=await quote(512);
  assert.equal(restored.status,200);
  assert.equal(restored.body.remaining_minor,"1205");
});
