// US-PAY-C11 LIVE: one synthetic acceptance of real HTTP+PostgreSQL code.
// Stripe API transport injected locally; NEVER contacts real Stripe LIVE.
// The actual salon/master must later authenticate and consent themselves.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import pg from "pg";
import { buildUsPayC11LiveSellerRouter } from "../src/routes/internalUsPayC11LiveSeller.js";
import { buildPublicUsPayC11Router } from "../src/routes/publicUsPayC11.js";
import { verifyClientCabinetAccess } from "../src/services/clientCabinetTokenAccess.js";
import { TOTEM_US_CONNECT_PLATFORM } from "../src/services/usPayC11LiveStripeApi.js";

const connection=process.env.US_PAY_C11_TEST_DATABASE_URL||"";
if(!/^postgres:\/\/[^@]+@127\.0\.0\.1:55432\/us_pay_c11_staging$/.test(connection)) {
  throw new Error("US_C11_LIVE_OWNER_TEST_MUST_USE_DISPOSABLE_PG17");
}
const pool=new pg.Pool({connectionString:connection,max:4});
const testKey="sk_live_SYNTHETIC_NEVER_REAL_123456";
const accountIds=["acct_SYNTHETICSALON1234567","acct_SYNTHETICMASTER123456"];
let created=0;
const calls=[];
let platformCorrect=true;
let accountReady=false;
let accountBlocked=false;
const account=(id)=>({
  object:"account",id,type:"standard",country:accountBlocked?"CA":"US",
  livemode:true,charges_enabled:accountReady,payouts_enabled:accountReady,
  details_submitted:accountReady,
  capabilities:{card_payments:accountReady?"active":"pending",
    transfers:accountReady?"active":"pending"},
  requirements:{currently_due:[],past_due:[],disabled_reason:null},
});
const mockStripe=async (url,opts)=>{
  const path=new URL(url).pathname;
  const form=opts.body ? new URLSearchParams(opts.body) : null;
  calls.push({path,method:opts.method,idem:opts.headers["Idempotency-Key"]||null,
    type:form?.get("type")||null,account:form?.get("account")||null,
    redirect:opts.redirect});
  if (opts.headers.Authorization!=="Bearer "+testKey)
    throw new Error("LIVE_SECRET_UNEXPECTED");
  let data;
  if(path==="/v1/account" && opts.method==="GET"){
    data={object:"account",id:platformCorrect?TOTEM_US_CONNECT_PLATFORM:
      "acct_WRONGPLATFORM12345",country:"US",charges_enabled:true,
      capabilities:{card_payments:"active"}};
  } else if(path==="/v1/accounts" && opts.method==="POST"){
    assert.equal(form.get("type"),"standard");
    assert.equal(form.get("country"),"US");
    assert.equal(form.get("metadata[totem_market]"),"US");
    assert.equal(form.get("capabilities[card_payments][requested]"),"true");
    assert.ok(opts.headers["Idempotency-Key"]);
    data=account(accountIds[created++]);
  } else if(path==="/v1/account_links" && opts.method==="POST"){
    assert.equal(form.get("type"),"account_onboarding");
    assert.match(form.get("return_url"),/^https:\/\/app\.totemv\.com\/#\//);
    assert.match(form.get("refresh_url"),/^https:\/\/app\.totemv\.com\/#\//);
    data={object:"account_link",
      url:"https://connect.stripe.com/setup/s/synthetic-safe-only-123",
      expires_at:1940000000};
  } else if(/^\/v1\/accounts\/acct_/.test(path) && opts.method==="GET"){
    data=account(path.split("/").at(-1));
  } else {
    throw new Error("UNEXPECTED_STRIPE_CALL:"+path);
  }
  return {ok:true,status:200,json:async()=>data};
};

const auth={
  salon:{role:"salon_admin",source:"session",user_id:900,
    session_id:"00000000-0000-4000-8000-000000000900"},
  master:{role:"master",source:"session",user_id:901,
    session_id:"00000000-0000-4000-8000-000000000901"},
  kg:{role:"salon_admin",source:"session",user_id:902,
    session_id:"00000000-0000-4000-8000-000000000902"},
  disabled:{role:"salon_admin",source:"session",user_id:904,
    session_id:"00000000-0000-4000-8000-000000000904"},
  expired:{role:"salon_admin",source:"session",user_id:900,
    session_id:"00000000-0000-4000-8000-000000000905"},
};
const app=express();
app.use(express.json());
app.use("/internal",(req,_res,next)=>{
  req.auth=auth[String(req.get("x-synthetic-actor")||"")]||null;
  next();
},buildUsPayC11LiveSellerRouter(pool,{
  enabled:true,secretKey:testKey,fetchImpl:mockStripe,
}));
app.use("/public",buildPublicUsPayC11Router({
  pool,verifyClientCabinetAccess,
}));
let server,base;
before(async()=>{
  server=await new Promise(resolve=>{
    const listener=app.listen(0,"127.0.0.1",()=>resolve(listener));
  });
  base="http://127.0.0.1:"+server.address().port;
});
after(async()=>{
  if(server) await new Promise((resolve,reject)=>
    server.close(error=>error?reject(error):resolve()));
  await pool.end();
});
async function api({actor="salon",who="salon",id=100,method="GET",op="",body}={}){
  const r=await fetch(
    base+`/internal/us-pay-c11/live-connect/${who}/${id}${op}`,{
      method,
      headers:{"x-synthetic-actor":actor,"Content-Type":"application/json"},
      ...(body!==undefined?{body:JSON.stringify(body)}:{}),
    });
  return {status:r.status,body:await r.json()};
}

test("LIVE seller consent is mandatory; wrong role/tenant and KG/KZ denied BEFORE Stripe",async()=>{
  assert.equal((await api()).body.verification_status,"not_started");
  assert.equal((await api({method:"POST",op:"/start",body:{consent:false}})).status,400);
  assert.equal((await api({method:"POST",op:"/start",body:{
    consent:true,stripe_account_id:"acct_IGNORED1234",
  }})).status,400);
  for(const args of [
    {actor:"master",who:"salon",id:100},
    {actor:"salon",who:"master",id:200},
    {actor:"salon",who:"salon",id:101},
    {actor:"kg",who:"salon",id:101},
    {actor:"expired",who:"salon",id:100},
    {actor:"disabled",who:"salon",id:100},
    {actor:"master",who:"master",id:203},
  ]){
    const r=await api({...args,method:"POST",op:"/start",body:{consent:true}});
    assert.ok([403,404].includes(r.status),JSON.stringify(args)+":"+r.status);
  }
  assert.equal(calls.length,0); // unauthorized requests never reach LIVE Stripe
  assert.equal(calls.filter(c=>c.path==="/v1/accounts").length,0);
});

test("wrong Stripe platform is rejected without creating a seller binding",async()=>{
  platformCorrect=false;
  const r=await api({method:"POST",op:"/start",body:{consent:true}});
  assert.equal(r.status,503);
  platformCorrect=true;
  const rows=await pool.query("SELECT count(*)::int n FROM us_stripe_live_seller_bindings");
  assert.equal(rows.rows[0].n,0);
});

test("owner starts ONLY own salon Standard account, consent audited, repeated start doesn't duplicate",async()=>{
  const initial=await api({method:"POST",op:"/start",body:{consent:true}});
  assert.equal(initial.status,200);
  assert.equal(initial.body.owner_type,"salon");
  assert.equal(initial.body.stripe_mode,"LIVE");
  assert.equal(initial.body.payment_ready,false);
  assert.match(initial.body.onboarding_url,/^https:\/\/connect\.stripe\.com\//);
  assert.equal(initial.body.verification_status,"onboarding");
  assert.equal(calls.filter(c=>c.path==="/v1/accounts").length,1);
  const repeated=await api({method:"POST",op:"/start",body:{consent:true}});
  assert.equal(repeated.status,200);
  assert.equal(calls.filter(c=>c.path==="/v1/accounts").length,1);
  const stored=await pool.query(
    "SELECT owner_type,owner_id,verification_status,stripe_account_id FROM us_stripe_live_seller_bindings");
  assert.equal(stored.rows.length,1);
  assert.equal(stored.rows[0].owner_id,100);
  assert.equal(stored.rows[0].stripe_account_id,accountIds[0]);
  assert.equal(stored.rows[0].verification_status,"onboarding");
  const audit=await pool.query(
    "SELECT event FROM us_stripe_live_seller_events ORDER BY id");
  assert.deepEqual(audit.rows.map(x=>x.event),[
    "owner_consent","account_provisioned","onboarding_link_issued","onboarding_link_issued",
  ]);
});

test("a return URL alone does NOT verify seller or mark booking paid",async()=>{
  const status=await api();
  assert.equal(status.body.verified,false);
  assert.equal(status.body.payment_ready,false);
  const selection=await pool.query(
    "SELECT verification_status FROM us_booking_payment_collectors WHERE booking_id=510");
  assert.equal(selection.rows[0].verification_status,"pending");
});

test("owner refresh checks Stripe LIVE account; restricts account if not ready",async()=>{
  const r=await api({method:"POST",op:"/refresh"});
  assert.equal(r.status,200);
  assert.equal(r.body.verified,false);
  assert.equal(r.body.verification_status,"onboarding");
  const booking=await pool.query(
    "SELECT verification_status FROM us_booking_payment_collectors WHERE booking_id=510");
  assert.equal(booking.rows[0].verification_status,"pending");
});

test("LIVE Stripe capability verification authorizes already selected salon recipient, no payment",async()=>{
  accountReady=true;
  const verified=await api({method:"POST",op:"/refresh"});
  assert.equal(verified.status,200);
  assert.equal(verified.body.verified,true);
  assert.equal(verified.body.payment_ready,false);
  assert.equal(verified.body.charges_enabled,true);
  assert.equal((await api({method:"POST",op:"/start",body:{consent:true}})).status,409);

  const booking=await pool.query(
    "SELECT verification_status,verified_at FROM us_booking_payment_collectors WHERE booking_id=510");
  assert.equal(booking.rows[0].verification_status,"verified");
  assert.ok(booking.rows[0].verified_at);

  const publicResponse=await fetch(
    base+"/public/clients/55/synthetic-us-55/us-pay-c11/510");
  assert.equal(publicResponse.status,200);
  const body=await publicResponse.json();
  assert.equal(body.price.amount_minor,"1205");
  assert.equal(body.collector.owner_type,"salon");
  assert.equal(body.collector.verified,true);
  assert.equal(body.payment.provider,null);
  assert.equal(body.payment_ready,false);
});

test("master must consent personally; salon owner cannot create master's Stripe LIVE account",async()=>{
  const denied=await api({actor:"salon",who:"master",id:200,
    method:"POST",op:"/start",body:{consent:true}});
  assert.equal(denied.status,403);
  const r=await api({actor:"master",who:"master",id:200,
    method:"POST",op:"/start",body:{consent:true}});
  assert.equal(r.status,200);
  assert.equal(r.body.owner_type,"master");
  assert.equal(calls.filter(c=>c.path==="/v1/accounts").length,2);
  const refresh=await api({actor:"master",who:"master",id:200,
    method:"POST",op:"/refresh"});
  assert.equal(refresh.body.verified,true);
  const booking=await pool.query(
    "SELECT verification_status FROM us_booking_payment_collectors WHERE booking_id=511");
  assert.equal(booking.rows[0].verification_status,"verified");
});

test("loss of Stripe capability fails closed and revokes visible LIVE merchant verification",async()=>{
  accountBlocked=true;
  const r=await api({method:"POST",op:"/refresh"});
  assert.equal(r.status,200);
  assert.equal(r.body.verified,false);
  assert.equal(r.body.verification_status,"restricted");
  const booking=await pool.query(
    "SELECT verification_status FROM us_booking_payment_collectors WHERE booking_id=510");
  assert.equal(booking.rows[0].verification_status,"pending");
  const pub=await fetch(base+"/public/clients/55/synthetic-us-55/us-pay-c11/510");
  const json=await pub.json();
  assert.equal(json.collector,null);
  assert.equal(json.payment_ready,false);
});

test("owner consent and binding identity are immutable; KG/KZ untouched",async()=>{
  await assert.rejects(pool.query(
    "UPDATE us_stripe_live_seller_bindings SET owner_id=101 WHERE owner_id=100"
  ),e=>e.code==="23514");
  await assert.rejects(pool.query(
    "DELETE FROM us_stripe_live_seller_events WHERE event='owner_consent'"
  ),e=>e.code==="23514");
  const all=await pool.query(
    "SELECT owner_type,owner_id,stripe_mode FROM us_stripe_live_seller_bindings ORDER BY owner_type");
  assert.equal(all.rows.length,2);
  assert.ok(all.rows.every(r=>r.stripe_mode==="LIVE"));
  const unaffected=await pool.query(
    "SELECT count(*)::int AS n FROM public.us_booking_payment_collectors WHERE market_id IN (1,2)");
  assert.equal(unaffected.rows[0].n,0);
});
