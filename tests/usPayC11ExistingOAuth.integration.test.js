// US-PAY-C11 existing-merchant OAuth contract, ONE disposable PG17 scenario.
// NEVER contacts Stripe LIVE and NEVER creates an actual Stripe/salon/master.
// Reuses existing synthetic local CI owner. Account authorization mocked.
// Real merchant sign-off is explicitly deferred until a genuine US seller.
import test,{before,after} from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import express from "express";
import pg from "pg";
import {
  buildUsPayC11LiveSellerRouter,
} from "../src/routes/internalUsPayC11LiveSeller.js";
import {
  buildUsPayC11LiveExistingOAuthCallback,
} from "../src/routes/usPayC11LiveExistingOAuth.js";
import {
  TOTEM_US_CONNECT_PLATFORM,
} from "../src/services/usPayC11LiveStripeApi.js";
import {
  US_CONNECT_LIVE_OAUTH_CALLBACK,
} from "../src/services/usPayC11LiveExistingOAuth.service.js";

const uri=process.env.US_PAY_C11_TEST_DATABASE_URL||"";
if(!/^postgres:\/\/[^@]+@127\.0\.0\.1:55432\/us_pay_c11_staging$/.test(uri) ||
   process.env.US_PAY_C11_LIVE_OAUTH_TEST!=="synthetic-only") {
  throw new Error("US_C11_OAUTH_TEST_DISPOSABLE_PG17_ONLY");
}
const pool=new pg.Pool({connectionString:uri,max:4});
const secret="sk_live_SYNTHETIC_NOT_A_REAL_STRIPE_KEY_1234";
const oauthClientId="ca_SYNTHETICLIVECLIENTID123456";
const accountId="acct_EXISTINGUSA123456789";
let tokenExchanges=0,stripeAccountCreations=0;
const stripeTransport=async(url,options)=>{
  const u=new URL(url);
  if(u.hostname==="api.stripe.com"&&u.pathname==="/v1/account") {
    assert.equal(options.method,"GET");
    return {ok:true,json:async()=>({
      object:"account",id:TOTEM_US_CONNECT_PLATFORM,country:"US",
      charges_enabled:true,capabilities:{card_payments:"active"},
    })};
  }
  if(u.hostname==="connect.stripe.com"&&u.pathname==="/oauth/token") {
    tokenExchanges++;
    assert.equal(options.method,"POST");
    assert.equal(options.redirect,"error");
    assert.equal(options.headers.Authorization,
      "Basic "+Buffer.from(secret+":").toString("base64"));
    const form=new URLSearchParams(options.body);
    assert.equal(form.get("grant_type"),"authorization_code");
    assert.equal(form.get("code"),"ac_EXPLICITSELLERCONSENT123456789");
    return {ok:true,json:async()=>({
      stripe_user_id:accountId,livemode:true,scope:"read_write",
      access_token:"sk_live_SYNTHETIC_TOKEN_NOT_STORED",
      refresh_token:"rt_SYNTHETIC_NOT_STORED",
    })};
  }
  if(u.hostname==="api.stripe.com" &&
     u.pathname==="/v1/accounts/"+accountId) {
    return {ok:true,json:async()=>({
      id:accountId,object:"account",type:"standard",country:"US",
      livemode:true,charges_enabled:true,payouts_enabled:true,
      details_submitted:true,
      capabilities:{card_payments:"active",transfers:"active"},
      requirements:{currently_due:[],past_due:[],disabled_reason:null},
    })};
  }
  if(u.pathname==="/v1/accounts"&&options.method==="POST") {
    stripeAccountCreations++;
  }
  throw Error("STRIPE_TRANSPORT_UNEXPECTED");
};
const auth={
  owner:{role:"salon_admin",source:"session",user_id:900,
    session_id:"00000000-0000-4000-8000-000000000900"},
  other:{role:"salon_admin",source:"session",user_id:902,
    session_id:"00000000-0000-4000-8000-000000000902"},
  master:{role:"master",source:"session",user_id:901,
    session_id:"00000000-0000-4000-8000-000000000901"},
};
const app=express();
app.use(express.json());
app.use("/internal",(req,_res,next)=>{
  req.auth=auth[req.get("X-C11-Test-Actor")]||null;
  next();
},buildUsPayC11LiveSellerRouter(pool,{
  enabled:true,oauthEnabled:true,secretKey:secret,
  oauthClientId,fetchImpl:stripeTransport,
}));
app.get("/stripe/connect/us-pay-c11/live/oauth/callback",
  buildUsPayC11LiveExistingOAuthCallback({
    pool,enabled:true,secretKey:secret,
    clientId:oauthClientId,fetchImpl:stripeTransport,
  }));
let server,base;
before(async()=>{
  // ONLY disposable CI database. Existing fake owner is retained from SQL
  // fixture; never create a fake account in LIVE Stripe or TOTEM PROD.
  await pool.query(
    "TRUNCATE public.us_stripe_live_seller_bindings RESTART IDENTITY CASCADE"
  );
  await pool.query(
    `UPDATE public.us_booking_payment_collectors
        SET verification_status='pending',verified_at=NULL
      WHERE booking_id IN (510,511)`
  );
  server=await new Promise(resolve=>{
    const listener=app.listen(0,"127.0.0.1",()=>resolve(listener));
  });
  base="http://127.0.0.1:"+server.address().port;
});
after(async()=>{
  if(server) await new Promise((resolve,reject)=>
    server.close(e=>e?reject(e):resolve()));
  await pool.end();
});
async function start(actor="owner",body={consent:true},owner=100){
  const r=await fetch(
    base+`/internal/us-pay-c11/live-connect/salon/${owner}/oauth/start`,{
      method:"POST",
      headers:{"Content-Type":"application/json","X-C11-Test-Actor":actor},
      body:JSON.stringify(body),
    });
  return {status:r.status,body:await r.json()};
}
async function callback(query){
  const u=new URL(base+"/stripe/connect/us-pay-c11/live/oauth/callback");
  for(const [k,v] of Object.entries(query))u.searchParams.set(k,v);
  const r=await fetch(u,{redirect:"manual"});
  return {status:r.status,location:r.headers.get("location")};
}

test("OAuth existing seller requires actual owner consent; no forged owner or client account",async()=>{
  assert.equal((await start("owner",{consent:false})).status,400);
  assert.equal((await start("owner",{consent:true,stripe_account_id:accountId})).status,400);
  assert.equal((await start("other",{consent:true},100)).status,404);
  assert.equal((await start("master",{consent:true},100)).status,404);
  assert.equal((await start("other",{consent:true},101)).status,404); // KG
  assert.equal(stripeAccountCreations,0);
});

test("state is securely random and only its hash is stored; denial consumes once",async()=>{
  const r=await start();
  assert.equal(r.status,200);
  assert.equal(r.body.payment_ready,false);
  const u=new URL(r.body.oauth_authorize_url);
  assert.equal(u.origin,"https://connect.stripe.com");
  assert.equal(u.pathname,"/oauth/authorize");
  assert.equal(u.searchParams.get("client_id"),oauthClientId);
  assert.equal(u.searchParams.get("scope"),"read_write");
  assert.equal(u.searchParams.get("redirect_uri"),US_CONNECT_LIVE_OAUTH_CALLBACK);
  const state=u.searchParams.get("state");
  assert.match(state,/^[A-Za-z0-9_-]{43}$/);
  const rows=await pool.query(
    "SELECT state_hash,result FROM public.us_stripe_live_oauth_attempts ORDER BY created_at"
  );
  assert.equal(rows.rows.length,1);
  assert.equal(rows.rows[0].state_hash,
    createHash("sha256").update(state).digest("hex"));
  assert.equal(rows.rows[0].result,"pending");

  const denied=await callback({state,error:"access_denied"});
  assert.equal(denied.status,303);
  assert.match(denied.location,/us_connect=denied$/);
  assert.equal((await callback({state,code:"ac_EXPLICITSELLERCONSENT123456789"}))
    .location,"https://app.totemv.com/");
  assert.equal(tokenExchanges,0);
});

test("real Stripe account not created: existing seller owner authorizes once",async()=>{
  const r=await start();
  assert.equal(r.status,200);
  const state=new URL(r.body.oauth_authorize_url).searchParams.get("state");
  const forged=await callback({
    state:"A".repeat(43),
    code:"ac_EXPLICITSELLERCONSENT123456789",
  });
  assert.equal(forged.location,"https://app.totemv.com/");
  assert.equal(tokenExchanges,0);

  const linked=await callback({
    state,code:"ac_EXPLICITSELLERCONSENT123456789",
  });
  assert.equal(linked.status,303);
  assert.match(linked.location,/us_connect=linked$/);
  assert.equal(tokenExchanges,1);
  assert.equal(stripeAccountCreations,0);
  assert.doesNotMatch(linked.location,/ac_|state=|acct_|oauth\/token/);

  const saved=await pool.query(
    `SELECT stripe_account_id,connection_method,verification_status,
            charges_enabled FROM public.us_stripe_live_seller_bindings
       WHERE owner_type='salon' AND owner_id=100`
  );
  assert.equal(saved.rows.length,1);
  assert.equal(saved.rows[0].stripe_account_id,accountId);
  assert.equal(saved.rows[0].connection_method,"oauth_existing");
  assert.equal(saved.rows[0].verification_status,"verified");
  assert.equal(saved.rows[0].charges_enabled,true);
  const consent=await pool.query(
    `SELECT event FROM public.us_stripe_live_seller_events
       ORDER BY id`
  );
  assert.ok(consent.rows.some(x=>x.event==="owner_consent"));
  assert.ok(consent.rows.some(x=>x.event==="account_provisioned"));
  const linkedBooking=await pool.query(
    `SELECT verification_status FROM public.us_booking_payment_collectors
       WHERE booking_id=510`
  );
  assert.equal(linkedBooking.rows[0].verification_status,"verified");

  const replay=await callback({
    state,code:"ac_EXPLICITSELLERCONSENT123456789",
  });
  assert.equal(replay.location,"https://app.totemv.com/");
  assert.equal(tokenExchanges,1);
  assert.equal(stripeAccountCreations,0);
});

test("a bound existing Standard account cannot be duplicated using new signup",async()=>{
  const r=await fetch(
    base+"/internal/us-pay-c11/live-connect/salon/100/start",{
      method:"POST",
      headers:{"Content-Type":"application/json","X-C11-Test-Actor":"owner"},
      body:JSON.stringify({consent:true}),
    });
  assert.equal(r.status,409);
  assert.equal((await r.json()).error,"US_CONNECT_SELLER_ALREADY_VERIFIED");
  assert.equal(stripeAccountCreations,0);
});

test("existing OAuth never persists access/refresh tokens, legacy payment still disabled",async()=>{
  const rows=await pool.query(
    `SELECT state_hash,result,stripe_account_id FROM public.us_stripe_live_oauth_attempts
       WHERE result='linked'`
  );
  assert.equal(rows.rows.length,1);
  assert.equal(rows.rows[0].stripe_account_id,accountId);
  const tableColumns=await pool.query(
    `SELECT column_name FROM information_schema.columns
       WHERE table_schema='public'
         AND table_name='us_stripe_live_oauth_attempts'`
  );
  for(const col of ["access_token","refresh_token","authorization_code"]){
    assert.equal(tableColumns.rows.some(x=>x.column_name===col),false);
  }
  assert.equal(stripeAccountCreations,0);
});
